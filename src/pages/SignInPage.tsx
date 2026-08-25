import { useRef, useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { Button, Field, Input } from "../components/ui";

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.fromTo(
        ".hero-wave",
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.9, stagger: 0.12 },
      )
        .fromTo(
          ".hero-line",
          { opacity: 0, y: 28 },
          { opacity: 1, y: 0, duration: 0.7, stagger: 0.09 },
          "-=0.6",
        )
        .fromTo(
          ".form-item",
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 0.5, stagger: 0.06 },
          "-=0.5",
        );

      // perpetual gentle wave drift
      gsap.to(".drift", {
        x: -30,
        duration: 6,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
      });
    },
    { scope },
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const formData = new FormData(e.currentTarget);
    formData.set("flow", flow);
    try {
      await signIn("password", formData);
    } catch {
      setError(
        flow === "signIn"
          ? "Wrong email or password."
          : "Could not create the account. Password needs 8+ characters.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div ref={scope} className="flex min-h-[100dvh]">
      {/* Left — brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ocean-900 p-12 text-sand-50 lg:flex lg:w-[46%]">
        <div className="hero-line flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-sand-50/90 backdrop-blur">
            <img src="/mascot.png" alt="" className="h-9 w-9 object-contain" />
          </span>
          <span className="text-lg font-black tracking-tight">
            Surf School Rabat
          </span>
        </div>

        <div>
          <h1 className="hero-line max-w-md text-5xl font-black leading-[1.05] tracking-tighter">
            The tide does the work. You just steer.
          </h1>
          <p className="hero-line mt-5 max-w-sm text-ocean-200">
            Rooms, beds, lessons, transfers and every booking channel — one
            calm place to run the whole camp.
          </p>
        </div>

        <svg
          className="drift pointer-events-none absolute -bottom-8 left-0 w-[130%] opacity-40"
          viewBox="0 0 900 160"
          fill="none"
        >
          <path
            className="hero-wave"
            d="M0 60c60-40 120-40 180 0s120 40 180 0 120-40 180 0 120 40 180 0 120-40 180 0"
            stroke="#bda3e2"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            className="hero-wave"
            d="M0 110c60-40 120-40 180 0s120 40 180 0 120-40 180 0 120 40 180 0 120-40 180 0"
            stroke="#f9c74f"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>

        <p className="hero-line text-xs text-ocean-300">
          Tamraght, Agadir-Ida-ou-Tanane · Morocco
        </p>
      </div>

      {/* Right — form */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="form-item mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-100">
              <img src="/mascot.png" alt="" className="h-8 w-8 object-contain" />
            </span>
            <span className="font-black tracking-tight">Surf School Rabat</span>
          </div>

          <h2 className="form-item text-2xl font-black tracking-tight">
            {flow === "signIn" ? "Welcome back" : "Join the crew"}
          </h2>
          <p className="form-item mt-1.5 text-sm text-ink-faint">
            {flow === "signIn"
              ? "Sign in to manage the house."
              : "New accounts start as crew — an admin sets your role."}
          </p>

          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
            {flow === "signUp" && (
              <div className="form-item">
                <Field label="Full name">
                  <Input name="name" placeholder="Yassine Amrani" required />
                </Field>
              </div>
            )}
            <div className="form-item">
              <Field label="Email">
                <Input
                  name="email"
                  type="email"
                  placeholder="you@surfhouse.ma"
                  autoComplete="email"
                  required
                />
              </Field>
            </div>
            <div className="form-item">
              <Field label="Password" hint={flow === "signUp" ? "At least 8 characters" : undefined}>
                <Input
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete={flow === "signIn" ? "current-password" : "new-password"}
                  required
                />
              </Field>
            </div>

            {error && (
              <p className="form-item rounded-xl border border-coral/25 bg-coral/10 px-3.5 py-2.5 text-sm text-coral">
                {error}
              </p>
            )}

            <div className="form-item mt-1">
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting
                  ? "One moment…"
                  : flow === "signIn"
                    ? "Sign in"
                    : "Create account"}
              </Button>
            </div>
          </form>

          <p className="form-item mt-6 text-center text-sm text-ink-faint">
            {flow === "signIn" ? "New to the team?" : "Already have an account?"}{" "}
            <button
              onClick={() => {
                setFlow(flow === "signIn" ? "signUp" : "signIn");
                setError(null);
              }}
              className="font-semibold text-ocean-700 hover:underline cursor-pointer"
            >
              {flow === "signIn" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
