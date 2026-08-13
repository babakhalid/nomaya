import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
  Bank,
  Check,
  CheckCircle,
  Copy,
  CreditCard,
  LockSimple,
} from "@phosphor-icons/react";
import { api } from "../../../convex/_generated/api";
import { Button, Field, Input, cx } from "../ui";
import { eur } from "../../lib/format";

const BANK_DETAILS = {
  beneficiary: "Moana Surf Experience SARL",
  bank: "Banque du Souss (simulation)",
  iban: "MA64 0117 6400 0221 0000 5312 84",
  bic: "BDSXMAMC",
};

export function formatCardNumber(value: string) {
  return value
    .replace(/\D/g, "")
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function formatExpiry(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export default function PaymentSection({
  token,
  money,
  payments,
  reservationCode,
}: {
  token: string;
  money: { total: number; paid: number; balance: number };
  payments: { amount: number; direction: string; method: string; date: string }[];
  reservationCode?: string;
}) {
  const payCard = useMutation(api.portal.simulateCardPayment);
  const declareTransfer = useMutation(api.portal.declareBankTransfer);

  const [method, setMethod] = useState<"card" | "transfer">("card");
  const [amount, setAmount] = useState(String(money.balance > 0 ? money.balance : ""));
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [processing, setProcessing] = useState(false);
  const [paidNow, setPaidNow] = useState<number | null>(null);
  const [transferSent, setTransferSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (paidNow !== null) {
        gsap.fromTo(
          ".pay-success",
          { scale: 0.6, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(2)" },
        );
      }
    },
    { scope, dependencies: [paidNow] },
  );

  function validateCard(): string | null {
    const digits = cardNumber.replace(/\D/g, "");
    if (digits.length !== 16) return "Card number must be 16 digits.";
    if (cardName.trim().length < 3) return "Enter the name on the card.";
    const m = expiry.match(/^(\d{2})\/(\d{2})$/);
    if (!m) return "Expiry must be MM/YY.";
    const month = Number(m[1]);
    if (month < 1 || month > 12) return "Invalid expiry month.";
    const expDate = new Date(2000 + Number(m[2]), month, 0);
    if (expDate < new Date()) return "This card has expired.";
    if (!/^\d{3,4}$/.test(cvc)) return "CVC must be 3 or 4 digits.";
    return null;
  }

  async function handleCardPay(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const problem = validateCard();
    if (problem) {
      setError(problem);
      return;
    }
    setProcessing(true);
    // fake gateway latency
    await new Promise((r) => setTimeout(r, 1800));
    try {
      const result = await payCard({
        token,
        amount: Number(amount),
        cardLast4: cardNumber.replace(/\D/g, "").slice(-4),
      });
      setPaidNow(result.paid);
      setCardNumber("");
      setExpiry("");
      setCvc("");
      setAmount(result.newBalance > 0 ? String(result.newBalance) : "");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.replace(/^.*Uncaught Error:\s*/, "").replace(/ at .*$/s, "")
          : "Payment failed — try again.",
      );
    } finally {
      setProcessing(false);
    }
  }

  async function handleTransfer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      await declareTransfer({
        token,
        amount: Number(amount),
        reference: String(form.get("reference") ?? "") || undefined,
      });
      setTransferSent(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.replace(/^.*Uncaught Error:\s*/, "").replace(/ at .*$/s, "")
          : "Could not send — try again.",
      );
    }
  }

  const settled = money.balance <= 0.005;

  return (
    <section
      ref={scope}
      className="portal-item mt-8 rounded-xl2 border border-sand-200 bg-white p-6"
      style={{ boxShadow: "var(--shadow-diffuse)" }}
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-bold tracking-tight">
          <CreditCard size={18} weight="duotone" className="text-ocean-600" />
          Your bill
        </h2>
        <span className="rounded-full border border-dune/40 bg-dune/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#8a6420]">
          Payment simulation
        </span>
      </div>

      {/* Balance strip */}
      <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-sand-50 p-4">
        <div>
          <p className="text-xs text-ink-faint">Total stay</p>
          <p className="num mt-0.5 font-bold">{eur(money.total)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-faint">Paid</p>
          <p className="num mt-0.5 font-bold text-kelp">{eur(money.paid)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-faint">Balance</p>
          <p className={cx("num mt-0.5 font-bold", settled ? "text-kelp" : "text-coral")}>
            {eur(money.balance)}
          </p>
        </div>
      </div>

      {paidNow !== null && (
        <div className="pay-success mt-4 flex items-center gap-3 rounded-xl border border-kelp/30 bg-kelp/10 px-4 py-3">
          <CheckCircle size={22} weight="fill" className="text-kelp" />
          <div>
            <p className="text-sm font-bold text-kelp">Payment received — {eur(paidNow)}</p>
            <p className="text-xs text-ink-soft">
              Simulated transaction. Your balance updated instantly.
            </p>
          </div>
        </div>
      )}

      {settled && paidNow === null ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-kelp">
          <CheckCircle size={16} weight="fill" /> All settled — nothing to pay.
        </p>
      ) : !settled ? (
        <>
          {/* Method tabs */}
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

          {method === "card" ? (
            <form onSubmit={handleCardPay} className="mt-5 flex flex-col gap-4">
              <Field label="Amount (EUR)" hint={`Up to ${eur(money.balance)}`}>
                <Input
                  type="number"
                  min={1}
                  max={money.balance}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </Field>
              <Field label="Card number" hint="Simulation — try 4242 4242 4242 4242">
                <Input
                  inputMode="numeric"
                  placeholder="1234 5678 9012 3456"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                  className="num"
                  required
                />
              </Field>
              <Field label="Name on card">
                <Input
                  placeholder="As printed on the card"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  required
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Expiry">
                  <Input
                    inputMode="numeric"
                    placeholder="MM/YY"
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    className="num"
                    required
                  />
                </Field>
                <Field label="CVC">
                  <Input
                    inputMode="numeric"
                    placeholder="123"
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    className="num"
                    required
                  />
                </Field>
              </div>
              {error && (
                <p className="rounded-xl border border-coral/25 bg-coral/10 px-3.5 py-2.5 text-sm text-coral">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={processing} className="w-full">
                {processing ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sand-50/40 border-t-sand-50" />
                    Processing…
                  </span>
                ) : (
                  <>
                    <LockSimple size={14} weight="bold" />
                    Pay {amount ? eur(Number(amount)) : ""}
                  </>
                )}
              </Button>
              <p className="text-center text-[11px] text-ink-faint">
                Simulated checkout — no real charge. In production this screen is
                replaced by the Stripe payment element.
              </p>
            </form>
          ) : transferSent ? (
            <div className="mt-5 rounded-xl border border-kelp/30 bg-kelp/10 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-bold text-kelp">
                <CheckCircle size={16} weight="fill" /> Transfer declared
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                The crew will confirm receipt and your balance will update.
                Nothing is marked as paid until then.
              </p>
            </div>
          ) : (
            <form onSubmit={handleTransfer} className="mt-5 flex flex-col gap-4">
              <div className="rounded-xl border border-sand-200 bg-sand-50 p-4 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1.5">
                    <p>
                      <span className="text-xs text-ink-faint">Beneficiary </span>
                      <span className="font-semibold">{BANK_DETAILS.beneficiary}</span>
                    </p>
                    <p>
                      <span className="text-xs text-ink-faint">Bank </span>
                      <span className="font-semibold">{BANK_DETAILS.bank}</span>
                    </p>
                    <p className="num">
                      <span className="font-sans text-xs text-ink-faint">IBAN </span>
                      <span className="font-semibold">{BANK_DETAILS.iban}</span>
                    </p>
                    <p className="num">
                      <span className="font-sans text-xs text-ink-faint">BIC </span>
                      <span className="font-semibold">{BANK_DETAILS.bic}</span>
                    </p>
                    <p>
                      <span className="text-xs text-ink-faint">Reference </span>
                      <span className="num font-bold text-ocean-700">
                        {reservationCode ?? "your reservation code"}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        `${BANK_DETAILS.beneficiary}\n${BANK_DETAILS.iban}\nBIC: ${BANK_DETAILS.bic}\nRef: ${reservationCode ?? ""}`,
                      );
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-sand-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:border-sand-300 cursor-pointer"
                  >
                    {copied ? <Check size={12} weight="bold" /> : <Copy size={12} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Amount you sent (EUR)">
                  <Input
                    type="number"
                    min={1}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Your transfer reference">
                  <Input name="reference" placeholder="Optional" />
                </Field>
              </div>
              {error && (
                <p className="rounded-xl border border-coral/25 bg-coral/10 px-3.5 py-2.5 text-sm text-coral">
                  {error}
                </p>
              )}
              <Button type="submit" variant="secondary" className="w-full">
                <Bank size={15} weight="duotone" /> I've made the transfer
              </Button>
            </form>
          )}
        </>
      ) : null}

      {/* Payment history */}
      {payments.length > 0 && (
        <div className="mt-5 border-t border-sand-100 pt-3">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint">
            Payment history
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {payments.map((payment, i) => (
              <li key={i} className="flex items-center justify-between">
                <span className="capitalize text-ink-soft">
                  {payment.method.replace("_", " ")}
                </span>
                <span className="flex items-center gap-3">
                  <span className="num text-xs text-ink-faint">{payment.date}</span>
                  <span
                    className={cx(
                      "num font-semibold",
                      payment.direction === "in" ? "text-kelp" : "text-coral",
                    )}
                  >
                    {payment.direction === "in" ? "+" : "−"}
                    {eur(payment.amount)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
