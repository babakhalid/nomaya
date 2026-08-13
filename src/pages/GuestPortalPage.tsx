import { useRef, useState } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { Check, FilePdf, LockSimple, ShoppingBagOpen } from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  Badge,
  Button,
  Field,
  Input,
  Select,
  SkeletonRows,
  STATUS_TONE,
  Textarea,
  cx,
} from "../components/ui";
import { eur, prettyDate } from "../lib/format";
import PaymentSection from "../components/portal/PaymentSection";
import { downloadBookingConfirmation } from "../lib/bookingConfirmationPdf";

export default function GuestPortalPage() {
  const { token = "" } = useParams();
  const stay = useQuery(api.portal.stay, { token });
  const updatePreferences = useMutation(api.portal.updatePreferences);
  const placeOrder = useMutation(api.portal.placeOrder);
  const scope = useRef<HTMLDivElement>(null);

  const [savedPrefs, setSavedPrefs] = useState(false);
  const [ordered, setOrdered] = useState(false);
  const [basket, setBasket] = useState<
    { kind: "activity" | "service"; refId: string; name: string; price: number; qty: number; date?: string; note?: string }[]
  >([]);
  const [pickerValue, setPickerValue] = useState("");
  const [pickerQty, setPickerQty] = useState(1);
  const [pickerDate, setPickerDate] = useState("");
  const [pickerNote, setPickerNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useGSAP(
    () => {
      if (!stay) return;
      gsap.fromTo(
        ".portal-item",
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6, ease: "expo.out", stagger: 0.08 },
      );
    },
    { scope, dependencies: [stay === undefined] },
  );

  if (stay === undefined) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <SkeletonRows count={5} />
      </div>
    );
  }

  if (stay === null) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-6">
        <div className="text-center">
          <img src="/mascot.png" alt="" className="mx-auto h-16 w-16 object-contain opacity-80" />
          <h1 className="mt-4 text-xl font-black tracking-tight">This link isn't active</h1>
          <p className="mt-2 text-sm text-ink-faint">
            Ask the surf house to send you a fresh portal link.
          </p>
        </div>
      </div>
    );
  }

  async function handlePrefs(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    try {
      await updatePreferences({
        token,
        surfLevel:
          (String(form.get("surfLevel")) as "beginner" | "intermediate" | "advanced") ||
          undefined,
        allergies: String(form.get("allergies")),
        note: String(form.get("note")) || undefined,
      });
      setSavedPrefs(true);
      setTimeout(() => setSavedPrefs(false), 2500);
    } catch {
      setError("Could not save — try again.");
    }
  }

  function addToBasket() {
    if (!pickerValue || !stay) return;
    const [kind, refId] = pickerValue.split("|") as ["activity" | "service", string];
    const item =
      kind === "activity"
        ? stay.catalog.activities.find((a) => a._id === refId)
        : stay.catalog.services.find((s) => s._id === refId);
    if (!item) return;
    setBasket((prev) => [
      ...prev,
      {
        kind,
        refId,
        name: item.name,
        price: item.price,
        qty: pickerQty,
        date: pickerDate || undefined,
        note: pickerNote || undefined,
      },
    ]);
    setPickerValue("");
    setPickerQty(1);
    setPickerDate("");
    setPickerNote("");
  }

  async function handleOrder() {
    if (basket.length === 0) return;
    setError(null);
    try {
      await placeOrder({
        token,
        items: basket.map((item) => ({
          activityId: item.kind === "activity" ? (item.refId as Id<"activities">) : undefined,
          serviceId: item.kind === "service" ? (item.refId as Id<"services">) : undefined,
          qty: item.qty,
          date: item.date,
          note: item.note,
        })),
      });
      setBasket([]);
      setOrdered(true);
      setTimeout(() => setOrdered(false), 2500);
    } catch {
      setError("Could not send the request — try again.");
    }
  }

  return (
    <div ref={scope} className="min-h-[100dvh] bg-sand-50">
      {/* Hero */}
      <div className="bg-ocean-900 px-6 pb-16 pt-10 text-sand-50">
        <div className="mx-auto max-w-xl">
          <div className="portal-item flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-sand-50/90">
              <img src="/mascot.png" alt="" className="h-8 w-8 object-contain" />
            </span>
            <span className="font-black tracking-tight">Moana Surf Experience</span>
          </div>
          <h1 className="portal-item mt-8 text-3xl font-black tracking-tighter">
            Salam, {stay.guestName.split(" ")[0]}.
          </h1>
          <p className="portal-item mt-2 text-ocean-200">
            {stay.confirmedStay
              ? "Your bed's ready. Tell us what you need before you land."
              : "We got your request — pay a deposit below to lock in your room."}
          </p>
          <div className="portal-item mt-6 flex flex-wrap gap-x-8 gap-y-2 rounded-xl2 border border-white/10 bg-white/5 px-5 py-4 text-sm">
            {stay.reservationCode && (
              <div>
                <p className="text-xs text-ocean-300">Reservation</p>
                <p className="num mt-0.5 font-bold tracking-wide">{stay.reservationCode}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-ocean-300">Status</p>
              <p className="mt-0.5 font-semibold">
                {stay.confirmedStay ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    Confirmed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    Awaiting deposit
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-ocean-300">Stay</p>
              <p className="num mt-0.5 font-semibold">
                {prettyDate(stay.checkIn)} → {prettyDate(stay.checkOut)}
              </p>
            </div>
            <div>
              <p className="text-xs text-ocean-300">
                {stay.rooms.length > 1 ? "Rooms" : "Room"}
              </p>
              <p className="mt-0.5 font-semibold">
                {stay.rooms.length > 1
                  ? stay.rooms.map((r) => r.name).join(" + ")
                  : `${stay.roomName} · ${stay.roomTypeName}`}
              </p>
            </div>
            <div>
              <p className="text-xs text-ocean-300">Guests</p>
              <p className="num mt-0.5 font-semibold">{stay.adults + stay.children}</p>
            </div>
          </div>
          {stay.money.paid > 0 ? (
            <button
              onClick={() =>
                downloadBookingConfirmation({
                  guestName: stay.guestName,
                  guestCountry: stay.guestCountry,
                  reservationCode: stay.reservationCode,
                  bookingDate: stay.createdAt,
                  roomName:
                    stay.rooms.length > 1
                      ? stay.rooms.map((r) => r.name).join(" + ")
                      : (stay.roomName ?? ""),
                  roomTypeName:
                    stay.rooms.length > 1 ? undefined : stay.roomTypeName,
                  packageName: stay.packageName,
                  guests: stay.adults + stay.children,
                  checkIn: stay.checkIn,
                  checkOut: stay.checkOut,
                  total: stay.money.total,
                  paid: stay.money.paid,
                })
              }
              className="portal-item mt-4 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-sand-50 transition-colors hover:bg-white/20 cursor-pointer"
            >
              <FilePdf size={16} weight="duotone" />
              Download booking confirmation
            </button>
          ) : (
            <div className="portal-item group relative mt-4 inline-block" tabIndex={0}>
              <button
                disabled
                aria-describedby="pdf-locked-tip"
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-ocean-300"
              >
                <LockSimple size={15} weight="duotone" />
                Download booking confirmation
              </button>
              <span
                id="pdf-locked-tip"
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2.5 w-64 -translate-x-1/2 rounded-xl bg-ink px-3.5 py-2.5 text-center text-xs font-medium leading-relaxed text-sand-50 opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                Pay at least a deposit in the "Your bill" section below to unlock
                your booking confirmation.
                <span className="absolute left-1/2 top-full -mt-1 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-ink" />
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-xl px-6 pb-20">
        {/* Pending notice */}
        {!stay.confirmedStay && (
          <div
            className="portal-item -mt-6 rounded-xl2 border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-relaxed text-amber-900"
            style={{ boxShadow: "var(--shadow-lift)" }}
          >
            <p className="font-bold">
              Your {stay.rooms.length > 1 ? "rooms are" : "room is"} not reserved yet.
            </p>
            <p className="mt-1">
              A reservation is only confirmed once a deposit (or the full amount) is
            paid. Head to the "Your bill" section below to secure your stay.
            </p>
          </div>
        )}

        {/* Your room(s) */}
        {stay.rooms.filter((r) => r.imageUrl).map((room, i) => (
          <div
            key={room.name}
            className={`portal-item ${i === 0 && stay.confirmedStay ? "-mt-6" : "mt-6"} overflow-hidden rounded-xl2 border border-sand-200 bg-white`}
            style={{ boxShadow: "var(--shadow-lift)" }}
          >
            <div className="relative">
              <img
                src={room.imageUrl}
                alt={room.name}
                className="h-56 w-full object-cover"
                loading="lazy"
              />
              <span className="absolute bottom-3 left-3 rounded-full bg-ink/60 px-3 py-1 text-xs font-bold text-sand-50 backdrop-blur-sm">
                {room.name}
                {room.typeName ? ` · ${room.typeName}` : ""}
              </span>
              {!stay.confirmedStay && (
                <span className="absolute right-3 top-3 rounded-full bg-amber-400/95 px-3 py-1 text-xs font-bold text-amber-950">
                  Not reserved yet
                </span>
              )}
            </div>
            {room.description && (
              <p className="px-5 py-4 text-sm leading-relaxed text-ink-soft">
                {room.description}
              </p>
            )}
          </div>
        ))}

        {/* Who's coming */}
        {stay.guests.length > 1 && (
          <section
            className="portal-item mt-8 rounded-xl2 border border-sand-200 bg-white p-6"
            style={{ boxShadow: "var(--shadow-diffuse)" }}
          >
            <h2 className="font-bold tracking-tight">Who's coming</h2>
            <p className="mt-1 text-sm text-ink-faint">
              Everyone on reservation {stay.reservationCode}.
            </p>
            <ul className="mt-4 flex flex-col divide-y divide-sand-100">
              {stay.guests.map((g, i) => (
                <li key={`${g.name}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="font-semibold">{g.name}</span>
                  <span className="flex items-center gap-2">
                    {g.surfLevel && (
                      <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-semibold capitalize text-ink-soft">
                        {g.surfLevel}
                      </span>
                    )}
                    {g.lead && (
                      <span className="rounded-full bg-ocean-800 px-2.5 py-0.5 text-xs font-bold text-sand-50">
                        Lead guest
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Preferences */}
        <section className={`portal-item ${stay.rooms.some((r) => r.imageUrl) || stay.guests.length > 1 || !stay.confirmedStay ? "mt-8" : "-mt-6"} rounded-xl2 border border-sand-200 bg-white p-6`} style={{ boxShadow: "var(--shadow-lift)" }}>
          <h2 className="font-bold tracking-tight">About you</h2>
          <p className="mt-1 text-sm text-ink-faint">
            Helps us group surf sessions and cook the right food.
          </p>
          <form onSubmit={handlePrefs} className="mt-5 flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Your surf level">
                <Select name="surfLevel" defaultValue={stay.surfLevel ?? ""}>
                  <option value="">Not sure yet</option>
                  <option value="beginner">Beginner — first waves</option>
                  <option value="intermediate">Intermediate — green waves</option>
                  <option value="advanced">Advanced — I charge</option>
                </Select>
              </Field>
              <Field label="Allergies / diet">
                <Input
                  name="allergies"
                  defaultValue={stay.allergies ?? ""}
                  placeholder="e.g. vegetarian, nut allergy"
                />
              </Field>
            </div>
            <Field label="Anything else we should know?">
              <Textarea name="note" placeholder="Arrival time, injuries, special requests…" />
            </Field>
            <Button type="submit" className="self-start">
              {savedPrefs ? (
                <>
                  <Check size={15} weight="bold" /> Saved
                </>
              ) : (
                "Save details"
              )}
            </Button>
          </form>
        </section>

        {/* Order */}
        <section className="portal-item mt-8 rounded-xl2 border border-sand-200 bg-white p-6" style={{ boxShadow: "var(--shadow-diffuse)" }}>
          <h2 className="flex items-center gap-2 font-bold tracking-tight">
            <ShoppingBagOpen size={18} weight="duotone" className="text-ocean-600" />
            Add to your stay
          </h2>
          <p className="mt-1 text-sm text-ink-faint">
            Lessons, transfers, rentals — request it here and the crew confirms.
          </p>
          <div className="mt-5 flex flex-col gap-4">
            <Field label="What would you like?">
              <Select value={pickerValue} onChange={(e) => setPickerValue(e.target.value)}>
                <option value="">Choose…</option>
                <optgroup label="Activities">
                  {stay.catalog.activities.map((activity) => (
                    <option key={activity._id} value={`activity|${activity._id}`}>
                      {activity.startTime ? `${activity.startTime} · ` : ""}
                      {activity.name} — {eur(activity.price)} · {activity.durationMin} min
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Services">
                  {stay.catalog.services.map((service) => (
                    <option key={service._id} value={`service|${service._id}`}>
                      {service.startTime ? `${service.startTime} · ` : ""}
                      {service.name} — {eur(service.price)} {service.unit.replace("_", " ")}
                    </option>
                  ))}
                </optgroup>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="How many / people">
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={pickerQty}
                  onChange={(e) => setPickerQty(Number(e.target.value))}
                />
              </Field>
              <Field label="Preferred date">
                <Input
                  type="date"
                  min={stay.checkIn}
                  max={stay.checkOut}
                  value={pickerDate}
                  onChange={(e) => setPickerDate(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Note (optional)">
              <Input
                placeholder="Morning session, big board…"
                value={pickerNote}
                onChange={(e) => setPickerNote(e.target.value)}
              />
            </Field>
            <Button
              type="button"
              variant="secondary"
              disabled={!pickerValue}
              onClick={addToBasket}
              className="self-start"
            >
              Add to list
            </Button>

            {basket.length > 0 && (
              <div className="rounded-xl border border-ocean-200 bg-ocean-50 p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ocean-800">
                  Your list
                </p>
                <ul className="flex flex-col gap-1.5">
                  {basket.map((item, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <span className="font-semibold">{item.name}</span>
                        <span className="num text-ink-soft"> ×{item.qty}</span>
                        {item.date && (
                          <span className="num text-xs text-ink-faint"> · {prettyDate(item.date)}</span>
                        )}
                        {item.note && (
                          <span className="block truncate text-xs text-ink-faint">"{item.note}"</span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="num font-semibold">{eur(item.price * item.qty)}</span>
                        <button
                          onClick={() => setBasket(basket.filter((_, j) => j !== i))}
                          className="text-xs font-semibold text-coral cursor-pointer"
                        >
                          Remove
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between border-t border-ocean-200 pt-2.5">
                  <span className="text-sm font-bold text-ocean-900">Estimated total</span>
                  <span className="num font-bold text-ocean-900">
                    {eur(basket.reduce((sum, item) => sum + item.price * item.qty, 0))}
                  </span>
                </div>
              </div>
            )}

            <Button
              type="button"
              disabled={basket.length === 0 && !ordered}
              onClick={() => void handleOrder()}
              className="self-start"
            >
              {ordered ? (
                <>
                  <Check size={15} weight="bold" /> Request sent
                </>
              ) : (
                `Send request${basket.length > 1 ? ` (${basket.length} items)` : ""}`
              )}
            </Button>
          </div>
          {error && (
            <p className="mt-3 rounded-xl border border-coral/25 bg-coral/10 px-3.5 py-2.5 text-sm text-coral">
              {error}
            </p>
          )}
        </section>

        {/* Bill & payment (simulation) */}
        <PaymentSection
          token={token}
          money={stay.money}
          payments={stay.payments}
          reservationCode={stay.reservationCode}
        />

        {/* Already booked + request history */}
        {(stay.booked.length > 0 || stay.requests.length > 0) && (
          <section className="portal-item mt-8">
            <h2 className="mb-3 font-bold tracking-tight">Your plan</h2>
            <div className="rounded-xl2 border border-sand-200 bg-white" style={{ boxShadow: "var(--shadow-diffuse)" }}>
              <ul className="divide-y divide-sand-100">
                {stay.booked.map((item, i) => (
                  <li key={`b${i}`} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="font-medium">
                      {item.name}
                      {item.startTime && (
                        <span className="num ml-2 text-xs font-bold text-ocean-700">
                          {item.startTime}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="num text-ink-faint">{prettyDate(item.date)}</span>
                      <Badge tone="green">Booked</Badge>
                    </span>
                  </li>
                ))}
                {stay.requests.map((request) => (
                  <li key={request._id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className={cx("font-medium", request.status === "declined" && "line-through opacity-50")}>
                      {request.payload.activityName ?? request.payload.serviceName ?? "Special request"}
                      {request.payload.qty && request.payload.qty > 1 ? ` ×${request.payload.qty}` : ""}
                      {request.payload.note && (
                        <span className="block text-xs font-normal text-ink-faint">{request.payload.note}</span>
                      )}
                    </span>
                    <span className="flex items-center gap-3">
                      {request.payload.date && (
                        <span className="num text-ink-faint">{prettyDate(request.payload.date)}</span>
                      )}
                      <Badge tone={STATUS_TONE[request.status]}>{request.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <p className="portal-item mt-10 text-center text-xs text-ink-faint">
          Moana Surf Experience · Tamraght, Morocco · See you in the water.
        </p>
      </div>
    </div>
  );
}
