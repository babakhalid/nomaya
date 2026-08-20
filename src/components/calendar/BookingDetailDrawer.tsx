import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Check,
  Copy,
  FilePdf,
  ForkKnife,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Badge,
  Button,
  Drawer,
  Field,
  Input,
  Select,
  SkeletonRows,
  STATUS_TONE,
} from "../ui";
import { eur, isoToday, prettyDate, SOURCE_LABELS, STATUS_LABELS } from "../../lib/format";
import { downloadBookingConfirmation } from "../../lib/bookingConfirmationPdf";

const NEXT_STATUS: Record<string, { label: string; to: "confirmed" | "checked_in" | "checked_out" }[]> = {
  inquiry: [{ label: "Confirm", to: "confirmed" }],
  confirmed: [{ label: "Check in", to: "checked_in" }],
  checked_in: [{ label: "Check out", to: "checked_out" }],
};

export default function BookingDetailDrawer({
  bookingId,
  onClose,
}: {
  bookingId: Id<"bookings"> | null;
  onClose: () => void;
}) {
  const detail = useQuery(
    api.bookings.detail,
    bookingId ? { bookingId } : "skip",
  );
  const activities = useQuery(api.catalog.listActivities);
  const services = useQuery(api.catalog.listServices);

  const me = useQuery(api.users.me);
  const canManage = me?.role === "admin" || me?.role === "manager";

  const setStatus = useMutation(api.bookings.setStatus);
  const addActivity = useMutation(api.bookings.addActivity);
  const removeActivity = useMutation(api.bookings.removeActivity);
  const addService = useMutation(api.bookings.addService);
  const removeService = useMutation(api.bookings.removeService);
  const recordPayment = useMutation(api.payments.record);
  const resolveRequest = useMutation(api.bookings.resolveGuestRequest);

  const [copied, setCopied] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [showAddService, setShowAddService] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!bookingId) return null;

  const booking = detail?.booking;
  const portalUrl = booking
    ? `${window.location.origin}/guest/${booking.portalToken}`
    : "";

  async function copyPortalLink() {
    await navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={detail?.guest?.fullName ?? "Booking"}
      wide
    >
      {detail === undefined ? (
        <SkeletonRows count={6} />
      ) : detail === null || !booking ? (
        <p className="text-sm text-ink-faint">Booking not found.</p>
      ) : (
        <div className="flex flex-col gap-7">
          {/* Header info */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[booking.status]}>
              {STATUS_LABELS[booking.status]}
            </Badge>
            <Badge>{SOURCE_LABELS[booking.source]}</Badge>
            {booking.reservationCode && (
              <span className="num rounded-md bg-ocean-50 px-2 py-0.5 text-xs font-bold text-ocean-800">
                {booking.reservationCode}
              </span>
            )}
            {booking.channelBookingId && (
              <span className="num text-xs text-ink-faint">
                {booking.channelBookingId}
              </span>
            )}
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  downloadBookingConfirmation({
                    guestName: detail.guest?.fullName ?? "Guest",
                    guestCountry: detail.guest?.country,
                    reservationCode: booking.reservationCode,
                    bookingDate: booking._creationTime,
                    roomName: detail.room?.name ?? "",
                    roomTypeName: detail.roomType?.name,
                    packageName: detail.pkg?.name,
                    guests: booking.adults + booking.children,
                    checkIn: booking.checkIn,
                    checkOut: booking.checkOut,
                    total: booking.totalAmount,
                    paid: detail.paid,
                  })
                }
              >
                <FilePdf size={14} weight="duotone" /> Confirmation PDF
              </Button>
              {(NEXT_STATUS[booking.status] ?? [])
                // Crew handle check-in/out; confirming a booking is manager+.
                .filter((action) => canManage || action.to !== "confirmed")
                .map((action) => (
                  <Button
                    key={action.to}
                    size="sm"
                    onClick={() => void setStatus({ bookingId, status: action.to })}
                  >
                    {action.label}
                  </Button>
                ))}
              {canManage && ["inquiry", "confirmed"].includes(booking.status) && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void setStatus({ bookingId, status: "cancelled" })}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl2 border border-sand-200 bg-white p-5 text-sm md:grid-cols-4">
            <div>
              <p className="text-xs text-ink-faint">Stay</p>
              <p className="num mt-0.5 font-semibold">
                {prettyDate(booking.checkIn)} → {prettyDate(booking.checkOut)}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Room</p>
              <p className="mt-0.5 font-semibold">
                {detail.room?.name}
                {detail.bed ? ` · ${detail.bed.label}` : ""}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Guests</p>
              <p className="num mt-0.5 font-semibold">
                {booking.adults} adult{booking.adults === 1 ? "" : "s"}
                {booking.children > 0 && `, ${booking.children} kids`}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Package</p>
              <p className="mt-0.5 font-semibold">{detail.pkg?.name ?? "À la carte"}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-ink-faint">Contact</p>
              <p className="mt-0.5 font-semibold">
                {detail.guest?.email ?? "—"}{" "}
                <span className="text-ink-faint">{detail.guest?.phone}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Surf level</p>
              <p className="mt-0.5 font-semibold capitalize">
                {detail.guest?.surfLevel ?? "Unknown"}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Allergies / diet</p>
              <p className="mt-0.5 font-semibold">{detail.guest?.allergies ?? "None"}</p>
            </div>
            {booking.companions && booking.companions.length > 0 && (
              <div className="col-span-2 md:col-span-4">
                <p className="text-xs text-ink-faint">Travelling with</p>
                <p className="mt-0.5 font-semibold">
                  {booking.companions
                    .map((c) => c.name + (c.surfLevel ? ` (${c.surfLevel})` : ""))
                    .join(" · ")}
                </p>
              </div>
            )}
          </div>

          {/* Money */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold">Payments</h3>
              {canManage && (
                <Button size="sm" variant="secondary" onClick={() => setShowPayment((s) => !s)}>
                  <Plus size={14} weight="bold" /> Record payment
                </Button>
              )}
            </div>
            <div className="rounded-xl2 border border-sand-200 bg-white p-5">
              <div className="mb-3 flex items-end gap-6">
                <div>
                  <p className="text-xs text-ink-faint">Total</p>
                  <p className="num text-lg font-bold">{eur(booking.totalAmount)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-faint">Paid</p>
                  <p className="num text-lg font-bold text-kelp">{eur(detail.paid)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-faint">Balance</p>
                  <p className={`num text-lg font-bold ${detail.balance > 0 ? "text-coral" : "text-kelp"}`}>
                    {eur(detail.balance)}
                  </p>
                </div>
              </div>

              {showPayment && (
                <form
                  className="mb-3 grid grid-cols-[1fr_1fr_auto] items-end gap-3 rounded-xl bg-sand-100 p-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    setError(null);
                    try {
                      await recordPayment({
                        bookingId,
                        amount: Number(form.get("amount")),
                        method: form.get("method") as "cash" | "bank_transfer" | "card" | "ota_payout",
                        direction: "in",
                        date: isoToday(),
                      });
                      setShowPayment(false);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Failed");
                    }
                  }}
                >
                  <Field label="Amount (EUR)">
                    <Input name="amount" type="number" step="0.01" min="0.01" required autoFocus />
                  </Field>
                  <Field label="Method">
                    <Select name="method" defaultValue="cash">
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="bank_transfer">Bank transfer</option>
                      <option value="ota_payout">OTA payout</option>
                    </Select>
                  </Field>
                  <Button type="submit" size="sm">Save</Button>
                </form>
              )}

              {detail.payments.length === 0 ? (
                <p className="text-sm text-ink-faint">No payments recorded yet.</p>
              ) : (
                <ul className="divide-y divide-sand-100">
                  {detail.payments.map((payment) => (
                    <li key={payment._id} className="flex items-center justify-between py-2 text-sm">
                      <span className="capitalize text-ink-soft">
                        {payment.method.replace("_", " ")}
                        {payment.note && <span className="text-ink-faint"> · {payment.note}</span>}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="num text-ink-faint">{payment.date}</span>
                        <span className={`num font-bold ${payment.direction === "in" ? "text-kelp" : "text-coral"}`}>
                          {payment.direction === "in" ? "+" : "−"}
                          {eur(payment.amount)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Activities */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold">Activities</h3>
              {canManage && (
              <Button size="sm" variant="secondary" onClick={() => setShowAddActivity((s) => !s)}>
                <Plus size={14} weight="bold" /> Add
              </Button>
              )}
            </div>
            <div className="rounded-xl2 border border-sand-200 bg-white p-5">
              {showAddActivity && (
                <form
                  className="mb-3 grid grid-cols-[2fr_1fr_1fr_auto] items-end gap-3 rounded-xl bg-sand-100 p-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    await addActivity({
                      bookingId,
                      activityId: form.get("activityId") as Id<"activities">,
                      date: String(form.get("date")),
                      participants: Number(form.get("participants")),
                    });
                    setShowAddActivity(false);
                  }}
                >
                  <Field label="Activity">
                    <Select name="activityId" required>
                      {activities?.filter((a) => a.active).map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.name} ({eur(a.price)})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Date">
                    <Input name="date" type="date" defaultValue={booking.checkIn} required />
                  </Field>
                  <Field label="Pax">
                    <Input name="participants" type="number" min={1} defaultValue={1} />
                  </Field>
                  <Button type="submit" size="sm">Add</Button>
                </form>
              )}
              {detail.activities.length === 0 ? (
                <p className="text-sm text-ink-faint">No activities booked.</p>
              ) : (
                <ul className="divide-y divide-sand-100">
                  {detail.activities.map((item) => (
                    <li key={item._id} className="flex items-center justify-between py-2 text-sm">
                      <span className="font-medium">
                        {item.name}
                        {item.startTime && (
                          <span className="num ml-2 text-xs font-bold text-ocean-700">
                            {item.startTime}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="num text-ink-faint">{item.date}</span>
                        <span className="num">×{item.participants}</span>
                        {canManage && (
                        <button
                          onClick={() => void removeActivity({ id: item._id })}
                          className="text-ink-faint transition-colors hover:text-coral cursor-pointer"
                          title="Remove"
                        >
                          <Trash size={14} />
                        </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Services */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold">Services</h3>
              {canManage && (
              <Button size="sm" variant="secondary" onClick={() => setShowAddService((s) => !s)}>
                <Plus size={14} weight="bold" /> Add
              </Button>
              )}
            </div>
            <div className="rounded-xl2 border border-sand-200 bg-white p-5">
              {showAddService && (
                <form
                  className="mb-3 grid grid-cols-[2fr_1fr_1fr_auto] items-end gap-3 rounded-xl bg-sand-100 p-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    await addService({
                      bookingId,
                      serviceId: form.get("serviceId") as Id<"services">,
                      qty: Number(form.get("qty")),
                      date: String(form.get("date")) || undefined,
                    });
                    setShowAddService(false);
                  }}
                >
                  <Field label="Service">
                    <Select name="serviceId" required>
                      {services?.filter((s) => s.active).map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name} ({eur(s.price)})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Qty">
                    <Input name="qty" type="number" min={1} defaultValue={1} />
                  </Field>
                  <Field label="Date">
                    <Input name="date" type="date" />
                  </Field>
                  <Button type="submit" size="sm">Add</Button>
                </form>
              )}
              {detail.services.length === 0 ? (
                <p className="text-sm text-ink-faint">No services added.</p>
              ) : (
                <ul className="divide-y divide-sand-100">
                  {detail.services.map((item) => (
                    <li key={item._id} className="flex items-center justify-between py-2 text-sm">
                      <span className="font-medium">
                        {item.name}
                        {item.date && <span className="num text-ink-faint"> · {item.date}</span>}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="num">×{item.qty}</span>
                        <span className="num font-semibold">{eur(item.amount)}</span>
                        {canManage && (
                        <button
                          onClick={() => void removeService({ id: item._id })}
                          className="text-ink-faint transition-colors hover:text-coral cursor-pointer"
                          title="Remove"
                        >
                          <Trash size={14} />
                        </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Guest portal requests */}
          <section>
            <h3 className="mb-2 text-sm font-bold">Guest portal</h3>
            <div className="rounded-xl2 border border-sand-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-xs text-ink-faint">{portalUrl}</p>
                <Button size="sm" variant="secondary" onClick={() => void copyPortalLink()}>
                  {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
              {detail.requests.length > 0 && (
                <ul className="mt-4 divide-y divide-sand-100">
                  {detail.requests.map((request) => (
                    <li key={request._id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {request.type === "order" ? "Order" : "Requirement"}
                          {request.payload.qty ? ` ×${request.payload.qty}` : ""}
                          {request.payload.date && (
                            <span className="num text-ink-faint"> · {request.payload.date}</span>
                          )}
                        </p>
                        {request.payload.note && (
                          <p className="flex items-center gap-1 text-xs text-ink-faint">
                            <ForkKnife size={12} /> {request.payload.note}
                          </p>
                        )}
                      </div>
                      {request.status === "pending" && canManage ? (
                        <span className="flex shrink-0 gap-1.5">
                          <Button
                            size="sm"
                            onClick={() => void resolveRequest({ requestId: request._id, approve: true })}
                          >
                            <Check size={13} weight="bold" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void resolveRequest({ requestId: request._id, approve: false })}
                          >
                            <X size={13} weight="bold" />
                          </Button>
                        </span>
                      ) : (
                        <Badge tone={STATUS_TONE[request.status]}>{request.status}</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {booking.notes && (
            <section>
              <h3 className="mb-2 text-sm font-bold">Notes</h3>
              <p className="rounded-xl2 border border-sand-200 bg-white p-5 text-sm text-ink-soft">
                {booking.notes}
              </p>
            </section>
          )}

          {error && (
            <p className="rounded-xl border border-coral/25 bg-coral/10 px-3.5 py-2.5 text-sm text-coral">
              {error}
            </p>
          )}
        </div>
      )}
    </Drawer>
  );
}
