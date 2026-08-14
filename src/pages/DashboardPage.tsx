import { useRef, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "convex/react";
import { format } from "date-fns";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bed,
  CurrencyEur,
  Tray,
  UsersThree,
  Waves,
} from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import RangePicker from "../components/RangePicker";
import {
  Badge,
  EmptyState,
  SectionTitle,
  SkeletonRows,
  STATUS_TONE,
  cx,
} from "../components/ui";
import { eur, isoToday, prettyDateLong, STATUS_LABELS } from "../lib/format";

function StatCard({
  label,
  value,
  suffix,
  icon,
  accent,
  isCurrency,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: React.ReactNode;
  accent?: boolean;
  isCurrency?: boolean;
}) {
  const numRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const target = { n: 0 };
      gsap.to(target, {
        n: value,
        duration: 1.1,
        ease: "expo.out",
        onUpdate() {
          if (!numRef.current) return;
          numRef.current.textContent = isCurrency
            ? eur(Math.round(target.n))
            : String(Math.round(target.n));
        },
      });
    },
    { dependencies: [value] },
  );

  return (
    <div
      className={cx(
        "rounded-xl2 border p-5",
        accent
          ? "border-ocean-800 bg-ocean-900 text-sand-50"
          : "border-sand-200 bg-white",
      )}
      style={{ boxShadow: "var(--shadow-diffuse)" }}
    >
      <div className="flex items-center justify-between">
        <p
          className={cx(
            "text-[13px] font-medium",
            accent ? "text-ocean-200" : "text-ink-faint",
          )}
        >
          {label}
        </p>
        <span className={accent ? "text-ocean-300" : "text-sand-400"}>{icon}</span>
      </div>
      <p className="num mt-3 text-3xl font-bold tracking-tight">
        <span ref={numRef}>0</span>
        {suffix && (
          <span
            className={cx(
              "ml-1 text-base font-medium",
              accent ? "text-ocean-300" : "text-ink-faint",
            )}
          >
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
}

function MovementList({
  title,
  rows,
  direction,
}: {
  title: string;
  rows:
    | { bookingId: string; guestName: string; roomName: string; pax: number; status: string }[]
    | undefined;
  direction: "in" | "out";
}) {
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <div className="rounded-xl2 border border-sand-200 bg-white" style={{ boxShadow: "var(--shadow-diffuse)" }}>
        {rows === undefined ? (
          <div className="p-4">
            <SkeletonRows count={2} />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-faint">
            {direction === "in" ? "No arrivals today — flat day." : "Nobody leaves today."}
          </p>
        ) : (
          <ul className="divide-y divide-sand-100">
            {rows.map((row) => (
              <li key={row.bookingId} className="flex items-center gap-3 px-5 py-3">
                <span
                  className={cx(
                    "flex h-8 w-8 items-center justify-center rounded-full",
                    direction === "in"
                      ? "bg-kelp/10 text-kelp"
                      : "bg-sand-100 text-ink-faint",
                  )}
                >
                  {direction === "in" ? (
                    <ArrowDownLeft size={15} weight="bold" />
                  ) : (
                    <ArrowUpRight size={15} weight="bold" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{row.guestName}</p>
                  <p className="text-xs text-ink-faint">
                    {row.roomName} · {row.pax} pax
                  </p>
                </div>
                <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABELS[row.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const today = isoToday();
  const monthStart = format(new Date(), "yyyy-MM-01");
  const [rangeStart, setRangeStart] = useState(monthStart);
  const [rangeEnd, setRangeEnd] = useState(today);
  const data = useQuery(api.dashboard.overview, { today, monthStart });
  const period = useQuery(api.dashboard.period, { start: rangeStart, end: rangeEnd });
  const recentLogs = useQuery(api.auditLogs.recent);
  const outstanding = useQuery(api.payments.outstanding);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Morning briefing</h1>
          <p className="mt-1 text-sm text-ink-faint">{prettyDateLong(today)}</p>
        </div>
        <RangePicker
          start={rangeStart}
          end={rangeEnd}
          onChange={(s, e) => {
            setRangeStart(s);
            setRangeEnd(e);
          }}
        />
      </header>

      {/* One flat stat row — today on the left, the picked period on the right */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Occupancy tonight"
          value={data?.occupancy ?? 0}
          suffix="%"
          icon={<Bed size={20} weight="duotone" />}
        />
        <StatCard
          label="Guests in house"
          value={data?.guestsInHouse ?? 0}
          icon={<UsersThree size={20} weight="duotone" />}
        />
        <StatCard
          label="Pending requests"
          value={(data?.pendingChannelRequests ?? 0) + (data?.pendingGuestRequests ?? 0)}
          icon={<Tray size={20} weight="duotone" />}
        />
        <StatCard
          label="Total guests"
          value={period?.totalGuests ?? 0}
          icon={<UsersThree size={20} weight="duotone" />}
        />
        <StatCard
          label="Bookings — period"
          value={period?.bookings ?? 0}
          icon={<Bed size={20} weight="duotone" />}
        />
        <StatCard
          label="Revenue — period"
          value={period?.revenue ?? 0}
          icon={<CurrencyEur size={20} weight="duotone" />}
          accent
          isCurrency
        />
      </div>

      {/* Asymmetric 2fr/1fr layout */}
      <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-10">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <MovementList title="Arriving today" rows={data?.arrivals} direction="in" />
            <MovementList title="Departing today" rows={data?.departures} direction="out" />
          </div>

          <div>
            <SectionTitle
              right={
                <Link to="/calendar" className="text-[13px] font-semibold text-ocean-700 hover:underline">
                  Open calendar
                </Link>
              }
            >
              Today's activity roster
            </SectionTitle>
            <div className="rounded-xl2 border border-sand-200 bg-white p-5" style={{ boxShadow: "var(--shadow-diffuse)" }}>
              {data === undefined ? (
                <SkeletonRows count={2} />
              ) : data.activityRoster.length === 0 ? (
                <EmptyState
                  icon={<Waves size={22} weight="duotone" />}
                  title="No sessions today"
                  hint="Activities booked for today will show up here for prep."
                />
              ) : (
                <div className="flex flex-wrap gap-3">
                  {data.activityRoster.map((activity) => (
                    <div
                      key={activity.name}
                      className="flex items-center gap-3 rounded-xl border border-sand-200 px-4 py-2.5"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: activity.color }}
                      />
                      {activity.startTime && (
                        <span className="num text-xs font-bold text-ocean-700">
                          {activity.startTime}
                        </span>
                      )}
                      <span className="text-sm font-semibold">{activity.name}</span>
                      <span className="num rounded-full bg-sand-100 px-2 py-0.5 text-xs font-bold">
                        {activity.total}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <SectionTitle>Outstanding balances</SectionTitle>
            <div className="rounded-xl2 border border-sand-200 bg-white" style={{ boxShadow: "var(--shadow-diffuse)" }}>
              {outstanding === undefined ? (
                <div className="p-4">
                  <SkeletonRows count={2} />
                </div>
              ) : outstanding.length === 0 ? (
                <p className="px-5 py-6 text-sm text-ink-faint">
                  Everyone is paid up. Nice.
                </p>
              ) : (
                <ul className="divide-y divide-sand-100">
                  {outstanding.slice(0, 6).map((row) => (
                    <li key={row.bookingId} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-semibold">{row.guestName}</p>
                        <p className="text-xs text-ink-faint">
                          {row.checkIn} → {row.checkOut}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="num text-sm font-bold text-coral">{eur(row.balance)}</p>
                        <p className="num text-xs text-ink-faint">
                          of {eur(row.total)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Right rail — recent activity feed */}
        <div>
          <SectionTitle>Latest activity</SectionTitle>
          <div className="relative border-l border-sand-200 pl-5">
            {recentLogs === undefined ? (
              <SkeletonRows count={5} />
            ) : recentLogs.length === 0 ? (
              <p className="text-sm text-ink-faint">Nothing logged yet.</p>
            ) : (
              <ul className="flex flex-col gap-5">
                {recentLogs.map((log) => (
                  <li key={log._id} className="relative">
                    <span className="absolute -left-[26px] top-1.5 h-2 w-2 rounded-full bg-ocean-400" />
                    <p className="text-[13px] leading-snug text-ink">{log.summary}</p>
                    <p className="mt-0.5 text-[11px] text-ink-faint">
                      {log.actorName} · {format(new Date(log._creationTime), "d MMM, HH:mm")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
