import { useEffect, useState } from "react";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { cx } from "./ui";

type Toast = { id: number; kind: "success" | "error"; message: string };

let pushToast: ((t: Omit<Toast, "id">) => void) | null = null;
let nextId = 1;

/** Fire-and-forget notification — safe to call from any event handler. */
export function toast(kind: "success" | "error", message: string) {
  pushToast?.({ kind, message });
}

/**
 * Extract the human sentence out of a Convex error (multi-line, wrapped in
 * request IDs and stack frames). Anything unrecognisable becomes the fallback
 * so users never see technical noise.
 */
export function errorMessage(err: unknown, fallback: string) {
  if (!(err instanceof Error)) return fallback;
  const match = err.message.match(
    /Uncaught \w*Error:\s*([\s\S]*?)(?:\s*\n\s*at\s|$)/,
  );
  const clean = match?.[1]?.trim();
  if (clean && !/Server Error|Request ID/i.test(clean)) return clean;
  return fallback;
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    pushToast = (t) => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== id));
      }, 4500);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[70] flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cx(
            "flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-sand-50 shadow-lg",
            t.kind === "success" ? "bg-ink" : "bg-coral",
          )}
        >
          {t.kind === "success" ? (
            <CheckCircle size={17} weight="bold" className="shrink-0" />
          ) : (
            <WarningCircle size={17} weight="bold" className="shrink-0" />
          )}
          {t.message}
        </div>
      ))}
    </div>
  );
}
