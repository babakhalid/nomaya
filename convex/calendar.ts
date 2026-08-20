import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./lib/access";

type GridRow = {
  key: string;
  roomId: Id<"rooms">;
  bedId: Id<"beds"> | undefined;
  roomName: string;
  label: string;
  typeName: string;
  mode: "private" | "dorm";
  capacity: number;
  maintenance: boolean;
};

export type SummaryEntry = {
  guestName: string;
  count: number;
  note?: string;
  pending?: boolean;
};

export type SummaryDay = {
  total: number;
  pendingTotal: number;
  entries: SummaryEntry[];
};

export type SummaryRow = {
  key: string;
  name: string;
  color?: string;
  perDay: Record<string, SummaryDay>;
};

function eachDay(start: string, endExclusive: string): string[] {
  const days: string[] = [];
  let t = Date.parse(start);
  const end = Date.parse(endExclusive);
  while (t < end) {
    days.push(new Date(t).toISOString().slice(0, 10));
    t += 86400000;
  }
  return days;
}

function nights(a: string, b: string) {
  return Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));
}

function addEntry(
  row: SummaryRow,
  date: string,
  entry: SummaryEntry,
) {
  row.perDay[date] ??= { total: 0, pendingTotal: 0, entries: [] };
  const day = row.perDay[date];
  if (entry.pending) day.pendingTotal += entry.count;
  else day.total += entry.count;
  day.entries.push(entry);
}

/**
 * Everything the calendar grid needs in one reactive query:
 * rows (private rooms + dorm beds) and the bookings overlapping the range.
 */
export const grid = query({
  args: { start: v.string(), end: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);

    const [roomTypes, rooms, beds, bookings, roomBlocks] = await Promise.all([
      ctx.db.query("roomTypes").collect(),
      ctx.db.query("rooms").collect(),
      ctx.db.query("beds").collect(),
      ctx.db.query("bookings").collect(),
      ctx.db.query("roomBlocks").collect(),
    ]);

    const typeById = new Map(roomTypes.map((t) => [t._id, t]));
    const sortedRooms = rooms.sort((a, b) => a.sortOrder - b.sortOrder);

    const rows = sortedRooms.flatMap((room): GridRow[] => {
      const type = typeById.get(room.roomTypeId);
      if (type?.mode === "dorm") {
        const roomBeds = beds
          .filter((b) => b.roomId === room._id)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        return roomBeds.map((bed) => ({
          key: `${room._id}:${bed._id}`,
          roomId: room._id,
          bedId: bed._id,
          roomName: room.name,
          label: bed.label,
          typeName: type.name,
          mode: "dorm" as const,
          capacity: 1,
          maintenance: room.status === "maintenance",
        }));
      }
      return [
        {
          key: `${room._id}`,
          roomId: room._id,
          bedId: undefined,
          roomName: room.name,
          label: room.name,
          typeName: type?.name ?? "",
          mode: "private" as const,
          capacity: type?.capacity ?? 2,
          maintenance: room.status === "maintenance",
        },
      ];
    });

    const visible = bookings.filter(
      (b) =>
        b.status !== "cancelled" &&
        b.checkIn < args.end &&
        b.checkOut > args.start,
    );
    const guests = await Promise.all(visible.map((b) => ctx.db.get(b.guestId)));

    // ── Per-day totals for packages / activities / services ─────────────
    // Rows come from the Settings catalog; totals from bookings; pending
    // guest-portal requests surface as "+N requested" with their notes.
    const [activities, services, packages, allBookingActivities, allBookingServices, guestRequests, allGuests] =
      await Promise.all([
        ctx.db.query("activities").collect(),
        ctx.db.query("services").collect(),
        ctx.db.query("packages").collect(),
        ctx.db.query("bookingActivities").collect(),
        ctx.db.query("bookingServices").collect(),
        ctx.db.query("guestRequests").collect(),
        ctx.db.query("guests").collect(),
      ]);

    const days = eachDay(args.start, args.end);
    const daySet = new Set(days);
    const bookingById = new Map(bookings.map((b) => [b._id, b]));
    const guestName = (guestId: Id<"guests">) =>
      allGuests.find((g) => g._id === guestId)?.fullName ?? "Unknown";
    const activeBooking = (bookingId: Id<"bookings">) => {
      const b = bookingById.get(bookingId);
      return b && b.status !== "cancelled" && b.status !== "no_show" ? b : null;
    };

    const packageRows: SummaryRow[] = packages
      .filter((p) => p.active)
      .map((p) => ({ key: p._id, name: p.name, perDay: {} }));
    const activityRows: SummaryRow[] = activities
      .filter((a) => a.active)
      .map((a) => ({ key: a._id, name: a.name, color: a.color, perDay: {} }));
    const serviceRows: SummaryRow[] = services
      .filter((s) => s.active)
      .map((s) => ({ key: s._id, name: s.name, perDay: {} }));
    const rowByKey = new Map(
      [...packageRows, ...activityRows, ...serviceRows].map((r) => [r.key, r]),
    );

    // Packages: every guest on a package counts on each night of their stay
    for (const b of bookings) {
      if (!b.packageId || b.status === "cancelled" || b.status === "no_show") continue;
      const row = rowByKey.get(b.packageId);
      if (!row) continue;
      const pax = b.adults + b.children;
      for (const d of eachDay(b.checkIn, b.checkOut)) {
        if (!daySet.has(d)) continue;
        addEntry(row, d, {
          guestName: guestName(b.guestId),
          count: pax,
          note: b.notes || undefined,
        });
      }
    }

    // Activities: scheduled sessions on their date
    for (const item of allBookingActivities) {
      if (!daySet.has(item.date)) continue;
      const b = activeBooking(item.bookingId);
      if (!b) continue;
      const row = rowByKey.get(item.activityId);
      if (!row) continue;
      addEntry(row, item.date, {
        guestName: guestName(b.guestId),
        count: item.participants,
      });
    }

    // Services: dated line items count on their date; undated per-day services
    // (breakfast, dinner…) spread evenly across the stay; other undated items
    // count on check-in day.
    for (const item of allBookingServices) {
      const b = activeBooking(item.bookingId);
      if (!b) continue;
      const row = rowByKey.get(item.serviceId);
      if (!row) continue;
      const service = services.find((s) => s._id === item.serviceId);
      const name = guestName(b.guestId);
      if (item.date) {
        if (daySet.has(item.date)) {
          addEntry(row, item.date, { guestName: name, count: item.qty });
        }
      } else if (service?.unit === "per_day") {
        const perNight = Math.max(1, Math.round(item.qty / nights(b.checkIn, b.checkOut)));
        for (const d of eachDay(b.checkIn, b.checkOut)) {
          if (!daySet.has(d)) continue;
          addEntry(row, d, { guestName: name, count: perNight });
        }
      } else if (daySet.has(b.checkIn)) {
        addEntry(row, b.checkIn, { guestName: name, count: item.qty });
      }
    }

    // Pending portal requests: visible as "requested", with the guest's note
    for (const request of guestRequests) {
      if (request.status !== "pending" || request.type !== "order") continue;
      const b = activeBooking(request.bookingId);
      if (!b) continue;
      const refId = request.payload.activityId ?? request.payload.serviceId;
      if (!refId) continue;
      const row = rowByKey.get(refId);
      if (!row) continue;
      const date = request.payload.date ?? b.checkIn;
      if (!daySet.has(date)) continue;
      addEntry(row, date, {
        guestName: guestName(b.guestId),
        count: request.payload.qty ?? 1,
        note: request.payload.note,
        pending: true,
      });
    }

    const hasData = (r: SummaryRow) => Object.keys(r.perDay).length > 0;

    return {
      rows,
      bookings: visible.map((b, i) => ({
        _id: b._id,
        roomId: b.roomId,
        bedId: b.bedId,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        status: b.status,
        source: b.source,
        guestName: guests[i]?.fullName ?? "Unknown",
        adults: b.adults,
        children: b.children,
      })),
      blocks: roomBlocks
        .filter((bl) => bl.start < args.end && bl.end > args.start)
        .map((bl) => ({
          _id: bl._id,
          roomId: bl.roomId,
          start: bl.start,
          end: bl.end,
          reason: bl.reason,
        })),
      summary: {
        // catalog rows always shown; totals may be zero on quiet weeks
        packages: packageRows,
        activities: activityRows,
        services: serviceRows,
        hasAnyData:
          [...packageRows, ...activityRows, ...serviceRows].some(hasData),
      },
    };
  },
});

/**
 * The per-day preparation panel: who arrives/leaves/sleeps here, what
 * activities run, what services are due — so the crew can predict and prep.
 */
export const dayDetail = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);

    const bookings = await ctx.db.query("bookings").collect();
    const active = bookings.filter(
      (b) => b.status !== "cancelled" && b.status !== "no_show",
    );

    const arrivals = active.filter((b) => b.checkIn === args.date);
    const departures = active.filter((b) => b.checkOut === args.date);
    const inHouse = active.filter(
      (b) => b.checkIn <= args.date && b.checkOut > args.date,
    );

    const guestOf = async (b: (typeof bookings)[number]) => {
      const g = await ctx.db.get(b.guestId);
      return {
        bookingId: b._id,
        guestName: g?.fullName ?? "Unknown",
        surfLevel: g?.surfLevel,
        allergies: g?.allergies,
        adults: b.adults,
        children: b.children,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
      };
    };

    const [arrivalList, departureList, inHouseList] = await Promise.all([
      Promise.all(arrivals.map(guestOf)),
      Promise.all(departures.map(guestOf)),
      Promise.all(inHouse.map(guestOf)),
    ]);

    // Activities scheduled that day, grouped with surf level of participants
    const dayActivities = await ctx.db
      .query("bookingActivities")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();
    const activityGroups: Record<
      string,
      {
        name: string;
        color: string;
        startTime?: string;
        total: number;
        byLevel: Record<string, number>;
        participants: { guestName: string; count: number; level?: string }[];
      }
    > = {};
    for (const item of dayActivities) {
      const activity = await ctx.db.get(item.activityId);
      const booking = await ctx.db.get(item.bookingId);
      if (!activity || !booking || booking.status === "cancelled") continue;
      const guest = await ctx.db.get(booking.guestId);
      const key = item.activityId;
      activityGroups[key] ??= {
        name: activity.name,
        color: activity.color,
        startTime: activity.startTime,
        total: 0,
        byLevel: {},
        participants: [],
      };
      const group = activityGroups[key];
      group.total += item.participants;
      const level = guest?.surfLevel ?? "unknown";
      group.byLevel[level] = (group.byLevel[level] ?? 0) + item.participants;
      group.participants.push({
        guestName: guest?.fullName ?? "Unknown",
        count: item.participants,
        level: guest?.surfLevel,
      });
    }

    // Services due that day (transfers, rentals booked for a specific date)
    const dayServices = await ctx.db
      .query("bookingServices")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();
    const serviceList = await Promise.all(
      dayServices.map(async (s) => {
        const [service, booking] = await Promise.all([
          ctx.db.get(s.serviceId),
          ctx.db.get(s.bookingId),
        ]);
        const guest = booking ? await ctx.db.get(booking.guestId) : null;
        return {
          name: service?.name ?? "Service",
          startTime: service?.startTime,
          qty: s.qty,
          guestName: guest?.fullName ?? "Unknown",
        };
      }),
    );

    const dietary = inHouseList.filter((g) => g.allergies);

    return {
      date: args.date,
      arrivals: arrivalList,
      departures: departureList,
      inHouse: inHouseList,
      guestsSleeping: inHouse.reduce((n, b) => n + b.adults + b.children, 0),
      activities: Object.values(activityGroups).sort((a, b) =>
        (a.startTime ?? "99").localeCompare(b.startTime ?? "99"),
      ),
      services: serviceList.sort((a, b) =>
        (a.startTime ?? "99").localeCompare(b.startTime ?? "99"),
      ),
      dietary,
    };
  },
});
