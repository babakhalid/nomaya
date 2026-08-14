import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { format, startOfMonth } from "date-fns";
import { Plus, Trash, UsersThree, Wallet } from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  Field,
  Input,
  Select,
  SkeletonRows,
  Textarea,
  cx,
} from "../components/ui";
import RangePicker from "../components/RangePicker";
import { errorMessage, toast } from "../components/toast";
import { downloadCsv, eur, isoToday, prettyDate } from "../lib/format";

const CATEGORIES = [
  "salary",
  "rent",
  "coaches",
  "staff",
  "food",
  "equipment",
  "maintenance",
  "transport",
  "utilities",
  "other",
] as const;

/** Sensible default: recurring cost categories start as fixed. */
const DEFAULT_KIND: Record<string, "fixed" | "variable"> = {
  salary: "fixed",
  rent: "fixed",
  coaches: "fixed",
  staff: "fixed",
};

export default function TeamExpensesPage() {
  const [start, setStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [end, setEnd] = useState(isoToday());
  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Team & expenses</h1>
          <p className="mt-1 text-sm text-ink-faint">
            Who's on the payroll and where the money goes — fixed and variable.
          </p>
        </div>
      </header>
      <div className="mb-8">
        <RangePicker
          start={start}
          end={end}
          onChange={(s, e) => {
            setStart(s);
            setEnd(e);
          }}
        />
      </div>
      <TeamSection start={start} end={end} />
      <ExpensesSection start={start} end={end} />
    </div>
  );
}

// ── Team ────────────────────────────────────────────────────────────────

function TeamSection({ start, end }: { start: string; end: string }) {
  const members = useQuery(api.team.list);
  const payroll = useQuery(api.team.payrollHistory, { start, end });
  const upsert = useMutation(api.team.upsert);
  const remove = useMutation(api.team.remove);
  const recordPayroll = useMutation(api.team.recordPayroll);
  const [editing, setEditing] = useState<"new" | Id<"teamMembers"> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Id<"teamMembers"> | null>(null);
  const editingItem = members?.find((m) => m._id === editing);

  const month = format(startOfMonth(new Date()), "yyyy-MM");
  const activeMembers = members?.filter((m) => m.active) ?? [];
  const payrollTotal = activeMembers.reduce((s, m) => s + m.salary, 0);

  return (
    <section className="mb-12">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
          <UsersThree size={16} weight="duotone" /> Team
        </h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={payrollTotal <= 0}
            onClick={async () => {
              try {
                const res = await recordPayroll({ month });
                toast(
                  "success",
                  `Payroll ${month} booked: ${eur(res.total)} for ${res.members} people.`,
                );
              } catch (err) {
                toast("error", errorMessage(err, "Could not record payroll."));
              }
            }}
          >
            <Wallet size={14} weight="duotone" />
            Record {month} payroll ({eur(payrollTotal)})
          </Button>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus size={14} weight="bold" /> Team member
          </Button>
        </div>
      </div>

      <div
        className="overflow-x-auto rounded-xl2 border border-sand-200 bg-white"
        style={{ boxShadow: "var(--shadow-diffuse)" }}
      >
        {members === undefined ? (
          <div className="p-4">
            <SkeletonRows count={3} />
          </div>
        ) : members.length === 0 ? (
          <EmptyState
            icon={<UsersThree size={22} weight="duotone" />}
            title="No team members yet"
            hint="Add your crew, coaches and staff with their monthly salary."
          />
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-sand-200 text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Position</th>
                <th className="px-5 py-3 text-right font-semibold">Salary / month</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {members.map((member) => (
                <tr key={member._id} className="transition-colors hover:bg-sand-50">
                  <td className="px-5 py-3 font-semibold">{member.name}</td>
                  <td className="px-5 py-3 text-ink-soft">{member.position}</td>
                  <td className="num px-5 py-3 text-right font-bold">{eur(member.salary)}</td>
                  <td className="px-5 py-3">
                    {member.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {confirmDelete === member._id ? (
                      <span className="flex items-center justify-end gap-2 text-xs font-semibold">
                        <button
                          onClick={async () => {
                            try {
                              await remove({ id: member._id });
                              toast("success", `${member.name} removed from the team.`);
                            } catch (err) {
                              toast("error", errorMessage(err, "Could not remove the member."));
                            }
                            setConfirmDelete(null);
                          }}
                          className="rounded-lg bg-coral px-2.5 py-1 text-sand-50 cursor-pointer"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-ink-faint hover:text-ink cursor-pointer"
                        >
                          Keep
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => setEditing(member._id)}
                          className="text-xs font-semibold text-ocean-700 hover:underline cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setConfirmDelete(member._id)}
                          className="text-ink-faint transition-colors hover:text-coral cursor-pointer"
                          aria-label={`Delete ${member.name}`}
                        >
                          <Trash size={15} />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Payroll booked inside the selected period */}
      <div className="mt-4 rounded-xl2 border border-sand-200 bg-white px-5 py-4" style={{ boxShadow: "var(--shadow-diffuse)" }}>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">
          Payroll in this period
        </p>
        {payroll === undefined ? (
          <SkeletonRows count={1} />
        ) : payroll.length === 0 ? (
          <p className="text-sm text-ink-faint">
            No payroll booked in this period — use the button above.
          </p>
        ) : (
          <ul className="divide-y divide-sand-100">
            {payroll.map((row) => (
              <li key={row.month} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="num font-semibold">{row.month}</span>
                <span className="text-ink-faint">
                  {row.members} member{row.members === 1 ? "" : "s"} paid
                </span>
                <span className="num font-bold">{eur(row.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editingItem ? `Edit ${editingItem.name}` : "New team member"}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            try {
              await upsert({
                id: editingItem?._id,
                name: String(form.get("name")),
                position: String(form.get("position")),
                salary: Number(form.get("salary")),
                active: form.get("active") === "on",
                notes: String(form.get("notes")) || undefined,
              });
              toast("success", editingItem ? "Team member updated." : "Team member added.");
              setEditing(null);
            } catch (err) {
              toast("error", errorMessage(err, "Could not save the team member."));
            }
          }}
        >
          <Field label="Full name">
            <Input name="name" defaultValue={editingItem?.name} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Position">
              <Input
                name="position"
                defaultValue={editingItem?.position}
                placeholder="Surf coach, cleaner, cook…"
                required
              />
            </Field>
            <Field label="Salary / month (EUR)">
              <Input
                name="salary"
                type="number"
                min={0}
                step="0.01"
                defaultValue={editingItem?.salary}
                required
              />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea name="notes" defaultValue={editingItem?.notes} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={editingItem?.active ?? true} />
            Active (counted in payroll)
          </label>
          <Button type="submit">{editingItem ? "Save" : "Add member"}</Button>
        </form>
      </Drawer>
    </section>
  );
}

// ── Expenses ────────────────────────────────────────────────────────────

function ExpensesSection({ start, end }: { start: string; end: string }) {
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<string>("food");
  const expenses = useQuery(api.payments.expensesInRange, { start, end });
  const recordExpense = useMutation(api.payments.recordExpense);
  const removeExpense = useMutation(api.payments.removeExpense);

  const total = expenses?.reduce((s, e) => s + e.amount, 0) ?? 0;
  const fixed = expenses?.filter((e) => e.kind === "fixed").reduce((s, e) => s + e.amount, 0) ?? 0;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
          <Wallet size={16} weight="duotone" /> Expense ledger
        </h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              expenses &&
              downloadCsv(
                `expenses_${start}_${end}.csv`,
                expenses.map((e) => ({
                  date: e.date,
                  category: e.category,
                  kind: e.kind ?? "variable",
                  description: e.description,
                  amount: e.amount,
                })),
              )
            }
          >
            Export CSV
          </Button>
          <Button size="sm" onClick={() => setShowForm((s) => !s)}>
            <Plus size={14} weight="bold" /> Add expense
          </Button>
        </div>
      </div>

      {showForm && (
        <form
          className="mb-4 grid grid-cols-1 items-end gap-3 rounded-xl2 border border-sand-200 bg-white p-4 md:grid-cols-3 xl:flex xl:flex-wrap xl:[&>*]:min-w-36"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            try {
              await recordExpense({
                category: form.get("category") as (typeof CATEGORIES)[number],
                kind: form.get("kind") as "fixed" | "variable",
                customLabel: String(form.get("customLabel") ?? "") || undefined,
                amount: Number(form.get("amount")),
                date: String(form.get("date")),
                description: String(form.get("description")),
              });
              toast("success", "Expense recorded.");
              setShowForm(false);
            } catch (err) {
              toast("error", errorMessage(err, "Could not record the expense."));
            }
          }}
        >
          <Field label="Category">
            <Select
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type">
            <Select name="kind" key={category} defaultValue={DEFAULT_KIND[category] ?? "variable"}>
              <option value="fixed">Fixed (monthly)</option>
              <option value="variable">Variable</option>
            </Select>
          </Field>
          {category === "other" && (
            <Field label="Title">
              <Input name="customLabel" required placeholder="Name this expense…" />
            </Field>
          )}
          <Field label="Amount (EUR)">
            <Input name="amount" type="number" step="0.01" min="0.01" required />
          </Field>
          <Field label="Description">
            <Input name="description" required placeholder="What was it for?" />
          </Field>
          <Field label="Date">
            <Input name="date" type="date" defaultValue={isoToday()} required />
          </Field>
          <Button type="submit">Save</Button>
        </form>
      )}

      <div
        className="overflow-x-auto rounded-xl2 border border-sand-200 bg-white"
        style={{ boxShadow: "var(--shadow-diffuse)" }}
      >
        {expenses === undefined ? (
          <div className="p-4">
            <SkeletonRows count={3} />
          </div>
        ) : expenses.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-faint">
            No expenses in this range.
          </p>
        ) : (
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-sand-200 text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Category</th>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">Description</th>
                <th className="px-5 py-3 text-right font-semibold">Amount</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {expenses.map((expense) => (
                <tr key={expense._id} className="transition-colors hover:bg-sand-50">
                  <td className="num px-5 py-3 text-ink-soft">{prettyDate(expense.date)}</td>
                  <td className="px-5 py-3 capitalize">
                    {expense.category === "other" && expense.customLabel
                      ? expense.customLabel
                      : expense.category}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={cx(
                        "rounded-full px-2.5 py-0.5 text-xs font-bold",
                        expense.kind === "fixed"
                          ? "bg-ocean-50 text-ocean-800"
                          : "bg-sand-100 text-ink-soft",
                      )}
                    >
                      {expense.kind === "fixed" ? "Fixed" : "Variable"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-ink-soft">{expense.description}</td>
                  <td className="num px-5 py-3 text-right font-bold">{eur(expense.amount)}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={async () => {
                        try {
                          await removeExpense({ expenseId: expense._id });
                          toast("success", "Expense deleted.");
                        } catch (err) {
                          toast("error", errorMessage(err, "Could not delete the expense."));
                        }
                      }}
                      className="text-ink-faint transition-colors hover:text-coral cursor-pointer"
                      aria-label="Delete expense"
                    >
                      <Trash size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-sand-200 bg-sand-50 text-sm font-bold">
                <td colSpan={4} className="px-5 py-3">
                  Total · <span className="font-normal text-ink-faint">fixed {eur(fixed)} · variable {eur(total - fixed)}</span>
                </td>
                <td className="num px-5 py-3 text-right">{eur(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </section>
  );
}
