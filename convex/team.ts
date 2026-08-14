import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { logAudit, requireRole } from "./lib/access";

/** Team roster with monthly salaries — feeds payroll into the expense ledger. */

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "manager");
    const members = await ctx.db.query("teamMembers").collect();
    return members.sort((a, b) =>
      a.active === b.active ? a.name.localeCompare(b.name) : a.active ? -1 : 1,
    );
  },
});

export const upsert = mutation({
  args: {
    id: v.optional(v.id("teamMembers")),
    name: v.string(),
    position: v.string(),
    salary: v.number(),
    active: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...fields }) => {
    const actor = await requireRole(ctx, "manager");
    if (fields.salary < 0) throw new Error("Salary can't be negative");
    if (id) {
      const before = await ctx.db.get(id);
      await ctx.db.patch(id, fields);
      await logAudit(ctx, actor, {
        action: "team.update",
        entity: "teamMembers",
        entityId: id,
        summary: `Updated team member ${fields.name}`,
        before,
        after: fields,
      });
      return id;
    }
    const newId = await ctx.db.insert("teamMembers", fields);
    await logAudit(ctx, actor, {
      action: "team.create",
      entity: "teamMembers",
      entityId: newId,
      summary: `Added team member ${fields.name} (${fields.position})`,
      after: fields,
    });
    return newId;
  },
});

export const remove = mutation({
  args: { id: v.id("teamMembers") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "manager");
    const member = await ctx.db.get(args.id);
    if (!member) return;
    await ctx.db.delete(args.id);
    await logAudit(ctx, actor, {
      action: "team.delete",
      entity: "teamMembers",
      entityId: args.id,
      summary: `Removed team member ${member.name}`,
      before: member,
    });
  },
});

/**
 * One click: book this month's payroll (sum of active salaries) as a fixed
 * expense. Guarded so the same month can't be booked twice.
 */
export const recordPayroll = mutation({
  args: { month: v.string() }, // "YYYY-MM"
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "manager");
    if (!/^\d{4}-\d{2}$/.test(args.month)) throw new Error("Invalid month");
    const marker = `[Payroll ${args.month}]`;
    const expenses = await ctx.db.query("expenses").collect();
    if (expenses.some((e) => e.description.startsWith(marker))) {
      throw new Error(`Payroll for ${args.month} is already recorded`);
    }
    const members = (await ctx.db.query("teamMembers").collect()).filter(
      (m) => m.active && m.salary > 0,
    );
    const total = members.reduce((s, m) => s + m.salary, 0);
    if (total <= 0) throw new Error("No active team members with a salary");
    // One expense line per person, so exports show exactly who was paid what.
    let firstId = null;
    for (const member of members) {
      const today = new Date().toISOString().slice(0, 10);
      const id = await ctx.db.insert("expenses", {
        category: "salary",
        kind: "fixed",
        amount: Math.round(member.salary * 100) / 100,
        currency: "EUR",
        // Booked today if we're inside that month, else on the month's 28th
        date: today.startsWith(args.month) ? today : `${args.month}-28`,
        description: `${marker} ${member.name} — ${member.position}`,
        recordedBy: actor._id,
      });
      firstId ??= id;
    }
    await logAudit(ctx, actor, {
      action: "expense.payroll",
      entity: "expenses",
      entityId: firstId!,
      summary: `Payroll ${args.month}: €${total.toFixed(2)} across ${members.length} team members`,
      after: { month: args.month, total, members: members.length },
    });
    return { total, members: members.length };
  },
});

/** Payroll bookings inside a date range, grouped by month — for tracking. */
export const payrollHistory = query({
  args: { start: v.string(), end: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, "manager");
    const expenses = await ctx.db.query("expenses").collect();
    // Match by payroll MONTH (from the marker), not the expense date — a
    // payroll booked mid-month must show for any range touching that month.
    const startMonth = args.start.slice(0, 7);
    const endMonth = args.end.slice(0, 7);
    const lines = expenses.filter((e) => {
      if (!e.description.startsWith("[Payroll ")) return false;
      const month = e.description.slice("[Payroll ".length, "[Payroll ".length + 7);
      return month >= startMonth && month <= endMonth;
    });
    const byMonth = new Map<string, { total: number; members: number }>();
    for (const line of lines) {
      const month = line.description.slice("[Payroll ".length, "[Payroll ".length + 7);
      const entry = byMonth.get(month) ?? { total: 0, members: 0 };
      entry.total += line.amount;
      // New bookings: one line per member. Legacy bookings were a single
      // aggregated line "…] N team members" — read N from the text.
      const legacy = line.description.match(/\]\s*(\d+) team member/);
      entry.members += legacy ? Number(legacy[1]) : 1;
      byMonth.set(month, entry);
    }
    return [...byMonth.entries()]
      .map(([month, data]) => ({
        month,
        total: Math.round(data.total * 100) / 100,
        members: data.members,
      }))
      .sort((a, b) => b.month.localeCompare(a.month));
  },
});


/** One-off fix: payroll lines dated in the future (old 28th rule) → today. */
export const fixPayrollDates = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = new Date().toISOString().slice(0, 10);
    const expenses = await ctx.db.query("expenses").collect();
    let n = 0;
    for (const e of expenses) {
      if (e.description.startsWith("[Payroll ") && e.date > today) {
        await ctx.db.patch(e._id, { date: today });
        n++;
      }
    }
    return `Re-dated ${n} payroll line(s) to ${today}.`;
  },
});
