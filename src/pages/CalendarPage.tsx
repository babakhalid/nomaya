import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { addDays, format, isToday, parseISO, startOfWeek } from "date-fns";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import { errorMessage } from "../components/toast";
import type { Id } from "../../convex/_generated/dataModel";
import { Button, cx } from "../components/ui";
import NewBookingDrawer from "../components/calendar/NewBookingDrawer";
import BookingDetailDrawer from "../components/calendar/BookingDetailDrawer";
import DayPanel from "../components/calendar/DayPanel";
import RangePicker from "../components/RangePicker";
import {
  SummaryCellDrawer,
  SummarySection,
  type OpenSummaryCell,
} from "../components/calendar/SummaryRows";

const MAX_DAYS = 120; // hard cap so the grid stays fast
const COL_W = 46; // px per day column
const LABEL_W = 190;
const ROW_H = 45; // day cell (44px) + row border

const STATUS_BAR: Record<string, string> = {
  inquiry: "bg-dune/85 text-ink",
  confirmed: "bg-ocean-600 text-sand-50",
  checked_in: "bg-kelp text-sand-50",
  checked_out: "bg-sand-400 text-white",
  no_show: "bg-coral/70 text-white",
};

type Selection = {
  rowKey: string;
  roomId: Id<"rooms">;
  bedId?: Id<"beds">;
  startIdx: number;
  endIdx: number;
};

type BarDrag = {
  bookingId: Id<"bookings">;
  mode: "move" | "left" | "right";
  rowIndex: number;
  checkIn: string;
  checkOut: string;
  startX: number;
  startY: number;
  dayDelta: number;
  rowDelta: number;
};

const shiftIso = (iso: string, delta: number) =>
  format(addDays(parseISO(iso), delta), "yyyy-MM-dd");

const prettyRange = (a: string, b: string) =>
  `${format(parseISO(a), "d MMM")} → ${format(parseISO(b), "d MMM")}`;

export default function CalendarPage() {
  const defaultStart = () => startOfWeek(new Date(), { weekStartsOn: 1 });
  const [rangeStart, setRangeStart] = useState(() => format(defaultStart(), "yyyy-MM-dd"));
  const [rangeEnd, setRangeEnd] = useState(() =>
    format(addDays(defaultStart(), 27), "yyyy-MM-dd"),
  );
  const [drag, setDrag] = useState<Selection | null>(null);
  const [pendingBooking, setPendingBooking] = useState<{
    roomId: Id<"rooms">;
    bedId?: Id<"beds">;
    checkIn: string;
    checkOut: string;
  } | null>(null);
  const [openBookingId, setOpenBookingId] = useState<Id<"bookings"> | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [openSummaryCell, setOpenSummaryCell] = useState<OpenSummaryCell | null>(null);
  const [barDrag, setBarDrag] = useState<BarDrag | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const barDragRef = useRef<BarDrag | null>(null);
  barDragRef.current = barDrag;
  const dragging = useRef(false);
  const scope = useRef<HTMLDivElement>(null);
  const moveBooking = useMutation(api.bookings.move);
  const me = useQuery(api.users.me);
  const canManage = me?.role === "admin" || me?.role === "manager";

  const days = useMemo(() => {
    let start = parseISO(rangeStart);
    let end = parseISO(rangeEnd);
    if (end < start) [start, end] = [end, start];
    let count = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (count > MAX_DAYS) {
      // Anchor to the recent side — the useful end of an oversized range.
      start = addDays(end, -(MAX_DAYS - 1));
      count = MAX_DAYS;
    }
    if (count < 7) count = 7;
    return Array.from({ length: count }, (_, i) => addDays(start, i));
  }, [rangeStart, rangeEnd]);

  const gridStart = format(days[0], "yyyy-MM-dd");
  const gridEnd = format(addDays(days[days.length - 1], 1), "yyyy-MM-dd");

  const grid = useQuery(api.calendar.grid, { start: gridStart, end: gridEnd });

  useGSAP(
    () => {
      gsap.fromTo(
        ".booking-bar",
        { opacity: 0, scaleX: 0.9 },
        {
          opacity: 1,
          scaleX: 1,
          duration: 0.4,
          ease: "expo.out",
          stagger: 0.015,
          transformOrigin: "left center",
        },
      );
    },
    { scope, dependencies: [days[0].getTime(), days.length, grid === undefined] },
  );

  const idxOf = (iso: string) => {
    const t = parseISO(iso).getTime();
    return Math.round((t - days[0].getTime()) / 86400000);
  };

  function startDrag(row: NonNullable<typeof grid>["rows"][number], idx: number) {
    if (row.maintenance) return;
    dragging.current = true;
    setDrag({
      rowKey: row.key,
      roomId: row.roomId,
      bedId: row.bedId,
      startIdx: idx,
      endIdx: idx,
    });
  }

  function moveDrag(rowKey: string, idx: number) {
    if (!dragging.current) return;
    setDrag((d) => (d && d.rowKey === rowKey ? { ...d, endIdx: idx } : d));
  }

  function endDrag() {
    if (!dragging.current || !drag) return;
    dragging.current = false;
    const from = Math.min(drag.startIdx, drag.endIdx);
    const to = Math.max(drag.startIdx, drag.endIdx);
    setPendingBooking({
      roomId: drag.roomId,
      bedId: drag.bedId,
      checkIn: format(days[from], "yyyy-MM-dd"),
      // dragging N cells = N nights; checkout is the morning after the last night
      checkOut: format(addDays(days[to], 1), "yyyy-MM-dd"),
    });
    setDrag(null);
  }

  // Group rows by room for section headers in the label rail
  const rows = grid?.rows ?? [];
  const bookings = grid?.bookings ?? [];

  // Booking-bar drag: window-level listeners so the drag survives leaving the bar
  useEffect(() => {
    if (!barDrag) return;
    const onMove = (e: MouseEvent) => {
      setBarDrag((d) =>
        d
          ? {
              ...d,
              dayDelta: Math.round((e.clientX - d.startX) / COL_W),
              rowDelta:
                d.mode === "move" ? Math.round((e.clientY - d.startY) / ROW_H) : 0,
            }
          : d,
      );
    };
    const onUp = async () => {
      const d = barDragRef.current;
      setBarDrag(null);
      if (!d) return;
      if (d.dayDelta === 0 && d.rowDelta === 0) {
        // A click, not a drag — open the booking as before.
        setOpenBookingId(d.bookingId);
        return;
      }
      const booking = bookings.find((b) => b._id === d.bookingId);
      if (!booking) return;
      let checkIn = d.checkIn;
      let checkOut = d.checkOut;
      let roomId = booking.roomId;
      let bedId = booking.bedId;
      if (d.mode === "move") {
        checkIn = shiftIso(d.checkIn, d.dayDelta);
        checkOut = shiftIso(d.checkOut, d.dayDelta);
        const target = rows[Math.min(Math.max(d.rowIndex + d.rowDelta, 0), rows.length - 1)];
        if (target.maintenance) {
          setMoveError(`${target.roomName} is under maintenance.`);
          setTimeout(() => setMoveError(null), 5000);
          return;
        }
        roomId = target.roomId;
        bedId = target.bedId;
      } else if (d.mode === "left") {
        checkIn = shiftIso(d.checkIn, Math.min(d.dayDelta, nightsOf(d) - 1));
      } else {
        checkOut = shiftIso(d.checkOut, Math.max(d.dayDelta, 1 - nightsOf(d)));
      }
      try {
        await moveBooking({ bookingId: d.bookingId, roomId, bedId, checkIn, checkOut });
      } catch (err) {
        setMoveError(errorMessage(err, "Could not move the booking."));
        setTimeout(() => setMoveError(null), 5000);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barDrag !== null]);

  const nightsOf = (d: BarDrag) =>
    Math.round((parseISO(d.checkOut).getTime() - parseISO(d.checkIn).getTime()) / 86400000);

  return (
    <div ref={scope} onMouseUp={endDrag} onMouseLeave={() => { dragging.current = false; setDrag(null); }}>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Calendar</h1>
          <p className="mt-1 text-sm text-ink-faint">
            Drag across empty nights to book. Drag a booking to move it, pull its
            edges to extend — pricing recalculates automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setRangeStart(shiftIso(rangeStart, -days.length));
              setRangeEnd(shiftIso(rangeEnd, -days.length));
            }}
            aria-label="Previous period"
          >
            <CaretLeft size={15} weight="bold" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setRangeStart(format(defaultStart(), "yyyy-MM-dd"));
              setRangeEnd(format(addDays(defaultStart(), 27), "yyyy-MM-dd"));
            }}
          >
            Today
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setRangeStart(shiftIso(rangeStart, days.length));
              setRangeEnd(shiftIso(rangeEnd, days.length));
            }}
            aria-label="Next period"
          >
            <CaretRight size={15} weight="bold" />
          </Button>
        </div>
      </header>

      <div className="mb-4">
        <RangePicker
          start={format(days[0], "yyyy-MM-dd")}
          end={format(days[days.length - 1], "yyyy-MM-dd")}
          onChange={(s, e) => {
            setRangeStart(s);
            setRangeEnd(e);
          }}
        />
      </div>

      {moveError && (
        <p className="mb-4 rounded-xl border border-coral/25 bg-coral/10 px-3.5 py-2.5 text-sm font-semibold text-coral">
          {moveError}
        </p>
      )}
      {barDrag && (barDrag.dayDelta !== 0 || barDrag.rowDelta !== 0) && (
        <p className="num mb-4 inline-block rounded-xl bg-ocean-700 px-3.5 py-2 text-sm font-bold text-sand-50">
          {barDrag.mode === "move"
            ? `${prettyRange(shiftIso(barDrag.checkIn, barDrag.dayDelta), shiftIso(barDrag.checkOut, barDrag.dayDelta))} — price recalculates on drop`
            : barDrag.mode === "left"
              ? `Check-in → ${shiftIso(barDrag.checkIn, Math.min(barDrag.dayDelta, nightsOf(barDrag) - 1))}`
              : `Check-out → ${shiftIso(barDrag.checkOut, Math.max(barDrag.dayDelta, 1 - nightsOf(barDrag)))}`}
        </p>
      )}

      <div
        className="max-h-[calc(100dvh-230px)] overflow-auto rounded-xl2 border border-sand-200 bg-white select-none"
        style={{ boxShadow: "var(--shadow-diffuse)" }}
      >
        <div style={{ minWidth: LABEL_W + days.length * COL_W }}>
          {/* Date header — sticks while scrolling down */}
          <div
            className="sticky top-0 z-40 grid border-b border-sand-200 bg-sand-100"
            style={{ gridTemplateColumns: `${LABEL_W}px repeat(${days.length}, ${COL_W}px)` }}
          >
            <div className="sticky left-0 z-50 border-r border-sand-200 bg-sand-100 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-ink-faint">
              Rooms & beds
            </div>
            {days.map((day, i) => {
              const iso = format(day, "yyyy-MM-dd");
              const weekend = [0, 6].includes(day.getDay());
              return (
                <button
                  key={i}
                  onClick={() => setOpenDay(iso)}
                  className={cx(
                    "flex flex-col items-center gap-0.5 border-r border-sand-200/60 bg-sand-100 py-2 transition-colors hover:bg-ocean-50 cursor-pointer",
                    weekend && "bg-sand-200/70",
                    isToday(day) && "bg-ocean-100",
                  )}
                  title={`Day briefing — ${iso}`}
                >
                  <span className="text-[10px] font-semibold uppercase text-ink-faint">
                    {format(day, "EEE")}
                  </span>
                  <span
                    className={cx(
                      "num flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-bold",
                      isToday(day) ? "bg-ocean-700 text-sand-50" : "text-ink",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Rows */}
          {grid === undefined ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="skeleton h-10 w-full" />
              ))}
            </div>
          ) : (
            rows.map((row, rowIdx) => {
              const prev = rows[rowIdx - 1];
              const newRoomGroup = !prev || prev.roomId !== row.roomId;
              const rowBookings = bookings.filter((b) =>
                row.bedId ? b.bedId === row.bedId : b.roomId === row.roomId && !b.bedId,
              );
              const isDragRow = drag?.rowKey === row.key;
              const dragFrom = isDragRow ? Math.min(drag.startIdx, drag.endIdx) : -1;
              const dragTo = isDragRow ? Math.max(drag.startIdx, drag.endIdx) : -1;

              return (
                <div
                  key={row.key}
                  className={cx(
                    "relative grid",
                    newRoomGroup ? "border-t border-sand-200" : "border-t border-sand-100",
                  )}
                  style={{ gridTemplateColumns: `${LABEL_W}px repeat(${days.length}, ${COL_W}px)` }}
                >
                  {/* Label rail */}
                  <div className="sticky left-0 z-10 flex items-center gap-2 border-r border-sand-200 bg-white px-4 py-2">
                    {row.mode === "dorm" ? (
                      <>
                        <span className="w-1 self-stretch rounded-full bg-sand-200" />
                        <div className="min-w-0 leading-tight">
                          <p className="truncate text-[13px] font-semibold">{row.label}</p>
                          <p className="truncate text-[11px] text-ink-faint">{row.roomName}</p>
                        </div>
                      </>
                    ) : (
                      <div className="min-w-0 leading-tight">
                        <p className="truncate text-[13px] font-semibold">{row.roomName}</p>
                        <p className="truncate text-[11px] text-ink-faint">
                          {row.typeName} · sleeps {row.capacity}
                        </p>
                      </div>
                    )}
                    {row.maintenance && (
                      <span className="ml-auto rounded-full bg-coral/10 px-2 py-0.5 text-[10px] font-bold text-coral">
                        Maint.
                      </span>
                    )}
                  </div>

                  {/* Day cells */}
                  {days.map((day, i) => {
                    const weekend = [0, 6].includes(day.getDay());
                    const inDrag = isDragRow && i >= dragFrom && i <= dragTo;
                    return (
                      <div
                        key={i}
                        onMouseDown={() => startDrag(row, i)}
                        onMouseEnter={() => moveDrag(row.key, i)}
                        className={cx(
                          "h-11 border-r border-sand-100 transition-colors",
                          weekend && "bg-sand-50",
                          isToday(day) && "bg-ocean-50/60",
                          row.maintenance
                            ? "bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(192,91,77,0.08)_5px,rgba(192,91,77,0.08)_10px)]"
                            : "cursor-crosshair hover:bg-ocean-50",
                          inDrag && "bg-ocean-200/50",
                        )}
                      />
                    );
                  })}

                  {/* Booking bars — half-day offset like classic PMS charts */}
                  {rowBookings.map((booking) => {
                    const isDraggedBar = barDrag?.bookingId === booking._id;
                    const dd = isDraggedBar ? barDrag : null;
                    // Live preview: move slides the bar; resize stretches it.
                    const previewIn =
                      dd && dd.mode !== "right"
                        ? shiftIso(
                            booking.checkIn,
                            dd.mode === "move"
                              ? dd.dayDelta
                              : Math.min(dd.dayDelta, nightsOf(dd) - 1),
                          )
                        : booking.checkIn;
                    const previewOut =
                      dd && dd.mode !== "left"
                        ? shiftIso(
                            booking.checkOut,
                            dd.mode === "move"
                              ? dd.dayDelta
                              : Math.max(dd.dayDelta, 1 - nightsOf(dd)),
                          )
                        : booking.checkOut;
                    const from = Math.max(idxOf(previewIn), -0.5);
                    const to = Math.min(idxOf(previewOut), days.length + 0.5);
                    const left = LABEL_W + (from + 0.5) * COL_W;
                    const width = (to - from) * COL_W - 6;
                    if (width <= 0) return null;
                    const startBarDrag = (mode: BarDrag["mode"]) => (e: React.MouseEvent) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (!canManage) return;
                      setBarDrag({
                        bookingId: booking._id,
                        mode,
                        rowIndex: rowIdx,
                        checkIn: booking.checkIn,
                        checkOut: booking.checkOut,
                        startX: e.clientX,
                        startY: e.clientY,
                        dayDelta: 0,
                        rowDelta: 0,
                      });
                    };
                    return (
                      <button
                        key={booking._id}
                        onMouseDown={canManage ? startBarDrag("move") : (e) => e.stopPropagation()}
                        onClick={canManage ? undefined : () => setOpenBookingId(booking._id)}
                        className={cx(
                          "booking-bar absolute top-1.5 z-[5] flex h-8 items-center gap-1.5 overflow-hidden rounded-lg px-2.5 text-left shadow-sm transition-transform hover:-translate-y-[1px]",
                          canManage ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                          isDraggedBar &&
                            "z-30 opacity-90 shadow-lg ring-2 ring-ocean-400 transition-none",
                          STATUS_BAR[booking.status] ?? "bg-ocean-600 text-sand-50",
                        )}
                        style={{
                          left,
                          width,
                          transform:
                            dd && dd.mode === "move" && dd.rowDelta !== 0
                              ? `translateY(${dd.rowDelta * ROW_H}px)`
                              : undefined,
                        }}
                        title={`${booking.guestName} · ${booking.checkIn} → ${booking.checkOut}`}
                      >
                        {canManage && (
                          <span
                            onMouseDown={startBarDrag("left")}
                            className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-lg hover:bg-black/15"
                          />
                        )}
                        {canManage && (
                          <span
                            onMouseDown={startBarDrag("right")}
                            className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-lg hover:bg-black/15"
                          />
                        )}
                        <span className="truncate text-xs font-bold">
                          {booking.guestName}
                        </span>
                        {booking.source !== "direct" && booking.source !== "walk_in" && (
                          <span className="ml-auto shrink-0 rounded bg-black/15 px-1 text-[9px] font-black uppercase">
                            {booking.source === "booking_com"
                              ? "B"
                              : booking.source === "airbnb"
                                ? "A"
                                : booking.source === "hostelworld"
                                  ? "H"
                                  : "E"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}

          {/* Per-day totals for packages, activities & services (from Settings) */}
          {grid !== undefined && (
            <>
              <SummarySection
                section="packages"
                rows={grid.summary.packages}
                days={days}
                labelWidth={LABEL_W}
                colWidth={COL_W}
                onOpenCell={setOpenSummaryCell}
              />
              <SummarySection
                section="activities"
                rows={grid.summary.activities}
                days={days}
                labelWidth={LABEL_W}
                colWidth={COL_W}
                onOpenCell={setOpenSummaryCell}
              />
              <SummarySection
                section="services"
                rows={grid.summary.services}
                days={days}
                labelWidth={LABEL_W}
                colWidth={COL_W}
                onOpenCell={setOpenSummaryCell}
              />
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-ink-faint">
        {Object.entries({ inquiry: "Inquiry", confirmed: "Confirmed", checked_in: "Checked in", checked_out: "Checked out" }).map(
          ([status, label]) => (
            <span key={status} className="flex items-center gap-1.5">
              <span className={cx("h-2.5 w-4 rounded", STATUS_BAR[status].split(" ")[0])} />
              {label}
            </span>
          ),
        )}
        <span className="flex items-center gap-1.5 border-l border-sand-200 pl-4">
          <span className="num font-semibold text-[#8a6420]">+N</span>
          portal request awaiting approval
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-dune" />
          guest left a note — click the cell
        </span>
      </div>

      <NewBookingDrawer
        pending={pendingBooking}
        onClose={() => setPendingBooking(null)}
      />
      <BookingDetailDrawer
        bookingId={openBookingId}
        onClose={() => setOpenBookingId(null)}
      />
      <DayPanel date={openDay} onClose={() => setOpenDay(null)} />
      <SummaryCellDrawer
        cell={openSummaryCell}
        onClose={() => setOpenSummaryCell(null)}
      />
    </div>
  );
}
