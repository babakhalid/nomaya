import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "convex/react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  startOfMonth,
} from "date-fns";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
  ArrowRight,
  Bank,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  Check,
  CheckCircle,
  CreditCard,
  LockSimple,
  Minus,
  Plus,
  Users,
  X,
} from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button, Field, Input, Select, SkeletonRows, Textarea, cx } from "../components/ui";
import { formatCardNumber, formatExpiry } from "../components/portal/PaymentSection";
import { eur, prettyDate } from "../lib/format";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CAL_WINDOW_DAYS = 120;

type Confirmation = {
  portalToken: string;
  reservationCode: string;
  totalAmount: number;
  nights: number;
  roomTypeName: string;
};

type Companion = { name: string; surfLevel: string };

// ─────────────────────────────────────────────────────────────────────────

export default function BookPage() {
  const today = format(new Date(), "yyyy-MM-dd");

  // guests
  const [adults, setAdults] = useState(0);
  const [children, setChildren] = useState(0);
  const totalGuests = adults + children;
  const [guestsOpen, setGuestsOpen] = useState(true);

  // lead guest + companions
  const [lead, setLead] = useState({
    fullName: "",
    email: "",
    phone: "",
    country: "",
    surfLevel: "",
    allergies: "",
    notes: "",
  });
  const [companions, setCompanions] = useState<Companion[]>([]);

  // dates
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [datesOpen, setDatesOpen] = useState(false);

  // selection
  const [roomId, setRoomId] = useState<Id<"rooms"> | null>(null);
  const [packageId, setPackageId] = useState<string>("");
  const [selectedServices, setSelectedServices] = useState<Record<string, number>>({});

  // payment / confirmation
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [paidNow, setPaidNow] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const scope = useRef<HTMLDivElement>(null);

  const datesValid = !!checkIn && !!checkOut && checkIn >= today && checkOut > checkIn;
  const availability = useQuery(
    api.publicBooking.availability,
    datesValid && !finished ? { checkIn: checkIn!, checkOut: checkOut! } : "skip",
  );
  const calendarData = useQuery(api.publicBooking.calendarAvailability, {
    start: today,
    end: format(addDays(new Date(), CAL_WINDOW_DAYS), "yyyy-MM-dd"),
  });
  const createRequest = useMutation(api.publicBooking.createRequest);

  useGSAP(
    () => {
      gsap.fromTo(
        ".flow-in",
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.45, ease: "expo.out", stagger: 0.06 },
      );
    },
    { scope, dependencies: [totalGuests > 0, datesValid, roomId, finished] },
  );

  // keep companions array sized to guests − 1
  const companionCount = Math.max(0, totalGuests - 1);
  if (companions.length !== companionCount) {
    setCompanions((prev) => {
      const next = [...prev];
      while (next.length < companionCount) next.push({ name: "", surfLevel: "" });
      return next.slice(0, companionCount);
    });
  }

  const selectedRoom = availability?.rooms.find((r) => r.roomId === roomId);
  const selectedPackage = availability?.packages.find((p) => p.packageId === packageId);
  const servicesTotal = Object.entries(selectedServices).reduce((sum, [id, qty]) => {
    const service = availability?.services.find((s) => s.serviceId === id);
    return sum + (service ? service.price * qty : 0);
  }, 0);
  // Kymata packages are priced per person
  const packageTotal = selectedPackage ? selectedPackage.price * Math.max(1, totalGuests) : null;
  const total = (packageTotal ?? selectedRoom?.totalForStay ?? 0) + servicesTotal;

  const leadValid = lead.fullName.trim().length >= 2 && EMAIL_RE.test(lead.email);
  const companionsValid = companions.every((c) => c.name.trim().length >= 2);
  const roomFits =
    !!selectedRoom &&
    selectedRoom.available &&
    (selectedRoom.mode === "dorm" ? totalGuests === 1 : totalGuests <= selectedRoom.capacity);
  const canPay =
    totalGuests > 0 && leadValid && companionsValid && datesValid && roomFits && !submitting;

  const missing = !canPay
    ? totalGuests === 0
      ? "Choose how many guests first"
      : !leadValid
        ? "Guest 1 needs a name and a valid email"
        : !companionsValid
          ? "Every guest needs a name"
          : !datesValid
            ? "Pick your dates"
            : !selectedRoom
              ? "Choose a room"
              : !roomFits
                ? "This room doesn't fit your group"
                : ""
    : "";

  async function handleContinue() {
    if (!canPay || !roomId || !checkIn || !checkOut) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await createRequest({
        checkIn,
        checkOut,
        roomId,
        packageId: packageId ? (packageId as Id<"packages">) : undefined,
        services: Object.entries(selectedServices).map(([serviceId, qty]) => ({
          serviceId: serviceId as Id<"services">,
          qty,
        })),
        adults: Math.max(1, adults),
        children,
        fullName: lead.fullName,
        email: lead.email,
        phone: lead.phone || undefined,
        country: lead.country || undefined,
        surfLevel:
          (lead.surfLevel as "beginner" | "intermediate" | "advanced") || undefined,
        allergies: lead.allergies || undefined,
        notes: lead.notes || undefined,
        companions: companions.map((c) => ({
          name: c.name,
          surfLevel: c.surfLevel || undefined,
        })),
      });
      setConfirmation(result);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.replace(/^.*Uncaught Error:\s*/, "").replace(/ at .*$/s, "")
          : "Something went wrong — please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ── Finished screen ──────────────────────────────────────────────────
  if (finished && confirmation) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-ocean-900 px-6">
        <div className="w-full max-w-md text-center text-sand-50">
          <CheckCircle size={52} weight="duotone" className="mx-auto text-ocean-300" />
          <h1 className="mt-5 text-3xl font-black tracking-tighter">
            {paidNow ? "Booked & paid." : "Request received."}
          </h1>
          <p className="mt-3 text-ocean-200">
            {confirmation.roomTypeName} · {confirmation.nights} night
            {confirmation.nights === 1 ? "" : "s"} ·{" "}
            <span className="num font-bold text-sand-50">{eur(confirmation.totalAmount)}</span>
          </p>
          {paidNow !== null && paidNow > 0 && (
            <p className="mt-2 text-sm text-ocean-200">
              Paid now (simulation):{" "}
              <span className="num font-bold text-sand-50">{eur(paidNow)}</span>
              {paidNow < confirmation.totalAmount && (
                <> · balance {eur(confirmation.totalAmount - paidNow)}</>
              )}
            </p>
          )}
          <div className="mx-auto mt-5 inline-block rounded-xl border border-white/15 bg-white/10 px-5 py-3">
            <p className="text-[11px] uppercase tracking-wide text-ocean-300">
              Your reservation code
            </p>
            <p className="num mt-0.5 text-2xl font-black tracking-widest">
              {confirmation.reservationCode}
            </p>
          </div>
          <Link
            to={`/guest/${confirmation.portalToken}`}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-sand-50 px-5 py-2.5 font-semibold text-ocean-900 transition-transform active:scale-[0.98]"
          >
            Open my guest page <ArrowRight size={16} weight="bold" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div ref={scope} className="min-h-[100dvh] bg-sand-50 pb-28 lg:pb-16">
      {/* Brand bar */}
      <div className="bg-ocean-900 px-4 py-4 text-sand-50 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Link
            to="/"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 p-1.5"
          >
            <img src="/mascot.png" alt="" className="h-8 w-8 object-contain" />
          </Link>
          <div>
            <p className="font-black tracking-tight">Kymata Surf Morocco</p>
            <p className="text-xs text-ocean-200">Book your stay · no charge until confirmed</p>
          </div>
        </div>
      </div>

      {/* Control bar — guests + dates pills (BookingLayer style) */}
      <div className="sticky top-0 z-40 border-b border-sand-200 bg-sand-100/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          <GuestsPill
            adults={adults}
            children={children}
            setAdults={setAdults}
            setChildren={setChildren}
            open={guestsOpen}
            setOpen={(open) => {
              setGuestsOpen(open);
              if (open) setDatesOpen(false);
              if (!open && totalGuests > 0 && !datesValid) setDatesOpen(true);
            }}
          />
          <DatesPill
            checkIn={checkIn}
            checkOut={checkOut}
            setCheckIn={setCheckIn}
            setCheckOut={setCheckOut}
            open={datesOpen}
            setOpen={(open) => {
              setDatesOpen(open);
              if (open) setGuestsOpen(false);
            }}
            availability={calendarData}
            today={today}
            disabled={confirmation !== null}
          />
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 pt-8 sm:px-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {confirmation ? (
            <PaymentStep
              confirmation={confirmation}
              onPaid={(amount) => {
                setPaidNow(amount);
                setFinished(true);
              }}
              onSkip={() => setFinished(true)}
            />
          ) : (
            <>
              {totalGuests === 0 && (
                <div className="flow-in rounded-xl2 border border-dashed border-sand-300 bg-white p-10 text-center">
                  <Users size={28} weight="duotone" className="mx-auto text-ocean-400" />
                  <p className="mt-3 font-bold">Who's coming?</p>
                  <p className="mt-1 text-sm text-ink-faint">
                    Start by choosing the number of guests above.
                  </p>
                </div>
              )}

              {/* Guest forms — appear as soon as the count is set */}
              {totalGuests > 0 && (
                <section className="flow-in">
                  <h2 className="mb-3 font-bold tracking-tight">Guests</h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Lead guest */}
                    <div
                      className="rounded-xl2 border border-sand-200 bg-white p-5"
                      style={{ boxShadow: "var(--shadow-diffuse)" }}
                    >
                      <p className="mb-4 text-sm font-black text-ocean-800">
                        Guest 1 <span className="font-normal text-ink-faint">· lead booker</span>
                      </p>
                      <div className="flex flex-col gap-3">
                        <Field
                          label="Full name *"
                          error={
                            lead.fullName && lead.fullName.trim().length < 2
                              ? "Too short"
                              : undefined
                          }
                        >
                          <Input
                            value={lead.fullName}
                            onChange={(e) => setLead({ ...lead, fullName: e.target.value })}
                            placeholder="Your name"
                          />
                        </Field>
                        <Field
                          label="Email *"
                          error={
                            lead.email && !EMAIL_RE.test(lead.email)
                              ? "Doesn't look like an email"
                              : undefined
                          }
                        >
                          <Input
                            type="email"
                            value={lead.email}
                            onChange={(e) => setLead({ ...lead, email: e.target.value })}
                            placeholder="you@example.com"
                          />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Phone / WhatsApp">
                            <Input
                              value={lead.phone}
                              onChange={(e) => setLead({ ...lead, phone: e.target.value })}
                              placeholder="Optional"
                            />
                          </Field>
                          <Field label="Country">
                            <Input
                              value={lead.country}
                              onChange={(e) => setLead({ ...lead, country: e.target.value })}
                              placeholder="Optional"
                            />
                          </Field>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Surf level">
                            <Select
                              value={lead.surfLevel}
                              onChange={(e) => setLead({ ...lead, surfLevel: e.target.value })}
                            >
                              <option value="">Not sure yet</option>
                              <option value="beginner">Beginner</option>
                              <option value="intermediate">Intermediate</option>
                              <option value="advanced">Advanced</option>
                            </Select>
                          </Field>
                          <Field label="Allergies / diet">
                            <Input
                              value={lead.allergies}
                              onChange={(e) => setLead({ ...lead, allergies: e.target.value })}
                              placeholder="Optional"
                            />
                          </Field>
                        </div>
                      </div>
                    </div>

                    {/* Companions */}
                    {companions.map((companion, i) => (
                      <div
                        key={i}
                        className="rounded-xl2 border border-sand-200 bg-white p-5"
                        style={{ boxShadow: "var(--shadow-diffuse)" }}
                      >
                        <p className="mb-4 text-sm font-black text-ocean-800">Guest {i + 2}</p>
                        <div className="flex flex-col gap-3">
                          <Field
                            label="Full name *"
                            error={
                              companion.name && companion.name.trim().length < 2
                                ? "Too short"
                                : undefined
                            }
                          >
                            <Input
                              value={companion.name}
                              onChange={(e) => {
                                const next = [...companions];
                                next[i] = { ...next[i], name: e.target.value };
                                setCompanions(next);
                              }}
                              placeholder={`Guest ${i + 2} name`}
                            />
                          </Field>
                          <Field label="Surf level">
                            <Select
                              value={companion.surfLevel}
                              onChange={(e) => {
                                const next = [...companions];
                                next[i] = { ...next[i], surfLevel: e.target.value };
                                setCompanions(next);
                              }}
                            >
                              <option value="">Not sure yet</option>
                              <option value="beginner">Beginner</option>
                              <option value="intermediate">Intermediate</option>
                              <option value="advanced">Advanced</option>
                            </Select>
                          </Field>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Prompt for dates */}
              {totalGuests > 0 && !datesValid && (
                <div className="flow-in mt-8 rounded-xl2 border border-dashed border-sand-300 bg-white p-8 text-center">
                  <CalendarBlank size={26} weight="duotone" className="mx-auto text-ocean-400" />
                  <p className="mt-3 font-bold">When are you coming?</p>
                  <Button className="mt-4" onClick={() => setDatesOpen(true)}>
                    Choose dates
                  </Button>
                </div>
              )}

              {/* Rooms */}
              {totalGuests > 0 && datesValid && (
                <section className="flow-in mt-10">
                  <h2 className="mb-3 font-bold tracking-tight">Where do you want to sleep?</h2>
                  {availability === undefined ? (
                    <SkeletonRows count={3} />
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {availability.rooms.map((room) => {
                        const tooSmall =
                          room.mode === "dorm" ? totalGuests > 1 : totalGuests > room.capacity;
                        const soldOut = !room.available;
                        const disabled = soldOut || tooSmall;
                        const selected = roomId === room.roomId;
                        return (
                          <button
                            key={room.roomId}
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                              setRoomId(room.roomId);
                              setPackageId("");
                            }}
                            className={cx(
                              "overflow-hidden rounded-xl2 border bg-white text-left transition-all",
                              disabled && "opacity-50",
                              selected
                                ? "border-ocean-500 shadow-[0_0_0_2px_var(--color-ocean-500)]"
                                : "border-sand-200 hover:border-sand-300 cursor-pointer",
                            )}
                            style={{ boxShadow: selected ? undefined : "var(--shadow-diffuse)" }}
                          >
                            {room.imageUrl && (
                              <div className="relative">
                                <img
                                  src={room.imageUrl}
                                  alt={room.name}
                                  loading="lazy"
                                  className="h-40 w-full object-cover"
                                />
                                {(soldOut || tooSmall) && (
                                  <span className="absolute inset-0 flex items-center justify-center bg-ink/45 text-sm font-bold text-sand-50">
                                    {soldOut ? "Booked for these dates" : `Sleeps ${room.capacity} max`}
                                  </span>
                                )}
                                {selected && (
                                  <span className="absolute right-2 top-2 rounded-full bg-ocean-600 px-2.5 py-1 text-[11px] font-black text-sand-50">
                                    Selected
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="flex items-start justify-between gap-3 p-4">
                              <div className="min-w-0">
                                <p className="font-bold">{room.name}</p>
                                <p className="mt-0.5 line-clamp-2 text-xs text-ink-faint">
                                  {room.description}
                                </p>
                                <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-soft">
                                  <Users size={13} />
                                  {room.mode === "dorm" ? "per bed" : `sleeps ${room.capacity}`}
                                  <span className="text-ink-faint">· {room.typeName}</span>
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="num text-lg font-bold text-ocean-700">
                                  {eur(room.pricePerNight)}
                                </p>
                                <p className="text-[11px] text-ink-faint">/night</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* Packages + extras */}
              {selectedRoom && availability && (
                <section className="flow-in mt-10 flex flex-col gap-8">
                  {availability.packages.length > 0 && (
                    <div>
                      <h2 className="mb-1 font-bold tracking-tight">Make it a surf week?</h2>
                      <p className="mb-3 text-sm text-ink-faint">
                        Packages sized exactly for your {availability.nights}-night stay.
                      </p>
                      <div className="flex flex-col gap-3">
                        <button
                          type="button"
                          onClick={() => setPackageId("")}
                          className={cx(
                            "rounded-xl2 border bg-white p-4 text-left text-sm transition-all cursor-pointer",
                            packageId === ""
                              ? "border-ocean-500 shadow-[0_0_0_1px_var(--color-ocean-500)]"
                              : "border-sand-200 hover:border-sand-300",
                          )}
                        >
                          <span className="font-bold">Room only</span>
                          <span className="text-ink-faint"> — add lessons and extras later</span>
                        </button>
                        {availability.packages.map((pkg) => (
                          <button
                            key={pkg.packageId}
                            type="button"
                            onClick={() => setPackageId(pkg.packageId)}
                            className={cx(
                              "rounded-xl2 border bg-white p-4 text-left transition-all cursor-pointer",
                              packageId === pkg.packageId
                                ? "border-ocean-500 shadow-[0_0_0_1px_var(--color-ocean-500)]"
                                : "border-sand-200 hover:border-sand-300",
                            )}
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="text-sm font-bold">{pkg.name}</p>
                                <p className="mt-0.5 text-xs text-ink-faint">{pkg.description}</p>
                              </div>
                              <p className="num shrink-0 text-right font-bold text-ocean-700">
                                {eur(pkg.price)}
                                <span className="block text-[10px] font-medium text-ink-faint">
                                  / person / week
                                </span>
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {availability.services.length > 0 && (
                    <div>
                      <h2 className="mb-1 font-bold tracking-tight">Add extras</h2>
                      <div className="flex flex-col gap-2">
                        {availability.services.map((service) => {
                          const qty = selectedServices[service.serviceId];
                          const active = qty !== undefined;
                          return (
                            <div
                              key={service.serviceId}
                              className={cx(
                                "flex items-center gap-3 rounded-xl2 border bg-white px-4 py-3 transition-all",
                                active
                                  ? "border-ocean-500 shadow-[0_0_0_1px_var(--color-ocean-500)]"
                                  : "border-sand-200 hover:border-sand-300",
                              )}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedServices((prev) => {
                                    const next = { ...prev };
                                    if (next[service.serviceId]) delete next[service.serviceId];
                                    else next[service.serviceId] = 1;
                                    return next;
                                  })
                                }
                                className={cx(
                                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors cursor-pointer",
                                  active
                                    ? "border-ocean-600 bg-ocean-600 text-white"
                                    : "border-sand-300 bg-white",
                                )}
                              >
                                {active && <Check size={13} weight="bold" />}
                              </button>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold">{service.name}</p>
                                <p className="text-xs text-ink-faint">
                                  {eur(service.price)} {service.unit.replace("_", " ")}
                                </p>
                              </div>
                              {active && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedServices((prev) => ({
                                        ...prev,
                                        [service.serviceId]: Math.max(1, qty - 1),
                                      }))
                                    }
                                    className="h-7 w-7 rounded-lg border border-sand-200 text-sm font-bold text-ink-soft hover:bg-sand-100 cursor-pointer"
                                  >
                                    −
                                  </button>
                                  <span className="num w-7 text-center text-sm font-bold">{qty}</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedServices((prev) => ({
                                        ...prev,
                                        [service.serviceId]: Math.min(30, qty + 1),
                                      }))
                                    }
                                    className="h-7 w-7 rounded-lg border border-sand-200 text-sm font-bold text-ink-soft hover:bg-sand-100 cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              )}
                              {active && (
                                <span className="num w-16 text-right text-sm font-bold text-ocean-700">
                                  {eur(service.price * qty)}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <Field label="Anything else?">
                    <Textarea
                      value={lead.notes}
                      onChange={(e) => setLead({ ...lead, notes: e.target.value })}
                      placeholder="Arrival time, requests…"
                    />
                  </Field>
                </section>
              )}

              {error && (
                <p className="mt-4 rounded-xl border border-coral/25 bg-coral/10 px-3.5 py-2.5 text-sm text-coral">
                  {error}
                </p>
              )}

              {/* Desktop continue */}
              {totalGuests > 0 && (
                <div className="mt-8 hidden items-center gap-3 lg:flex">
                  <Button onClick={() => void handleContinue()} disabled={!canPay}>
                    {submitting ? "Creating booking…" : "Continue to payment"}
                    <ArrowRight size={15} weight="bold" />
                  </Button>
                  {missing && <span className="text-xs text-ink-faint">{missing}</span>}
                </div>
              )}
            </>
          )}
        </div>

        {/* Sticky summary */}
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <SummaryCard
              guests={totalGuests}
              checkIn={checkIn}
              checkOut={checkOut}
              nights={availability?.nights}
              room={selectedRoom}
              pkg={selectedPackage}
              services={availability?.services ?? []}
              selectedServices={selectedServices}
              total={total}
            />
          </div>
        </aside>
      </div>

      {/* Mobile bottom bar */}
      {!confirmation && totalGuests > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-sand-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-ink-faint">
                {totalGuests} guest{totalGuests === 1 ? "" : "s"}
                {availability?.nights ? ` · ${availability.nights}n` : ""}
              </p>
              <p className="num text-lg font-black leading-tight">{eur(total)}</p>
            </div>
            <Button onClick={() => void handleContinue()} disabled={!canPay}>
              {submitting ? "Creating…" : "To payment"}
              <ArrowRight size={15} weight="bold" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Guests pill + popover ────────────────────────────────────────────────

function Stepper({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-2">
      <span className="text-sm font-semibold">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-sand-300 text-ink-soft transition-colors hover:bg-sand-100 cursor-pointer"
        >
          <Minus size={13} weight="bold" />
        </button>
        <span className="num w-8 text-center font-bold">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(12, value + 1))}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-sand-300 text-ink-soft transition-colors hover:bg-sand-100 cursor-pointer"
        >
          <Plus size={13} weight="bold" />
        </button>
      </div>
    </div>
  );
}

function GuestsPill({
  adults,
  children,
  setAdults,
  setChildren,
  open,
  setOpen,
}: {
  adults: number;
  children: number;
  setAdults: (n: number) => void;
  setChildren: (n: number) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const total = adults + children;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cx(
          "flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer",
          open ? "border-ocean-500" : "border-sand-200 hover:border-sand-300",
        )}
      >
        <Users size={16} weight="duotone" className="text-ocean-600" />
        {total > 0 ? `Guests: ${total}` : "Add guests"}
        {total > 0 && (
          <X
            size={13}
            className="text-ink-faint hover:text-ink"
            onClick={(e) => {
              e.stopPropagation();
              setAdults(0);
              setChildren(0);
            }}
          />
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl2 border border-sand-200 bg-white p-4 shadow-xl">
          <Stepper label="Adults" value={adults} min={0} onChange={setAdults} />
          <Stepper label="Children" value={children} min={0} onChange={setChildren} />
          <div className="mt-2 flex items-center justify-between border-t border-sand-100 pt-3">
            <span className="text-sm font-bold">Total</span>
            <span className="num font-black">{total}</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="mt-3 w-full text-center text-sm font-semibold text-ocean-700 hover:underline cursor-pointer"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

// ── Dates pill + two-month range calendar ────────────────────────────────

function DatesPill({
  checkIn,
  checkOut,
  setCheckIn,
  setCheckOut,
  open,
  setOpen,
  availability,
  today,
  disabled,
}: {
  checkIn: string | null;
  checkOut: string | null;
  setCheckIn: (d: string | null) => void;
  setCheckOut: (d: string | null) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  availability: Record<string, number> | undefined;
  today: string;
  disabled?: boolean;
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  function pick(iso: string) {
    if (!checkIn || (checkIn && checkOut)) {
      setCheckIn(iso);
      setCheckOut(null);
    } else if (iso > checkIn) {
      setCheckOut(iso);
      setOpen(false);
    } else {
      setCheckIn(iso);
      setCheckOut(null);
    }
  }

  const month = (base: Date) => {
    const days = eachDayOfInterval({ start: startOfMonth(base), end: endOfMonth(base) });
    const padding = (days[0].getDay() + 6) % 7; // Monday-first
    return (
      <div className="w-64">
        <p className="mb-2 text-center font-bold">{format(base, "MMMM yyyy")}</p>
        <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] font-semibold text-ink-faint">
          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-y-0.5 text-center text-sm">
          {Array.from({ length: padding }, (_, i) => (
            <span key={`p${i}`} />
          ))}
          {days.map((day) => {
            const iso = format(day, "yyyy-MM-dd");
            const past = iso < today;
            const known = availability?.[iso] !== undefined;
            const full = known && availability![iso] === 0;
            // a full date can still be a checkout day
            const selectableAsEnd = !!checkIn && !checkOut && iso > checkIn;
            const unavailable = past || (full && !selectableAsEnd) || (!known && !past);
            const isStart = iso === checkIn;
            const isEnd = iso === checkOut;
            const inRange = checkIn && checkOut && iso > checkIn && iso < checkOut;
            return (
              <button
                key={iso}
                type="button"
                disabled={unavailable}
                onClick={() => pick(iso)}
                className={cx(
                  "num mx-auto flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                  unavailable
                    ? "text-sand-400 line-through"
                    : "cursor-pointer hover:bg-ocean-100",
                  (isStart || isEnd) && "bg-ocean-800 font-bold text-sand-50 hover:bg-ocean-800",
                  inRange && "rounded-none bg-ocean-100",
                )}
              >
                {format(day, "d")}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        className={cx(
          "flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold transition-colors",
          disabled ? "opacity-60" : "cursor-pointer",
          open ? "border-ocean-500" : "border-sand-200 hover:border-sand-300",
        )}
      >
        <CalendarBlank size={16} weight="duotone" className="text-ocean-600" />
        {checkIn ? prettyDate(checkIn) : "Start date"}
        <ArrowRight size={13} className="text-ink-faint" />
        {checkOut ? prettyDate(checkOut) : "End date"}
        {(checkIn || checkOut) && (
          <X
            size={13}
            className="text-ink-faint hover:text-ink"
            onClick={(e) => {
              e.stopPropagation();
              setCheckIn(null);
              setCheckOut(null);
            }}
          />
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 rounded-xl2 border border-sand-200 bg-white p-5 shadow-xl">
          <div className="flex items-start gap-3">
            <button
              onClick={() => setCursor(addMonths(cursor, -1))}
              className="mt-0.5 rounded-lg border border-sand-200 p-1.5 text-ink-soft hover:bg-sand-100 cursor-pointer"
            >
              <CaretLeft size={14} weight="bold" />
            </button>
            <div className="flex flex-col gap-6 sm:flex-row">
              {month(cursor)}
              <div className="hidden sm:block">{month(addMonths(cursor, 1))}</div>
            </div>
            <button
              onClick={() => setCursor(addMonths(cursor, 1))}
              className="mt-0.5 rounded-lg border border-sand-200 p-1.5 text-ink-soft hover:bg-sand-100 cursor-pointer"
            >
              <CaretRight size={14} weight="bold" />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-sand-100 pt-3">
            <button
              onClick={() => {
                setCheckIn(null);
                setCheckOut(null);
              }}
              className="rounded-lg bg-coral px-3 py-1.5 text-xs font-bold text-sand-50 cursor-pointer"
            >
              Clear selected dates
            </button>
            <p className="text-xs text-ink-faint">
              <span className="line-through">15</span> fully booked ·{" "}
              {checkIn && !checkOut ? "now pick your end date" : "pick a start date"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sticky summary ───────────────────────────────────────────────────────

function SummaryCard({
  guests,
  checkIn,
  checkOut,
  nights,
  room,
  pkg,
  services,
  selectedServices,
  total,
}: {
  guests: number;
  checkIn: string | null;
  checkOut: string | null;
  nights?: number;
  room?: { name: string; pricePerNight: number; totalForStay: number };
  pkg?: { name: string; price: number };
  services: { serviceId: string; name: string; price: number }[];
  selectedServices: Record<string, number>;
  total: number;
}) {
  const serviceLines = useMemo(
    () =>
      Object.entries(selectedServices)
        .map(([id, qty]) => {
          const service = services.find((s) => s.serviceId === id);
          return service ? { name: service.name, qty, amount: service.price * qty } : null;
        })
        .filter(Boolean) as { name: string; qty: number; amount: number }[],
    [selectedServices, services],
  );

  return (
    <div
      className="rounded-xl2 border border-sand-200 bg-white p-5"
      style={{ boxShadow: "var(--shadow-diffuse)" }}
    >
      <div className="flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-ink-faint">Guests</span>
          <span className="num font-bold">{guests || "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-faint">Check-in</span>
          <span className="num font-bold">{checkIn ? prettyDate(checkIn) : "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-faint">Check-out</span>
          <span className="num font-bold">{checkOut ? prettyDate(checkOut) : "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-faint">Duration</span>
          <span className="num font-bold">{nights ? `${nights} nights` : "—"}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-sand-100 pt-4 text-sm">
        {room && pkg ? (
          <>
            <div className="flex justify-between gap-3">
              <span className="font-semibold">
                {pkg.name}
                <span className="block text-xs font-normal text-ink-faint">
                  {eur(pkg.price)} / person × {guests}
                </span>
              </span>
              <span className="num font-semibold">{eur(pkg.price * Math.max(1, guests))}</span>
            </div>
            <p className="text-xs text-ink-faint">All-inclusive · staying in {room.name}</p>
          </>
        ) : room ? (
          <div className="flex justify-between gap-3">
            <span className="font-semibold">
              {room.name}
              <span className="block text-xs font-normal text-ink-faint">
                {eur(room.pricePerNight)} × {nights ?? "…"} nights
              </span>
            </span>
            <span className="num font-semibold">{eur(room.totalForStay)}</span>
          </div>
        ) : (
          <p className="text-ink-faint">No room selected yet.</p>
        )}
        {serviceLines.map((line) => (
          <div key={line.name} className="flex justify-between gap-3 text-ink-soft">
            <span>
              {line.name} <span className="num text-xs text-ink-faint">×{line.qty}</span>
            </span>
            <span className="num">{eur(line.amount)}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-sand-200 pt-3">
        <span className="font-black">Total</span>
        <span className="num text-xl font-black text-ocean-800">{eur(total)}</span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        Nothing is charged until the crew confirms your request. Payment is a simulation.
      </p>
    </div>
  );
}

// ── Payment step (unchanged behavior) ────────────────────────────────────

function PaymentStep({
  confirmation,
  onPaid,
  onSkip,
}: {
  confirmation: Confirmation;
  onPaid: (amount: number) => void;
  onSkip: () => void;
}) {
  const payCard = useMutation(api.portal.simulateCardPayment);
  const declareTransfer = useMutation(api.portal.declareBankTransfer);
  const [method, setMethod] = useState<"card" | "transfer">("card");
  const [amount, setAmount] = useState(String(confirmation.totalAmount));
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountValid = Number(amount) >= 1 && Number(amount) <= confirmation.totalAmount;
  const digits = cardNumber.replace(/\D/g, "");
  const expiryValid = (() => {
    const m = expiry.match(/^(\d{2})\/(\d{2})$/);
    if (!m) return false;
    const monthNum = Number(m[1]);
    if (monthNum < 1 || monthNum > 12) return false;
    return new Date(2000 + Number(m[2]), monthNum, 0) >= new Date();
  })();
  const cardValid =
    digits.length === 16 && cardName.trim().length >= 3 && expiryValid && /^\d{3,4}$/.test(cvc);

  async function handlePay() {
    setError(null);
    setProcessing(true);
    await new Promise((r) => setTimeout(r, 1800));
    try {
      const result = await payCard({
        token: confirmation.portalToken,
        amount: Number(amount),
        cardLast4: digits.slice(-4),
      });
      onPaid(result.paid);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.replace(/^.*Uncaught Error:\s*/, "").replace(/ at .*$/s, "")
          : "Payment failed",
      );
      setProcessing(false);
    }
  }

  async function handleTransfer() {
    setError(null);
    try {
      await declareTransfer({ token: confirmation.portalToken, amount: Number(amount) });
      onPaid(0);
    } catch {
      setError("Could not send — try again.");
    }
  }

  return (
    <section
      className="flow-in rounded-xl2 border border-sand-200 bg-white p-6"
      style={{ boxShadow: "var(--shadow-diffuse)" }}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-bold tracking-tight">Payment</h2>
        <span className="rounded-full border border-dune/40 bg-dune/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#8a6420]">
          Simulation
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-faint">
        Your booking is registered — reservation{" "}
        <span className="num font-bold text-ocean-800">{confirmation.reservationCode}</span>.
        Secure your spot now or pay at the house.
      </p>

      <div className="mt-5 flex gap-2">
        {(
          [
            { key: "card", label: "Pay by card", icon: CreditCard },
            { key: "transfer", label: "Bank transfer", icon: Bank },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setMethod(key);
              setError(null);
            }}
            className={cx(
              "flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors cursor-pointer",
              method === key
                ? "border-ocean-500 bg-ocean-50 text-ocean-800"
                : "border-sand-200 bg-white text-ink-faint hover:border-sand-300",
            )}
          >
            <Icon size={16} weight="duotone" />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-4">
        <Field
          label={`Amount (EUR) — total ${eur(confirmation.totalAmount)}`}
          hint="Pay it all or just a deposit"
        >
          <Input
            type="number"
            min={1}
            max={confirmation.totalAmount}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>

        {method === "card" ? (
          <>
            <Field label="Card number" hint="Simulation — try 4242 4242 4242 4242">
              <Input
                inputMode="numeric"
                placeholder="1234 5678 9012 3456"
                className="num"
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
              />
            </Field>
            <Field label="Name on card">
              <Input
                placeholder="As printed on the card"
                value={cardName}
                onChange={(e) => setCardName(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Expiry">
                <Input
                  inputMode="numeric"
                  placeholder="MM/YY"
                  className="num"
                  value={expiry}
                  onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                />
              </Field>
              <Field label="CVC">
                <Input
                  inputMode="numeric"
                  placeholder="123"
                  className="num"
                  value={cvc}
                  onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </Field>
            </div>
            {error && (
              <p className="rounded-xl border border-coral/25 bg-coral/10 px-3.5 py-2.5 text-sm text-coral">
                {error}
              </p>
            )}
            <Button
              onClick={() => void handlePay()}
              disabled={!cardValid || !amountValid || processing}
              className="w-full"
            >
              {processing ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sand-50/40 border-t-sand-50" />
                  Processing…
                </span>
              ) : (
                <>
                  <LockSimple size={14} weight="bold" /> Pay {amountValid ? eur(Number(amount)) : ""}
                </>
              )}
            </Button>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-sand-200 bg-sand-50 p-4 text-sm">
              <p>
                <span className="text-xs text-ink-faint">Beneficiary </span>
                <span className="font-semibold">Kymata Surf Morocco SARL</span>
              </p>
              <p className="num mt-1">
                <span className="font-sans text-xs text-ink-faint">IBAN </span>
                <span className="font-semibold">MA64 0117 6400 0221 0000 5312 84</span>
              </p>
              <p className="mt-1">
                <span className="text-xs text-ink-faint">Reference </span>
                <span className="num font-bold text-ocean-700">
                  {confirmation.reservationCode}
                </span>
              </p>
            </div>
            {error && (
              <p className="rounded-xl border border-coral/25 bg-coral/10 px-3.5 py-2.5 text-sm text-coral">
                {error}
              </p>
            )}
            <Button
              variant="secondary"
              onClick={() => void handleTransfer()}
              disabled={!amountValid}
              className="w-full"
            >
              <Bank size={15} weight="duotone" /> I've made the transfer
            </Button>
          </>
        )}

        <button
          onClick={onSkip}
          className="text-center text-sm font-semibold text-ink-faint hover:text-ink cursor-pointer"
        >
          Skip — I'll pay at the house
        </button>
      </div>
    </section>
  );
}
