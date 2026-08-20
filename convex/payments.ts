import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logAudit, requireRole, requireUser } from "./lib/access";

export const record = mutation({
  args: {
    bookingId: v.id("bookings"),
    amount: v.number(),
    method: v.union(
      v.literal("cash"),
      v.literal("bank_transfer"),
      v.literal("card"),
      v.literal("ota_payout"),
    ),
    direction: v.union(v.literal("in"), v.literal("refund")),
    date: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "manager");
    if (args.amount <= 0) throw new Error("Amount must be positive");
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    const id = await ctx.db.insert("payments", {
      ...args,
      currency: "EUR",
      recordedBy: actor._id,
    });
    const guest = await ctx.db.get(booking.guestId);
    await logAudit(ctx, actor, {
      action: args.direction === "in" ? "payment.record" : "payment.refund",
      entity: "payments",
      entityId: id,
      summary: `${args.direction === "in" ? "Received" : "Refunded"} €${args.amount.toFixed(2)} (${args.method.replace("_", " ")}) — ${guest?.fullName}`,
      after: args,
    });
    return id;
  },
});

export const remove = mutation({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "manager");
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) return;
    await ctx.db.delete(args.paymentId);
    await logAudit(ctx, actor, {
      action: "payment.delete",
      entity: "payments",
      entityId: args.paymentId,
      summary: `Deleted payment of €${payment.amount.toFixed(2)}`,
      before: payment,
    });
  },
});

export const inRange = query({
  args: { start: v.string(), end: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const payments = await ctx.db.query("payments").collect();
    const visible = payments.filter(
      (p) => p.date >= args.start && p.date <= args.end,
    );
    const enriched = await Promise.all(
      visible.map(async (p) => {
        const booking = await ctx.db.get(p.bookingId);
        const guest = booking ? await ctx.db.get(booking.guestId) : null;
        return { ...p, guestName: guest?.fullName ?? "Unknown" };
      }),
    );
    return enriched.sort((a, b) => b.date.localeCompare(a.date));
  },
});

// ── Expenses ───────────────────────────────────────────────────────────

export const recordExpense = mutation({
  args: {
    category: v.union(
      v.literal("food"),
      v.literal("staff"),
      v.literal("equipment"),
      v.literal("maintenance"),
      v.literal("transport"),
      v.literal("utilities"),
      v.literal("salary"),
      v.literal("rent"),
      v.literal("coaches"),
      v.literal("other"),
    ),
    kind: v.optional(v.union(v.literal("fixed"), v.literal("variable"))),
    customLabel: v.optional(v.string()),
    amount: v.number(),
    date: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "manager");
    if (args.amount <= 0) throw new Error("Amount must be positive");
    if (args.category === "other" && !args.customLabel?.trim()) {
      throw new Error("Give this expense a title so it's recognisable later");
    }
    const id = await ctx.db.insert("expenses", {
      ...args,
      currency: "EUR",
      recordedBy: actor._id,
    });
    await logAudit(ctx, actor, {
      action: "expense.record",
      entity: "expenses",
      entityId: id,
      summary: `Expense €${args.amount.toFixed(2)} (${args.category}): ${args.description}`,
      after: args,
    });
    return id;
  },
});

export const removeExpense = mutation({
  args: { expenseId: v.id("expenses") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "manager");
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) return;
    await ctx.db.delete(args.expenseId);
    await logAudit(ctx, actor, {
      action: "expense.delete",
      entity: "expenses",
      entityId: args.expenseId,
      summary: `Deleted expense €${expense.amount.toFixed(2)} (${expense.category})`,
      before: expense,
    });
  },
});

export const expensesInRange = query({
  args: { start: v.string(), end: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, "manager");
    const expenses = await ctx.db.query("expenses").collect();
    return expenses
      .filter((e) => e.date >= args.start && e.date <= args.end)
      .sort((a, b) => b.date.localeCompare(a.date));
  },
});

/** Bookings with outstanding balances — the "who still owes us" list. */
export const outstanding = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const bookings = await ctx.db.query("bookings").collect();
    const active = bookings.filter(
      (b) => b.status !== "cancelled" && b.status !== "no_show",
    );
    const results = [];
    for (const booking of active) {
      const pays = await ctx.db
        .query("payments")
        .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
        .collect();
      const paid = pays.reduce(
        (sum, p) => sum + (p.direction === "in" ? p.amount : -p.amount),
        0,
      );
      const balance = booking.totalAmount - paid;
      if (balance > 0.005) {
        const guest = await ctx.db.get(booking.guestId);
        results.push({
          bookingId: booking._id,
          guestName: guest?.fullName ?? "Unknown",
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          status: booking.status,
          total: booking.totalAmount,
          paid,
          balance,
        });
      }
    }
    return results.sort((a, b) => b.balance - a.balance);
  },
});
