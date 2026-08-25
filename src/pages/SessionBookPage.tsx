import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { addDays, format } from "date-fns";
import { ArrowRight, CheckCircle, Plus, Trash } from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button, Field, Input, Select, SkeletonRows, Textarea, cx } from "../components/ui";
import { eur, prettyDate } from "../lib/format";
import { initTracking, track } from "../lib/tracking";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CartItem = { key: string; roomId: Id<"rooms">; date: string; name: string; price: number };
type Confirmation = { portalToken: string; reservationCode: string; total: number; count: number };

export default function SessionBookPage() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [lead, setLead] = useState({ fullName: "", email: "", phone: "", surfLevel: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const dateValid = date >= today;
  const availability = useQuery(
    api.publicBooking.availability,
    dateValid ? { checkIn: date, checkOut: format(addDays(new Date(date), 1), "yyyy-MM-dd") } : "skip",
  );
  const bookSessions = useMutation(api.publicBooking.bookSessions);

  const trackingConfig = useQuery(api.tracking.get, {});
  useEffect(() => {
    if (trackingConfig !== undefined) initTracking(trackingConfig);
  }, [trackingConfig]);
  useEffect(() => {
    if (trackingConfig) track("ViewContent");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackingConfig !== undefined && trackingConfig !== null]);

  const total = useMemo(() => cart.reduce((s, c) => s + c.price, 0), [cart]);
  const cartCountForSession = (roomId: string, d: string) =>
    cart.filter((c) => c.roomId === roomId && c.date === d).length;

  function addToCart(roomId: Id<"rooms">, name: string, price: number) {
    setCart((prev) => [
      ...prev,
      { key: `${roomId}-${date}-${Math.random().toString(36).slice(2, 7)}`, roomId, date, name, price },
    ]);
  }

  const leadValid = lead.fullName.trim().length >= 2 && EMAIL_RE.test(lead.email);

  async function submit() {
    if (!leadValid || cart.length === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await bookSessions({
        fullName: lead.fullName,
        email: lead.email,
        phone: lead.phone || undefined,
        surfLevel: (lead.surfLevel as "beginner" | "intermediate" | "advanced") || undefined,
        notes: lead.notes || undefined,
        items: cart.map((c) => ({ roomId: c.roomId, date: c.date })),
      });
      track("Lead", { value: result.total, currency: "EUR", id: result.reservationCode });
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

  if (confirmation) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-ocean-900 px-6">
        <div className="w-full max-w-md text-center text-sand-50">
          <CheckCircle size={52} weight="duotone" className="mx-auto text-ocean-300" />
          <h1 className="mt-5 text-3xl font-black tracking-tighter">Sessions booked.</h1>
          <p className="mt-3 text-ocean-200">
            {confirmation.count} session{confirmation.count === 1 ? "" : "s"} ·{" "}
            <span className="num font-bold text-sand-50">{eur(confirmation.total)}</span>
          </p>
          <div className="mx-auto mt-5 inline-block rounded-xl border border-white/15 bg-white/10 px-5 py-3">
            <p className="text-[11px] uppercase tracking-wide text-ocean-300">Your booking code</p>
            <p className="num mt-0.5 text-2xl font-black tracking-widest">{confirmation.reservationCode}</p>
          </div>
          <Link
            to={`/guest/${confirmation.portalToken}`}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-sand-50 px-5 py-2.5 font-semibold text-ocean-900 transition-transform active:scale-[0.98]"
          >
            Manage my sessions <ArrowRight size={16} weight="bold" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-sand-50 pb-28 lg:pb-10">
      <div className="bg-ocean-900 px-4 py-4 text-sand-50 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-sand-50/90">
            <img src="/mascot.png" alt="" className="h-8 w-8 object-contain" />
          </span>
          <div>
            <p className="font-black tracking-tight">Surf School Rabat</p>
            <p className="text-xs text-ocean-200">Book your surf sessions · no charge until confirmed</p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 pt-8 sm:px-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight">Pick your sessions</h1>
          <p className="mt-1 text-sm text-ink-faint">
            Choose a day, add the sessions you want, then repeat for other days. Each
            spot is one surfer.
          </p>

          <div className="mt-5 flex flex-wrap items-end gap-3">
            <Field label="Date">
              <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <p className="pb-2 text-sm font-semibold text-ink-soft">{prettyDate(date)}</p>
          </div>

          <div className="mt-4 grid gap-3">
            {availability === undefined ? (
              <SkeletonRows count={4} />
            ) : (
              availability.rooms.map((s) => {
                const inCart = cartCountForSession(s.roomId, date);
                return (
                  <div
                    key={s.roomId}
                    className={cx(
                      "flex items-center gap-4 rounded-xl2 border bg-white p-4 transition-colors",
                      s.available ? "border-sand-200" : "border-sand-200 opacity-55",
                    )}
                    style={{ boxShadow: "var(--shadow-diffuse)" }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{s.name}</p>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        {s.description}
                      </p>
                      <p className="mt-1 text-xs text-ink-soft">
                        {s.capacity} spots · {s.available ? "available" : "full"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="num text-lg font-bold text-ocean-700">{eur(s.pricePerNight)}</p>
                      <p className="text-[11px] text-ink-faint">/spot</p>
                    </div>
                    <Button
                      size="sm"
                      disabled={!s.available}
                      onClick={() => addToCart(s.roomId, s.name, s.pricePerNight)}
                    >
                      <Plus size={14} weight="bold" />
                      {inCart > 0 ? `Added ${inCart}` : "Add"}
                    </Button>
                  </div>
                );
              })
            )}
          </div>

          {error && (
            <p className="mt-4 rounded-xl border border-coral/25 bg-coral/10 px-3.5 py-2.5 text-sm text-coral">
              {error}
            </p>
          )}

          {showForm && (
            <section className="mt-8 rounded-xl2 border border-sand-200 bg-white p-6" style={{ boxShadow: "var(--shadow-lift)" }}>
              <h2 className="font-bold tracking-tight">Your details</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Full name">
                  <Input value={lead.fullName} onChange={(e) => setLead({ ...lead, fullName: e.target.value })} required />
                </Field>
                <Field label="Email">
                  <Input type="email" value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} required />
                </Field>
                <Field label="Phone">
                  <Input value={lead.phone} onChange={(e) => setLead({ ...lead, phone: e.target.value })} />
                </Field>
                <Field label="Your surf level">
                  <Select value={lead.surfLevel} onChange={(e) => setLead({ ...lead, surfLevel: e.target.value })}>
                    <option value="">Not sure yet</option>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </Select>
                </Field>
              </div>
              <Field label="Anything we should know?">
                <Textarea value={lead.notes} onChange={(e) => setLead({ ...lead, notes: e.target.value })} placeholder="Injuries, goals, group notes…" />
              </Field>
              <Button className="mt-4" onClick={() => void submit()} disabled={!leadValid || submitting}>
                {submitting ? "Booking…" : `Book ${cart.length} session${cart.length === 1 ? "" : "s"}`}
                <ArrowRight size={15} weight="bold" />
              </Button>
              {!leadValid && <p className="mt-2 text-xs text-ink-faint">Enter your name and a valid email.</p>}
            </section>
          )}
        </div>

        {/* Cart */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 rounded-xl2 border border-sand-200 bg-white p-5" style={{ boxShadow: "var(--shadow-diffuse)" }}>
            <h2 className="font-bold tracking-tight">Your sessions</h2>
            {cart.length === 0 ? (
              <p className="mt-3 text-sm text-ink-faint">No sessions yet — add some from the list.</p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-sand-100">
                {cart.map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{c.name}</p>
                      <p className="num text-xs text-ink-faint">{prettyDate(c.date)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="num font-semibold">{eur(c.price)}</span>
                      <button
                        onClick={() => setCart((prev) => prev.filter((x) => x.key !== c.key))}
                        className="text-ink-faint hover:text-coral cursor-pointer"
                        aria-label="Remove"
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex items-center justify-between border-t border-sand-200 pt-3">
              <span className="font-black">Total</span>
              <span className="num text-xl font-black text-ocean-800">{eur(total)}</span>
            </div>
            <Button
              className="mt-4 w-full justify-center"
              disabled={cart.length === 0}
              onClick={() => setShowForm(true)}
            >
              Continue <ArrowRight size={15} weight="bold" />
            </Button>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
              Nothing is charged until the school confirms. Payment is a simulation.
            </p>
          </div>
        </aside>
      </div>

      {/* Mobile bottom bar */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-sand-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-ink-faint">{cart.length} sessions</p>
            <p className="num text-lg font-black leading-tight">{eur(total)}</p>
          </div>
          <Button onClick={() => setShowForm(true)}>
            Continue <ArrowRight size={15} weight="bold" />
          </Button>
        </div>
      )}
    </div>
  );
}
