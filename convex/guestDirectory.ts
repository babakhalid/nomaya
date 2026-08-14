import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/access";

/** The guest book: everyone who ever stayed (or asked to), with stats. */
export const list = query({
  args: { search: v.optional(v.string()), today: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const [guests, bookings, payments] = await Promise.all([
      ctx.db.query("guests").collect(),
      ctx.db.query("bookings").collect(),
      ctx.db.query("payments").collect(),
    ]);

    const paidByBooking = new Map<string, number>();
    for (const p of payments) {
      const delta = p.direction === "in" ? p.amount : -p.amount;
      paidByBooking.set(p.bookingId, (paidByBooking.get(p.bookingId) ?? 0) + delta);
    }

    let rows = guests.map((guest) => {
      const stays = bookings.filter(
        (b) => b.guestId === guest._id && b.status !== "cancelled" && b.status !== "no_show",
      );
      const lastStay = stays.reduce<string | null>(
        (latest, b) => (latest === null || b.checkIn > latest ? b.checkIn : latest),
        null,
      );
      const inHouseNow = stays.some((b) => b.status === "checked_in");
      // Current = in house or has a stay that hasn't ended yet; else archive.
      const current =
        inHouseNow || stays.some((b) => b.checkOut >= args.today && b.status !== "checked_out");
      const totalSpent = stays.reduce(
        (sum, b) => sum + (paidByBooking.get(b._id) ?? 0),
        0,
      );
      const balance = stays.reduce(
        (sum, b) => sum + b.totalAmount - (paidByBooking.get(b._id) ?? 0),
        0,
      );
      return {
        guestId: guest._id,
        fullName: guest.fullName,
        email: guest.email,
        country: guest.country,
        surfLevel: guest.surfLevel,
        allergies: guest.allergies,
        staysCount: stays.length,
        lastStay,
        inHouseNow,
        current,
        totalSpent: Math.round(totalSpent * 100) / 100,
        balance: Math.round(balance * 100) / 100,
      };
    });

    if (args.search) {
      const term = args.search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.fullName.toLowerCase().includes(term) ||
          r.email?.toLowerCase().includes(term) ||
          r.country?.toLowerCase().includes(term),
      );
    }

    // In-house first, then most recent stay first, then alphabetical
    return rows.sort((a, b) => {
      if (a.inHouseNow !== b.inHouseNow) return a.inHouseNow ? -1 : 1;
      if (a.lastStay !== b.lastStay) return (b.lastStay ?? "").localeCompare(a.lastStay ?? "");
      return a.fullName.localeCompare(b.fullName);
    });
  },
});

/** Full profile: guest details + complete booking history. */
export const profile = query({
  args: { guestId: v.id("guests") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const guest = await ctx.db.get(args.guestId);
    if (!guest) return null;

    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_guest", (q) => q.eq("guestId", args.guestId))
      .collect();

    const history = await Promise.all(
      bookings.map(async (b) => {
        const [room, payments, activities, pkg, services] = await Promise.all([
          ctx.db.get(b.roomId),
          ctx.db
            .query("payments")
            .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
            .collect(),
          ctx.db
            .query("bookingActivities")
            .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
            .collect(),
          b.packageId ? ctx.db.get(b.packageId) : null,
          ctx.db
            .query("bookingServices")
            .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
            .collect(),
        ]);
        const activityNames = new Map(
          (await ctx.db.query("activities").collect()).map((a) => [a._id, a]),
        );
        const serviceNames = new Map(
          (await ctx.db.query("services").collect()).map((sv) => [sv._id, sv]),
        );
        const bed = b.bedId ? await ctx.db.get(b.bedId) : null;
        const roomType = room ? await ctx.db.get(room.roomTypeId) : null;
        const paid = payments.reduce(
          (sum, p) => sum + (p.direction === "in" ? p.amount : -p.amount),
          0,
        );
        return {
          bookingId: b._id,
          roomId: b.roomId,
          bedId: b.bedId,
          createdAt: b._creationTime,
          reservationCode: b.reservationCode,
          checkIn: b.checkIn,
          checkOut: b.checkOut,
          status: b.status,
          source: b.source,
          roomName: room?.name ?? "—",
          roomTypeName: roomType?.name,
          packageName: pkg?.name,
          bedLabel: bed?.label,
          adults: b.adults,
          children: b.children,
          totalAmount: b.totalAmount,
          paid,
          balance: b.totalAmount - paid,
          activitiesCount: activities.reduce((n, a) => n + a.participants, 0),
          portalToken: b.portalToken,
          notes: b.notes,
          companions: b.companions ?? [],
          nights: Math.round(
            (Date.parse(b.checkOut) - Date.parse(b.checkIn)) / 86400000,
          ),
          payments: payments
            .sort((x, y) => y.date.localeCompare(x.date))
            .map((pay) => ({
              date: pay.date,
              amount: pay.amount,
              method: pay.method,
              direction: pay.direction,
              note: pay.note,
            })),
          extras: services.map((line) => ({
            name: serviceNames.get(line.serviceId)?.name ?? "Service",
            qty: line.qty,
            amount: line.amount,
          })),
          activities: activities.map((line) => ({
            name: activityNames.get(line.activityId)?.name ?? "Activity",
            date: line.date,
            participants: line.participants,
          })),
        };
      }),
    );

    const active = history.filter(
      (h) => h.status !== "cancelled" && h.status !== "no_show",
    );
    return {
      guest,
      history: history.sort((a, b) => b.checkIn.localeCompare(a.checkIn)),
      stats: {
        stays: active.length,
        nights: active.reduce(
          (sum, h) =>
            sum +
            Math.round(
              (Date.parse(h.checkOut) - Date.parse(h.checkIn)) / 86400000,
            ),
          0,
        ),
        lifetimeSpend: Math.round(active.reduce((s, h) => s + h.paid, 0) * 100) / 100,
        balance: Math.round(active.reduce((s, h) => s + h.balance, 0) * 100) / 100,
      },
    };
  },
});
