import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { surfLevelValidator } from "./schema";
import { resolveRoomPhoto } from "./inventory";

/**
 * Guest portal — public, no auth. Every function is scoped strictly to the
 * booking matched by the unguessable portal token.
 */

async function bookingByToken(ctx: QueryCtx | MutationCtx, token: string) {
  const booking = await ctx.db
    .query("bookings")
    .withIndex("by_portalToken", (q) => q.eq("portalToken", token))
    .unique();
  if (!booking || booking.status === "cancelled") return null;
  return booking;
}

// Group bookings (one row per room) are linked through the companion rows'
// notes: "billed on <primary reservationCode>". Any token in the group
// resolves to the primary + all sibling rooms.
const GROUP_MARKER = "billed on ";

async function bookingGroup(
  ctx: QueryCtx | MutationCtx,
  booking: NonNullable<Awaited<ReturnType<typeof bookingByToken>>>,
) {
  let primary = booking;
  const markerAt = booking.notes ? booking.notes.indexOf(GROUP_MARKER) : -1;
  if (booking.notes && markerAt >= 0) {
    const code = booking.notes.slice(markerAt + GROUP_MARKER.length).trim();
    const found = code
      ? await ctx.db
          .query("bookings")
          .withIndex("by_reservationCode", (q) => q.eq("reservationCode", code))
          .unique()
      : null;
    if (found && found.status !== "cancelled") primary = found;
  }
  const siblings = primary.reservationCode
    ? (
        await ctx.db
          .query("bookings")
          .withIndex("by_guest", (q) => q.eq("guestId", primary.guestId))
          .collect()
      ).filter(
        (b) =>
          b._id !== primary._id &&
          b.status !== "cancelled" &&
          b.checkIn === primary.checkIn &&
          (b.notes ?? "").includes(`${GROUP_MARKER}${primary.reservationCode}`),
      )
    : [];
  return [primary, ...siblings];
}

export const stay = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const tokenBooking = await bookingByToken(ctx, args.token);
    if (!tokenBooking) return null;
    // Anchor the whole portal to the primary booking so every room's token
    // shows the same reservation (bill, requests, code).
    const group = await bookingGroup(ctx, tokenBooking);
    const booking = group[0];
    const [guest, room] = await Promise.all([
      ctx.db.get(booking.guestId),
      ctx.db.get(booking.roomId),
    ]);
    const roomType = room ? await ctx.db.get(room.roomTypeId) : null;
    const rooms = (
      await Promise.all(
        group.map(async (b) => {
          const r = await ctx.db.get(b.roomId);
          if (!r) return null;
          const t = await ctx.db.get(r.roomTypeId);
          return {
            name: r.name,
            typeName: t?.name,
            description: r.description,
            imageUrl: await resolveRoomPhoto(ctx, r),
          };
        }),
      )
    ).filter((r) => r !== null);
    const totalAdults = group.reduce((n, b) => n + b.adults, 0);
    const totalChildren = group.reduce((n, b) => n + b.children, 0);
    const pkg = booking.packageId ? await ctx.db.get(booking.packageId) : null;
    const [activities, services, myRequests, myActivities, myPayments] =
      await Promise.all([
        ctx.db.query("activities").collect(),
        ctx.db.query("services").collect(),
        ctx.db
          .query("guestRequests")
          .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
          .collect(),
        ctx.db
          .query("bookingActivities")
          .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
          .collect(),
        ctx.db
          .query("payments")
          .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
          .collect(),
      ]);
    const paid = myPayments.reduce(
      (sum, p) => sum + (p.direction === "in" ? p.amount : -p.amount),
      0,
    );
    const activityById = new Map(activities.map((a) => [a._id, a]));
    return {
      guestName: guest?.fullName ?? "Guest",
      guestCountry: guest?.country,
      packageName: pkg?.name,
      createdAt: booking._creationTime,
      surfLevel: guest?.surfLevel,
      allergies: guest?.allergies,
      reservationCode: booking.reservationCode,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      roomName: room?.name,
      roomTypeName: roomType?.name,
      roomDescription: room?.description,
      roomImageUrl: room ? await resolveRoomPhoto(ctx, room) : undefined,
      rooms,
      guests: [
        {
          name: guest?.fullName ?? "Guest",
          surfLevel: guest?.surfLevel,
          lead: true,
        },
        ...(booking.companions ?? []).map((c) => ({
          name: c.name,
          surfLevel: c.surfLevel,
          lead: false,
        })),
      ],
      adults: totalAdults,
      children: totalChildren,
      // A self-service request only holds the room once a deposit (or the
      // full amount) is in — until then the stay is a pending request.
      confirmedStay: booking.status !== "inquiry" || paid > 0,
      money: {
        total: booking.totalAmount,
        paid: Math.round(paid * 100) / 100,
        balance: Math.round((booking.totalAmount - paid) * 100) / 100,
        currency: booking.currency,
      },
      payments: myPayments
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((p) => ({
          amount: p.amount,
          direction: p.direction,
          method: p.method,
          date: p.date,
        })),
      catalog: {
        activities: activities
          .filter((a) => a.active)
          .sort((a, b) => (a.startTime ?? "99").localeCompare(b.startTime ?? "99"))
          .map((a) => ({
            _id: a._id,
            name: a.name,
            price: a.price,
            durationMin: a.durationMin,
            type: a.type,
            startTime: a.startTime,
          })),
        services: services
          .filter((s) => s.active)
          .sort((a, b) => (a.startTime ?? "99").localeCompare(b.startTime ?? "99"))
          .map((s) => ({
            _id: s._id,
            name: s.name,
            price: s.price,
            unit: s.unit,
            startTime: s.startTime,
          })),
      },
      booked: myActivities.map((a) => ({
        name: activityById.get(a.activityId)?.name ?? "Activity",
        startTime: activityById.get(a.activityId)?.startTime,
        date: a.date,
        participants: a.participants,
      })),
      requests: myRequests.map((r) => ({
        _id: r._id,
        type: r.type,
        status: r.status,
        payload: {
          note: r.payload.note,
          qty: r.payload.qty,
          date: r.payload.date,
          activityName: r.payload.activityId
            ? (activityById.get(r.payload.activityId)?.name ?? "Activity")
            : undefined,
          serviceName: r.payload.serviceId
            ? (services.find((s) => s._id === r.payload.serviceId)?.name ??
              "Service")
            : undefined,
        },
      })),
    };
  },
});

export const updatePreferences = mutation({
  args: {
    token: v.string(),
    surfLevel: v.optional(surfLevelValidator),
    allergies: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const booking = await bookingByToken(ctx, args.token);
    if (!booking) throw new Error("Invalid link");
    const guest = await ctx.db.get(booking.guestId);
    if (!guest) throw new Error("Guest not found");

    const patch: Record<string, unknown> = {};
    if (args.surfLevel !== undefined) patch.surfLevel = args.surfLevel;
    if (args.allergies !== undefined) patch.allergies = args.allergies;
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(booking.guestId, patch);
    }
    if (args.note) {
      await ctx.db.insert("guestRequests", {
        bookingId: booking._id,
        type: "requirement",
        payload: { note: args.note },
        status: "pending",
      });
    }
    await ctx.db.insert("auditLogs", {
      actorName: `Guest: ${guest.fullName}`,
      action: "portal.updatePreferences",
      entity: "guests",
      entityId: booking.guestId,
      summary: `${guest.fullName} updated preferences via portal`,
      before: { surfLevel: guest.surfLevel, allergies: guest.allergies },
      after: patch,
    });
  },
});

/**
 * SIMULATED card payment (Stripe-style checkout, no real gateway).
 * Records a real `payments` row so balances update live, clearly tagged
 * as a simulation in the note and the audit log.
 */
export const simulateCardPayment = mutation({
  args: {
    token: v.string(),
    amount: v.number(),
    cardLast4: v.string(),
  },
  handler: async (ctx, args) => {
    const tokenBooking = await bookingByToken(ctx, args.token);
    if (!tokenBooking) throw new Error("Invalid link");
    // The bill lives on the primary booking of the group.
    const group = await bookingGroup(ctx, tokenBooking);
    const booking = group[0];
    if (!/^\d{4}$/.test(args.cardLast4)) throw new Error("Invalid card");

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
      .collect();
    const paid = payments.reduce(
      (sum, p) => sum + (p.direction === "in" ? p.amount : -p.amount),
      0,
    );
    const balance = Math.round((booking.totalAmount - paid) * 100) / 100;
    const amount = Math.round(args.amount * 100) / 100;
    if (amount < 1) throw new Error("Minimum payment is €1");
    if (amount > balance + 0.005) {
      throw new Error(`Amount exceeds the outstanding balance (€${balance.toFixed(2)})`);
    }

    const guest = await ctx.db.get(booking.guestId);
    const today = new Date().toISOString().slice(0, 10);
    const id = await ctx.db.insert("payments", {
      bookingId: booking._id,
      amount,
      currency: "EUR",
      method: "card",
      direction: "in",
      date: today,
      note: `[SIMULATION] Stripe checkout by guest · card ••••${args.cardLast4}`,
    });
    // First money in confirms the reservation — every room in the group.
    const nowConfirmed = booking.status === "inquiry";
    if (nowConfirmed) {
      for (const b of group) {
        if (b.status === "inquiry") await ctx.db.patch(b._id, { status: "confirmed" });
      }
    }
    await ctx.db.insert("auditLogs", {
      actorName: `Guest: ${guest?.fullName ?? "Unknown"}`,
      action: "portal.cardPayment",
      entity: "payments",
      entityId: id,
      summary: `${guest?.fullName} paid €${amount.toFixed(2)} by card via portal (SIMULATION)${nowConfirmed ? " — reservation confirmed" : ""}`,
      after: { amount, cardLast4: args.cardLast4 },
    });
    return { paid: amount, newBalance: Math.round((balance - amount) * 100) / 100 };
  },
});

/**
 * SIMULATED bank transfer declaration — creates a pending guest request so
 * the crew confirms receipt before recording the payment. Nothing is
 * counted as paid until staff approve.
 */
export const declareBankTransfer = mutation({
  args: {
    token: v.string(),
    amount: v.number(),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tokenBooking = await bookingByToken(ctx, args.token);
    if (!tokenBooking) throw new Error("Invalid link");
    // Reference the primary booking so staff match the transfer to the bill.
    const booking = (await bookingGroup(ctx, tokenBooking))[0];
    const amount = Math.round(args.amount * 100) / 100;
    if (amount < 1) throw new Error("Minimum transfer is €1");
    if (amount > 100000) throw new Error("Invalid amount");

    const guest = await ctx.db.get(booking.guestId);
    const id = await ctx.db.insert("guestRequests", {
      bookingId: booking._id,
      type: "requirement",
      payload: {
        note: `[SIMULATION] Bank transfer declared: €${amount.toFixed(2)} · ref ${booking.reservationCode ?? booking._id}${args.reference ? ` · guest ref: ${args.reference}` : ""} — confirm receipt, then record the payment.`,
      },
      status: "pending",
    });
    await ctx.db.insert("auditLogs", {
      actorName: `Guest: ${guest?.fullName ?? "Unknown"}`,
      action: "portal.declareTransfer",
      entity: "guestRequests",
      entityId: id,
      summary: `${guest?.fullName} declared a bank transfer of €${amount.toFixed(2)} (SIMULATION)`,
      after: { amount, reference: args.reference },
    });
  },
});

export const placeOrder = mutation({
  args: {
    token: v.string(),
    // A basket: guests can request several activities/services at once.
    items: v.array(
      v.object({
        activityId: v.optional(v.id("activities")),
        serviceId: v.optional(v.id("services")),
        qty: v.number(),
        date: v.optional(v.string()),
        note: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const booking = await bookingByToken(ctx, args.token);
    if (!booking) throw new Error("Invalid link");
    if (args.items.length === 0) throw new Error("Nothing selected");
    if (args.items.length > 15) throw new Error("Too many items in one request");
    const guest = await ctx.db.get(booking.guestId);

    const names: string[] = [];
    for (const item of args.items) {
      if (!item.activityId && !item.serviceId) throw new Error("Invalid item");
      if (item.qty < 1 || item.qty > 20) throw new Error("Invalid quantity");
      const doc = item.activityId
        ? await ctx.db.get(item.activityId)
        : await ctx.db.get(item.serviceId!);
      if (!doc) throw new Error("Item not found");
      names.push(`${doc.name} ×${item.qty}`);
      await ctx.db.insert("guestRequests", {
        bookingId: booking._id,
        type: "order",
        payload: {
          activityId: item.activityId,
          serviceId: item.serviceId,
          qty: item.qty,
          date: item.date,
          note: item.note,
        },
        status: "pending",
      });
    }

    await ctx.db.insert("auditLogs", {
      actorName: `Guest: ${guest?.fullName ?? "Unknown"}`,
      action: "portal.placeOrder",
      entity: "guestRequests",
      entityId: booking._id,
      summary: `${guest?.fullName} requested ${names.join(", ")} via portal`,
      after: { items: args.items },
    });
  },
});
