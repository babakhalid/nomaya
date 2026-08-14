import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  CaretLeft,
  CaretRight,
  Copy,
  Check,
  FilePdf,
  ForkKnife,
  MagnifyingGlass,
  PencilSimple,
  UsersThree,
} from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import { errorMessage } from "../components/toast";
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
  STATUS_TONE,
  Textarea,
  cx,
} from "../components/ui";
import { eur, prettyDate, SOURCE_LABELS, STATUS_LABELS } from "../lib/format";
import BookingDetailDrawer from "../components/calendar/BookingDetailDrawer";
import { downloadBookingConfirmation } from "../lib/bookingConfirmationPdf";

const PAGE_SIZE = 10;

export default function GuestsPage() {
  const [search, setSearchRaw] = useState("");
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState<"current" | "archive">("current");
  const [openGuestId, setOpenGuestId] = useState<Id<"guests"> | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const guests = useQuery(api.guestDirectory.list, { search: search || undefined, today });

  const setSearch = (value: string) => {
    setSearchRaw(value);
    setPage(0);
  };

  const filtered = useMemo(
    () => guests?.filter((g) => (tab === "current" ? g.current : !g.current)),
    [guests, tab],
  );
  const currentCount = guests?.filter((g) => g.current).length ?? 0;
  const archiveCount = guests ? guests.length - currentCount : 0;
  const pageCount = filtered ? Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () => filtered?.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [filtered, safePage],
  );

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Guest book</h1>
          <p className="mt-1 text-sm text-ink-faint">
            Everyone who ever stayed — click a guest for their full story.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <MagnifyingGlass
            size={15}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, country…"
            className="pl-9"
          />
        </div>
      </header>

      <div className="mb-4 inline-flex rounded-xl border border-sand-200 bg-white p-1">
        {(
          [
            { key: "current", label: "Current & upcoming", count: currentCount },
            { key: "archive", label: "Archive", count: archiveCount },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setPage(0);
            }}
            className={cx(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors cursor-pointer",
              tab === t.key ? "bg-ocean-700 text-sand-50" : "text-ink-soft hover:bg-sand-100",
            )}
          >
            {t.label}
            <span
              className={cx(
                "num rounded-full px-2 py-0.5 text-[11px]",
                tab === t.key ? "bg-white/20" : "bg-sand-100 text-ink-faint",
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div
        className="overflow-hidden rounded-xl2 border border-sand-200 bg-white"
        style={{ boxShadow: "var(--shadow-diffuse)" }}
      >
        {guests === undefined ? (
          <div className="p-4">
            <SkeletonRows count={6} />
          </div>
        ) : (filtered?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<UsersThree size={22} weight="duotone" />}
            title={
              search
                ? "No guests match"
                : tab === "current"
                  ? "No current or upcoming guests"
                  : "No archived guests yet"
            }
            hint={
              search
                ? "Try another name, email or country."
                : tab === "current"
                  ? "Guests appear here while they're in house or have an upcoming stay."
                  : "Past guests land here after checkout."
            }
          />
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-sand-200 text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-3 font-semibold">Guest</th>
                <th className="hidden px-5 py-3 font-semibold md:table-cell">Country</th>
                <th className="hidden px-5 py-3 font-semibold lg:table-cell">Surf level</th>
                <th className="px-5 py-3 text-right font-semibold">Stays</th>
                <th className="hidden px-5 py-3 text-right font-semibold sm:table-cell">Last stay</th>
                <th className="px-5 py-3 text-right font-semibold">Spent</th>
                <th className="px-5 py-3 text-right font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {pageRows?.map((guest) => (
                <tr
                  key={guest.guestId}
                  onClick={() => setOpenGuestId(guest.guestId)}
                  className="cursor-pointer transition-colors hover:bg-sand-50"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ocean-100 text-[11px] font-bold text-ocean-800">
                        {guest.fullName
                          .split(" ")
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-semibold">
                          <span className="truncate">{guest.fullName}</span>
                          {guest.inHouseNow && <Badge tone="green">In house</Badge>}
                          {guest.allergies && (
                            <ForkKnife size={13} className="shrink-0 text-dune" />
                          )}
                        </p>
                        <p className="truncate text-xs text-ink-faint">{guest.email ?? "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-5 py-3 text-ink-soft md:table-cell">
                    {guest.country ?? "—"}
                  </td>
                  <td className="hidden px-5 py-3 capitalize text-ink-soft lg:table-cell">
                    {guest.surfLevel ?? "—"}
                  </td>
                  <td className="num px-5 py-3 text-right font-semibold">{guest.staysCount}</td>
                  <td className="num hidden px-5 py-3 text-right text-ink-soft sm:table-cell">
                    {guest.lastStay ? prettyDate(guest.lastStay) : "—"}
                  </td>
                  <td className="num px-5 py-3 text-right font-semibold">
                    {eur(guest.totalSpent)}
                  </td>
                  <td
                    className={cx(
                      "num px-5 py-3 text-right font-semibold",
                      guest.balance > 0.005 ? "text-coral" : "text-ink-faint",
                    )}
                  >
                    {guest.balance > 0.005 ? eur(guest.balance) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {/* Pagination */}
        {filtered && filtered.length > PAGE_SIZE && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand-200 px-5 py-3">
            <p className="num text-xs text-ink-faint">
              {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of{" "}
              {filtered.length} guests
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(safePage - 1)}
                disabled={safePage === 0}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-sand-200 text-ink-soft transition-colors hover:bg-sand-100 disabled:opacity-35 disabled:pointer-events-none cursor-pointer"
                aria-label="Previous page"
              >
                <CaretLeft size={13} weight="bold" />
              </button>
              {Array.from({ length: pageCount }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={cx(
                    "num h-8 min-w-8 rounded-lg px-2 text-xs font-bold transition-colors cursor-pointer",
                    i === safePage
                      ? "bg-ocean-700 text-sand-50"
                      : "border border-sand-200 text-ink-soft hover:bg-sand-100",
                  )}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setPage(safePage + 1)}
                disabled={safePage >= pageCount - 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-sand-200 text-ink-soft transition-colors hover:bg-sand-100 disabled:opacity-35 disabled:pointer-events-none cursor-pointer"
                aria-label="Next page"
              >
                <CaretRight size={13} weight="bold" />
              </button>
            </div>
          </div>
        )}
      </div>

      <GuestProfileDrawer guestId={openGuestId} onClose={() => setOpenGuestId(null)} />
    </div>
  );
}

function GuestProfileDrawer({
  guestId,
  onClose,
}: {
  guestId: Id<"guests"> | null;
  onClose: () => void;
}) {
  const profile = useQuery(
    api.guestDirectory.profile,
    guestId ? { guestId } : "skip",
  );
  const updateGuest = useMutation(api.bookings.updateGuest);
  const updateBooking = useMutation(api.bookings.update);
  const removeBooking = useMutation(api.bookings.remove);
  const removeGuest = useMutation(api.bookings.removeGuest);
  const me = useQuery(api.users.me);
  const rooms = useQuery(api.inventory.listRooms);
  const canManage = me?.role === "admin" || me?.role === "manager";
  const [editing, setEditing] = useState(false);
  const [openBookingId, setOpenBookingId] = useState<Id<"bookings"> | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [editingStay, setEditingStay] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [stayError, setStayError] = useState<string | null>(null);

  if (!guestId) return null;
  const guest = profile?.guest;

  return (
    <>
      <Drawer open onClose={onClose} title={guest?.fullName ?? "Guest"} wide>
        {profile === undefined ? (
          <SkeletonRows count={6} />
        ) : profile === null || !guest ? (
          <p className="text-sm text-ink-faint">Guest not found.</p>
        ) : (
          <div className="flex flex-col gap-7">
            {/* Lifetime stats — dividers, no boxes */}
            <div className="grid grid-cols-4 divide-x divide-sand-200 rounded-xl2 border border-sand-200 bg-white py-4">
              {[
                { label: "Stays", value: String(profile.stats.stays) },
                { label: "Nights", value: String(profile.stats.nights) },
                { label: "Lifetime spend", value: eur(profile.stats.lifetimeSpend) },
                {
                  label: "Open balance",
                  value: profile.stats.balance > 0.005 ? eur(profile.stats.balance) : "—",
                  danger: profile.stats.balance > 0.005,
                },
              ].map((stat) => (
                <div key={stat.label} className="px-4 text-center">
                  <p
                    className={cx(
                      "num text-xl font-bold",
                      stat.danger && "text-coral",
                    )}
                  >
                    {stat.value}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-faint">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Profile */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold">Profile</h3>
                <Button size="sm" variant="secondary" onClick={() => setEditing((e) => !e)}>
                  <PencilSimple size={14} /> {editing ? "Close" : "Edit"}
                </Button>
              </div>
              {editing ? (
                <form
                  className="flex flex-col gap-4 rounded-xl2 border border-sand-200 bg-white p-5"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    await updateGuest({
                      guestId,
                      fullName: String(form.get("fullName")),
                      email: String(form.get("email")) || undefined,
                      phone: String(form.get("phone")) || undefined,
                      country: String(form.get("country")) || undefined,
                      surfLevel:
                        (String(form.get("surfLevel")) as
                          | "beginner"
                          | "intermediate"
                          | "advanced") || undefined,
                      allergies: String(form.get("allergies")),
                      notes: String(form.get("notes")),
                    });
                    setEditing(false);
                  }}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Full name">
                      <Input name="fullName" defaultValue={guest.fullName} required />
                    </Field>
                    <Field label="Email">
                      <Input name="email" type="email" defaultValue={guest.email} />
                    </Field>
                    <Field label="Phone">
                      <Input name="phone" defaultValue={guest.phone} />
                    </Field>
                    <Field label="Country">
                      <Input name="country" defaultValue={guest.country} />
                    </Field>
                    <Field label="Surf level">
                      <Select name="surfLevel" defaultValue={guest.surfLevel ?? ""}>
                        <option value="">Unknown</option>
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                      </Select>
                    </Field>
                    <Field label="Allergies / diet">
                      <Input name="allergies" defaultValue={guest.allergies} />
                    </Field>
                  </div>
                  <Field label="Staff notes">
                    <Textarea name="notes" defaultValue={guest.notes} />
                  </Field>
                  <Button type="submit" className="self-start">
                    Save profile
                  </Button>
                </form>
              ) : (
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl2 border border-sand-200 bg-white p-5 text-sm md:grid-cols-3">
                  <div>
                    <p className="text-xs text-ink-faint">Email</p>
                    <p className="mt-0.5 break-all font-semibold">{guest.email ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-faint">Phone</p>
                    <p className="mt-0.5 font-semibold">{guest.phone ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-faint">Country</p>
                    <p className="mt-0.5 font-semibold">{guest.country ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-faint">Surf level</p>
                    <p className="mt-0.5 font-semibold capitalize">{guest.surfLevel ?? "Unknown"}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs text-ink-faint">Allergies / diet</p>
                    <p className="mt-0.5 font-semibold">{guest.allergies || "None"}</p>
                  </div>
                  {guest.notes && (
                    <div className="col-span-2 md:col-span-3">
                      <p className="text-xs text-ink-faint">Staff notes</p>
                      <p className="mt-0.5 text-ink-soft">{guest.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Booking history */}
            <section>
              <h3 className="mb-2 text-sm font-bold">
                Stay history
                <span className="num ml-2 font-normal text-ink-faint">
                  {profile.history.length}
                </span>
              </h3>
              {profile.history.length === 0 ? (
                <p className="rounded-xl2 border border-sand-200 bg-white px-5 py-6 text-sm text-ink-faint">
                  No bookings yet.
                </p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {profile.history.map((stay) => (
                    <li
                      key={stay.bookingId}
                      className="rounded-xl2 border border-sand-200 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <button
                          onClick={() => setOpenBookingId(stay.bookingId)}
                          className="num text-sm font-bold text-ocean-700 hover:underline cursor-pointer"
                        >
                          {prettyDate(stay.checkIn)} → {prettyDate(stay.checkOut)}
                        </button>
                        <span className="text-sm text-ink-soft">
                          {stay.roomName}
                          {stay.bedLabel ? ` · ${stay.bedLabel}` : ""}
                        </span>
                        <Badge tone={STATUS_TONE[stay.status]}>
                          {STATUS_LABELS[stay.status]}
                        </Badge>
                        <Badge>{SOURCE_LABELS[stay.source]}</Badge>
                        <span className="ml-auto flex items-center gap-3 text-sm">
                          {stay.activitiesCount > 0 && (
                            <span className="num text-xs text-ink-faint">
                              {stay.activitiesCount} activities
                            </span>
                          )}
                          <span className="num font-bold">{eur(stay.totalAmount)}</span>
                          {stay.balance > 0.005 && (
                            <span className="num text-xs font-semibold text-coral">
                              {eur(stay.balance)} due
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-col gap-4 border-t border-sand-100 pt-3 text-sm">
                          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3">
                            <div>
                              <p className="text-xs text-ink-faint">Reservation</p>
                              <p className="num mt-0.5 font-bold tracking-wide">
                                {stay.reservationCode ?? "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-ink-faint">Package</p>
                              <p className="mt-0.5 font-semibold">{stay.packageName ?? "Room only"}</p>
                            </div>
                            <div>
                              <p className="text-xs text-ink-faint">Guests</p>
                              <p className="num mt-0.5 font-semibold">
                                {stay.adults} adult{stay.adults === 1 ? "" : "s"}
                                {stay.children > 0 ? ` · ${stay.children} child${stay.children === 1 ? "" : "ren"}` : ""}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-ink-faint">Duration</p>
                              <p className="num mt-0.5 font-semibold">{stay.nights} nights</p>
                            </div>
                            <div>
                              <p className="text-xs text-ink-faint">Paid</p>
                              <p className="num mt-0.5 font-semibold">{eur(stay.paid)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-ink-faint">Balance</p>
                              <p className={cx("num mt-0.5 font-semibold", stay.balance > 0.005 && "text-coral")}>
                                {stay.balance > 0.005 ? eur(stay.balance) : "Settled"}
                              </p>
                            </div>
                          </div>

                          {stay.companions.length > 0 && (
                            <div>
                              <p className="mb-1.5 text-xs text-ink-faint">Travelling with</p>
                              <div className="flex flex-wrap gap-1.5">
                                {stay.companions.map((c, i) => (
                                  <span key={i} className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-semibold">
                                    {c.name}
                                    {c.surfLevel ? ` · ${c.surfLevel}` : ""}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {stay.payments.length > 0 && (
                            <div>
                              <p className="mb-1.5 text-xs text-ink-faint">Payments</p>
                              <ul className="divide-y divide-sand-100 rounded-xl border border-sand-200">
                                {stay.payments.map((pay, i) => (
                                  <li key={i} className="flex items-center justify-between gap-3 px-3.5 py-2">
                                    <span className="num text-xs text-ink-faint">{prettyDate(pay.date)}</span>
                                    <span className="flex-1 text-xs capitalize text-ink-soft">
                                      {pay.method.replace("_", " ")}
                                      {pay.note ? ` — ${pay.note}` : ""}
                                    </span>
                                    <span className={cx("num text-sm font-bold", pay.direction === "refund" && "text-coral")}>
                                      {pay.direction === "refund" ? "−" : ""}{eur(pay.amount)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {stay.extras.length > 0 && (
                            <div>
                              <p className="mb-1.5 text-xs text-ink-faint">Extras</p>
                              <ul className="flex flex-col gap-1">
                                {stay.extras.map((line, i) => (
                                  <li key={i} className="flex justify-between text-sm">
                                    <span>
                                      {line.name}
                                      <span className="num text-xs text-ink-faint"> ×{line.qty}</span>
                                    </span>
                                    <span className="num font-semibold">{line.amount > 0 ? eur(line.amount) : "Included"}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {stay.activities.length > 0 && (
                            <div>
                              <p className="mb-1.5 text-xs text-ink-faint">Activities</p>
                              <ul className="flex flex-col gap-1">
                                {stay.activities.map((line, i) => (
                                  <li key={i} className="flex justify-between text-sm">
                                    <span>{line.name}</span>
                                    <span className="num text-xs text-ink-faint">
                                      {prettyDate(line.date)} · {line.participants} pax
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {stay.notes && (
                            <div>
                              <p className="text-xs text-ink-faint">Booking notes</p>
                              <p className="mt-0.5 text-ink-soft">{stay.notes}</p>
                            </div>
                          )}

                          {canManage && editingStay === stay.bookingId && (
                            <form
                              className="flex flex-col gap-3 rounded-xl border border-sand-200 bg-sand-50 p-4"
                              onSubmit={async (e) => {
                                e.preventDefault();
                                setStayError(null);
                                const form = new FormData(e.currentTarget);
                                try {
                                  await updateBooking({
                                    bookingId: stay.bookingId,
                                    checkIn: String(form.get("checkIn")),
                                    checkOut: String(form.get("checkOut")),
                                    roomId: form.get("roomId") as Id<"rooms">,
                                    adults: Number(form.get("adults")),
                                    children: Number(form.get("children")),
                                    totalAmount: Number(form.get("totalAmount")),
                                    notes: String(form.get("notes")) || undefined,
                                  });
                                  setEditingStay(null);
                                } catch (err) {
                                  setStayError(errorMessage(err, "Could not save the stay."));
                                }
                              }}
                            >
                              <div className="grid grid-cols-2 gap-3">
                                <Field label="Check-in">
                                  <Input name="checkIn" type="date" defaultValue={stay.checkIn} required />
                                </Field>
                                <Field label="Check-out">
                                  <Input name="checkOut" type="date" defaultValue={stay.checkOut} required />
                                </Field>
                                <Field label="Room">
                                  <Select name="roomId" defaultValue={stay.roomId}>
                                    {(rooms ?? []).map((room) => (
                                      <option key={room._id} value={room._id}>{room.name}</option>
                                    ))}
                                  </Select>
                                </Field>
                                <Field label="Total (€)">
                                  <Input name="totalAmount" type="number" min={0} step="0.01" defaultValue={stay.totalAmount} required />
                                </Field>
                                <Field label="Adults">
                                  <Input name="adults" type="number" min={1} defaultValue={stay.adults} required />
                                </Field>
                                <Field label="Children">
                                  <Input name="children" type="number" min={0} defaultValue={stay.children} required />
                                </Field>
                              </div>
                              <Field label="Notes">
                                <Textarea name="notes" defaultValue={stay.notes} />
                              </Field>
                              {stayError && <p className="text-xs font-semibold text-coral">{stayError}</p>}
                              <div className="flex gap-2">
                                <Button type="submit" size="sm">Save stay</Button>
                                <Button type="button" size="sm" variant="secondary" onClick={() => { setEditingStay(null); setStayError(null); }}>
                                  Cancel
                                </Button>
                              </div>
                            </form>
                          )}
                        </div>

                      <div className="mt-2 flex items-center gap-4">
                        {canManage && (
                          <button
                            onClick={() => {
                              setEditingStay(editingStay === stay.bookingId ? null : stay.bookingId);
                              setStayError(null);
                            }}
                            className="flex items-center gap-1 text-xs font-semibold text-ink-faint transition-colors hover:text-ocean-700 cursor-pointer"
                          >
                            <PencilSimple size={12} /> Edit stay
                          </button>
                        )}
                        {canManage &&
                          (confirmDelete === stay.bookingId ? (
                            <span className="flex items-center gap-2 text-xs font-semibold">
                              <span className="text-coral">Delete this stay?</span>
                              <button
                                onClick={async () => {
                                  await removeBooking({ bookingId: stay.bookingId });
                                  setConfirmDelete(null);
                                }}
                                className="rounded-lg bg-coral px-2.5 py-1 text-sand-50 cursor-pointer"
                              >
                                Yes, delete
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="text-ink-faint hover:text-ink cursor-pointer"
                              >
                                Keep
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(stay.bookingId)}
                              className="flex items-center gap-1 text-xs font-semibold text-ink-faint transition-colors hover:text-coral cursor-pointer"
                            >
                              Delete
                            </button>
                          ))}
                        <button
                          onClick={async () => {
                            await navigator.clipboard.writeText(
                              `${window.location.origin}/guest/${stay.portalToken}`,
                            );
                            setCopiedToken(stay.portalToken);
                            setTimeout(() => setCopiedToken(null), 1500);
                          }}
                          className="flex items-center gap-1 text-xs font-semibold text-ink-faint transition-colors hover:text-ocean-700 cursor-pointer"
                        >
                          {copiedToken === stay.portalToken ? (
                            <>
                              <Check size={12} weight="bold" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy size={12} /> Portal link
                            </>
                          )}
                        </button>
                        <button
                          onClick={() =>
                            downloadBookingConfirmation({
                              guestName: guest.fullName,
                              guestCountry: guest.country,
                              reservationCode: stay.reservationCode,
                              bookingDate: stay.createdAt,
                              roomName: stay.roomName,
                              roomTypeName: stay.roomTypeName,
                              packageName: stay.packageName,
                              guests: stay.adults + stay.children,
                              checkIn: stay.checkIn,
                              checkOut: stay.checkOut,
                              total: stay.totalAmount,
                              paid: stay.paid,
                            })
                          }
                          className="flex items-center gap-1 text-xs font-semibold text-ink-faint transition-colors hover:text-ocean-700 cursor-pointer"
                        >
                          <FilePdf size={12} weight="duotone" /> Confirmation PDF
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {canManage && (
              <section className="rounded-xl2 border border-coral/25 bg-coral/5 p-5">
                <h3 className="text-sm font-bold text-coral">Danger zone</h3>
                <p className="mt-1 text-xs text-ink-soft">
                  Deleting a guest removes their profile, every stay, and all linked
                  payments, extras and requests. This cannot be undone.
                </p>
                {confirmDelete === "guest" ? (
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        await removeGuest({ guestId });
                        setConfirmDelete(null);
                        onClose();
                      }}
                      className="!bg-coral"
                    >
                      Yes — delete {guest.fullName}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" className="mt-3" onClick={() => setConfirmDelete("guest")}>
                    Delete guest…
                  </Button>
                )}
              </section>
            )}
          </div>
        )}
      </Drawer>

      <BookingDetailDrawer
        bookingId={openBookingId}
        onClose={() => setOpenBookingId(null)}
      />
    </>
  );
}
