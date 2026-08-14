import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/access";

function* eachMonth(start: string, end: string) {
  let [y, m] = start.slice(0, 7).split("-").map(Number);
  const [ey, em] = end.slice(0, 7).split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    yield `${y}-${String(m).padStart(2, "0")}`;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
}

function nightsBetween(a: string, b: string) {
  return Math.max(
    0,
    Math.round((Date.parse(b) - Date.parse(a)) / (1000 * 60 * 60 * 24)),
  );
}

export const report = query({
  args: { start: v.string(), end: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const { start, end } = args;

    const [bookings, payments, expenses, guests, activities, bookingActivities, rooms, beds, roomTypes] =
      await Promise.all([
        ctx.db.query("bookings").collect(),
        ctx.db.query("payments").collect(),
        ctx.db.query("expenses").collect(),
        ctx.db.query("guests").collect(),
        ctx.db.query("activities").collect(),
        ctx.db.query("bookingActivities").collect(),
        ctx.db.query("rooms").collect(),
        ctx.db.query("beds").collect(),
        ctx.db.query("roomTypes").collect(),
      ]);

    const active = bookings.filter(
      (b) => b.status !== "cancelled" && b.status !== "no_show",
    );
    // end is inclusive (matches the date pickers), so <= on checkIn
    const inRange = active.filter((b) => b.checkIn <= end && b.checkOut > start);

    // Sellable unit-nights for occupancy
    const typeById = new Map(roomTypes.map((t) => [t._id, t]));
    const unitCount = rooms.reduce((n, room) => {
      const type = typeById.get(room.roomTypeId);
      return n + (type?.mode === "dorm" ? beds.filter((b) => b.roomId === room._id).length : 1);
    }, 0);

    // Monthly series: occupancy %, revenue (payments in), expenses
    const months = [...eachMonth(start, end)];
    const monthly = months.map((month) => {
      const mStart = `${month}-01`;
      const [y, m] = month.split("-").map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      const mEnd = `${month}-${String(daysInMonth).padStart(2, "0")}`;
      const nextDay = new Date(y, m - 1, daysInMonth + 1);
      const mEndExclusive = nextDay.toISOString().slice(0, 10);

      const occupiedNights = active.reduce((sum, b) => {
        const from = b.checkIn > mStart ? b.checkIn : mStart;
        const to = b.checkOut < mEndExclusive ? b.checkOut : mEndExclusive;
        return sum + nightsBetween(from, to);
      }, 0);
      const capacity = unitCount * daysInMonth;

      const revenue = payments
        .filter((p) => p.date >= mStart && p.date <= mEnd)
        .reduce((s, p) => s + (p.direction === "in" ? p.amount : -p.amount), 0);
      const spent = expenses
        .filter((e) => e.date >= mStart && e.date <= mEnd)
        .reduce((s, e) => s + e.amount, 0);

      return {
        month,
        occupancy: capacity === 0 ? 0 : Math.round((occupiedNights / capacity) * 100),
        revenue: Math.round(revenue * 100) / 100,
        expenses: Math.round(spent * 100) / 100,
      };
    });

    // Source mix + revenue by source
    const bySource: Record<string, { count: number; revenue: number }> = {};
    for (const b of inRange) {
      bySource[b.source] ??= { count: 0, revenue: 0 };
      bySource[b.source].count++;
      bySource[b.source].revenue += b.totalAmount;
    }

    // ADR: booking revenue / room-nights sold in range
    const totalNights = inRange.reduce(
      (s, b) => s + nightsBetween(b.checkIn, b.checkOut),
      0,
    );
    const totalBookingValue = inRange.reduce((s, b) => s + b.totalAmount, 0);

    // Activity popularity
    const activityById = new Map(activities.map((a) => [a._id, a]));
    const activityPopularity: Record<string, { name: string; color: string; participants: number }> = {};
    for (const item of bookingActivities) {
      if (item.date < start || item.date > end) continue;
      const activity = activityById.get(item.activityId);
      if (!activity) continue;
      activityPopularity[item.activityId] ??= {
        name: activity.name,
        color: activity.color,
        participants: 0,
      };
      activityPopularity[item.activityId].participants += item.participants;
    }

    // Nationality mix
    const guestById = new Map(guests.map((g) => [g._id, g]));
    const byCountry: Record<string, number> = {};
    for (const b of inRange) {
      const country = guestById.get(b.guestId)?.country ?? "Unknown";
      byCountry[country] = (byCountry[country] ?? 0) + 1;
    }

    const paymentsIn = payments.filter(
      (p) => p.date >= start && p.date <= end,
    );
    const totalRevenue = paymentsIn.reduce(
      (s, p) => s + (p.direction === "in" ? p.amount : -p.amount),
      0,
    );
    const expensesInRange = expenses.filter((e) => e.date >= start && e.date <= end);
    const totalExpenses = expensesInRange.reduce((s, e) => s + e.amount, 0);
    const payrollExpenses = expensesInRange
      .filter((e) => e.category === "salary")
      .reduce((s, e) => s + e.amount, 0);
    const fixedExpenses = expensesInRange
      .filter((e) => e.kind === "fixed")
      .reduce((s, e) => s + e.amount, 0);
    const otherFixedExpenses = expensesInRange
      .filter((e) => e.kind === "fixed" && e.category !== "salary")
      .reduce((s, e) => s + e.amount, 0);
    const variableExpenses = totalExpenses - fixedExpenses;

    const rangeStartMs = Date.parse(start);
    const rangeEndMs = Date.parse(end) + 86400000;
    const newGuests = guests.filter(
      (g) => g._creationTime >= rangeStartMs && g._creationTime < rangeEndMs,
    ).length;

    return {
      monthly,
      bySource: Object.entries(bySource).map(([source, data]) => ({ source, ...data })),
      adr: totalNights === 0 ? 0 : Math.round((totalBookingValue / totalNights) * 100) / 100,
      totalBookings: inRange.length,
      totalGuests: guests.length,
      newGuests,
      totalNights,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      fixedExpenses: Math.round(fixedExpenses * 100) / 100,
      variableExpenses: Math.round(variableExpenses * 100) / 100,
      payrollExpenses: Math.round(payrollExpenses * 100) / 100,
      otherFixedExpenses: Math.round(otherFixedExpenses * 100) / 100,
      activityPopularity: Object.values(activityPopularity).sort(
        (a, b) => b.participants - a.participants,
      ),
      byCountry: Object.entries(byCountry)
        .map(([country, count]) => ({ country, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
    };
  },
});

/** Flat data for CSV exports (bookings / payments / expenses). */
export const exportData = query({
  args: { start: v.string(), end: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const [bookings, payments, expenses] = await Promise.all([
      ctx.db.query("bookings").collect(),
      ctx.db.query("payments").collect(),
      ctx.db.query("expenses").collect(),
    ]);
    const guests = await ctx.db.query("guests").collect();
    const rooms = await ctx.db.query("rooms").collect();
    const guestById = new Map(guests.map((g) => [g._id, g]));
    const roomById = new Map(rooms.map((r) => [r._id, r]));

    const bookingRows = bookings
      .filter((b) => b.checkIn <= args.end && b.checkOut > args.start)
      .map((b) => ({
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        guest: guestById.get(b.guestId)?.fullName ?? "",
        country: guestById.get(b.guestId)?.country ?? "",
        room: roomById.get(b.roomId)?.name ?? "",
        status: b.status,
        source: b.source,
        adults: b.adults,
        children: b.children,
        totalAmount: b.totalAmount,
        currency: b.currency,
        otaRef: b.channelBookingId ?? "",
      }));

    const bookingByIdMap = new Map(bookings.map((b) => [b._id, b]));
    const paymentRows = payments
      .filter((p) => p.date >= args.start && p.date <= args.end)
      .map((p) => {
        const booking = bookingByIdMap.get(p.bookingId);
        return {
          date: p.date,
          guest: booking ? (guestById.get(booking.guestId)?.fullName ?? "") : "",
          reservation: booking?.reservationCode ?? "",
          room: booking ? (roomById.get(booking.roomId)?.name ?? "") : "",
          amount: p.direction === "in" ? p.amount : -p.amount,
          method: p.method,
          currency: p.currency,
          note: p.note ?? "",
        };
      });

    const expenseRows = expenses
      .filter((e) => e.date >= args.start && e.date <= args.end)
      .map((e) => ({
        date: e.date,
        category: e.category === "other" && e.customLabel ? `other — ${e.customLabel}` : e.category,
        kind: e.kind ?? "variable",
        description: e.description,
        amount: e.amount,
        currency: e.currency,
      }));

    return { bookings: bookingRows, payments: paymentRows, expenses: expenseRows };
  },
});
