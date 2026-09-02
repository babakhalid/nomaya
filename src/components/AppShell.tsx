import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
  CalendarBlank,
  Tray,
  ChartLineUp,
  ClockCounterClockwise,
  GearSix,
  List,
  Plugs,
  SignOut,
  SquaresFour,
  UsersThree,
  X,
  Wallet,
} from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import { cx } from "./ui";
import { canAccessPage, type Role } from "../lib/roles";
import { Toaster } from "./toast";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: SquaresFour, page: "dashboard" },
  { to: "/calendar", label: "Calendar", icon: CalendarBlank, page: "calendar" },
  { to: "/guests", label: "Guests", icon: UsersThree, page: "guests" },
  { to: "/requests", label: "Requests", icon: Tray, page: "requests" },
  { to: "/channels", label: "Channels", icon: Plugs, page: "channels" },
  { to: "/analytics", label: "Analytics", icon: ChartLineUp, page: "analytics" },
  { to: "/team", label: "Team & expenses", icon: Wallet, page: "team" },
  { to: "/settings", label: "Settings", icon: GearSix, page: "settings" },
  { to: "/logs", label: "Logs", icon: ClockCounterClockwise, page: "logs" },
] as const;

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-100">
        <img src="/mascot.png" alt="" className="h-8 w-8 object-contain" />
      </span>
      <div className="leading-tight">
        <p className="text-[15px] font-black tracking-tight">Azul Surf</p>
        <p className="text-[11px] font-medium text-ink-faint">Guesthouse · Morocco</p>
      </div>
    </div>
  );
}

function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3">
      {NAV.filter((item) => canAccessPage(role, item.page)).map(
        ({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors md:py-2",
                isActive
                  ? "bg-white text-ocean-700 shadow-[0_1px_3px_rgba(46,40,32,0.08)]"
                  : "text-ink-soft hover:bg-white/60 hover:text-ink",
              )
            }
          >
            <Icon size={18} weight="duotone" />
            {label}
          </NavLink>
        ),
      )}
    </nav>
  );
}

function UserCard({
  name,
  role,
  onSignOut,
}: {
  name: string;
  role: string;
  onSignOut: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ocean-100 text-xs font-bold text-ocean-800">
        {name.slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[13px] font-semibold">{name}</p>
        <p className="text-[11px] capitalize text-ink-faint">{role}</p>
      </div>
      <button
        onClick={onSignOut}
        className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-sand-200 hover:text-ink cursor-pointer"
        title="Sign out"
      >
        <SignOut size={16} weight="bold" />
      </button>
    </div>
  );
}

export default function AppShell() {
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.fromTo(
        mainRef.current,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.45, ease: "expo.out" },
      );
    },
    { dependencies: [location.pathname] },
  );

  // close the mobile menu on navigation
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const role = (me?.role ?? "crew") as Role;
  const displayName = me?.name ?? me?.email ?? "…";

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-sand-200 bg-sand-100/80 px-4 py-3 md:hidden">
        <Brand />
        <button
          onClick={() => setMenuOpen(true)}
          className="rounded-xl border border-sand-200 bg-white p-2 text-ink-soft cursor-pointer"
          aria-label="Open menu"
        >
          <List size={20} weight="bold" />
        </button>
      </header>

      {/* Mobile slide-over menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-ink/30"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-sand-100 shadow-2xl">
            <div className="flex items-center justify-between px-5 pb-4 pt-5">
              <Brand />
              <button
                onClick={() => setMenuOpen(false)}
                className="rounded-lg p-1.5 text-ink-faint cursor-pointer"
                aria-label="Close menu"
              >
                <X size={18} weight="bold" />
              </button>
            </div>
            <NavLinks role={role} onNavigate={() => setMenuOpen(false)} />
            <div className="border-t border-sand-200 p-3">
              <UserCard name={displayName} role={role} onSignOut={() => void signOut()} />
            </div>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-sand-200 bg-sand-100/60 md:flex">
        <div className="px-5 pb-6 pt-6">
          <Brand />
        </div>
        <NavLinks role={role} />
        <div className="border-t border-sand-200 p-3">
          <UserCard name={displayName} role={role} onSignOut={() => void signOut()} />
        </div>
      </aside>

      {/* Main */}
      <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 md:py-8 lg:px-10">
          <Outlet />
      <Toaster />
        </div>
      </main>
    </div>
  );
}
