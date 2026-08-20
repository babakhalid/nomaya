import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  generatePortalToken,
  generateReservationCode,
  logAudit,
  requireRole,
  requireUser,
} from "./lib/access";
import {
  bookingSourceValidator,
  bookingStatusValidator,
  surfLevelValidator,
} from "./schema";

const ACTIVE_STATUSES = ["inquiry", "confirmed", "checked_in"] as const;

/** Two stays clash when their [checkIn, checkOut) ranges intersect. */
function overlaps(a: Doc<"bookings">, checkIn: string, checkOut: string) {
  return a.checkIn < checkOut && a.checkOut > checkIn;
}

export async function assertSlotFree(
  ctx: MutationCtx,
  roomId: Id<"rooms">,
  bedId: Id<"beds"> | undefined,
  checkIn: string,
  checkOut: string,
  ignoreBookingId?: Id<"bookings">,
) {
  const existing = await ctx.db
    .query("bookings")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
  const clash = existing.find(
    (b) =>
      b._id !== ignoreBookingId &&
      (ACTIVE_STATUSES as readonly string[]).includes(b.status) &&
      // dorm bookings clash per-bed; private room bookings clash per-room
      (bedId === undefined || b.bedId === undefined || b.bedId === bedId) &&
      overlaps(b, checkIn, checkOut),
  );
  if (clash) {
    throw new Error(
      `Slot already booked ${clash.checkIn} → ${clash.checkOut}`,
    );
  }
}

// ── Queries ────────────────────────────────────────────────────────────

export const inRange = query({
  args: { start: v.string(), end: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const bookings = await ctx.db.query("bookings").collect();
    const visible = bookings.filter(
      (b) => b.checkIn < args.end && b.checkOut > args.start,
    );
    const guests = await Promise.all(visible.map((b) => ctx.db.get(b.guestId)));
    return visible.map((b, i) => ({
      ...b,
      guestName: guests[i]?.fullName ?? "Unknown",
    }));
  },
});

export const detail = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) return null;
    const [guest, room, pkg] = await Promise.all([
      ctx.db.get(booking.guestId),
      ctx.db.get(booking.roomId),
      booking.packageId ? ctx.db.get(booking.packageId) : null,
    ]);
    const bed = booking.bedId ? await ctx.db.get(booking.bedId) : null;
    const roomType = room ? await ctx.db.get(room.roomTypeId) : null;
    const [acts, servs, pays, requests] = await Promise.all([
      ctx.db
        .query("bookingActivities")
        .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
        .collect(),
      ctx.db
        .query("bookingServices")
        .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
        .collect(),
      ctx.db
        .query("payments")
        .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
        .collect(),
      ctx.db
        .query("guestRequests")
        .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
        .collect(),
    ]);
    const activityDocs = await Promise.all(
      acts.map((a) => ctx.db.get(a.activityId)),
    );
    const serviceDocs = await Promise.all(
      servs.map((s) => ctx.db.get(s.serviceId)),
    );
    const paid = pays.reduce(
      (sum, p) => sum + (p.direction === "in" ? p.amount : -p.amount),
      0,
    );
    return {
      booking,
      guest,
      room,
      roomType,
      bed,
      pkg,
      activities: acts.map((a, i) => ({
        ...a,
        name: activityDocs[i]?.name,
        startTime: activityDocs[i]?.startTime,
      })),
      services: servs.map((s, i) => ({ ...s, name: serviceDocs[i]?.name })),
      payments: pays,
      requests,
      paid,
      balance: booking.totalAmount - paid,
    };
  },
});

// ── Mutations ──────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    // guest: either existing or created inline (the "add client from calendar" flow)
    guestId: v.optional(v.id("guests")),
    guest: v.optional(
      v.object({
        fullName: v.string(),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        country: v.optional(v.string()),
        surfLevel: v.optional(surfLevelValidator),
        allergies: v.optional(v.string()),
      }),
    ),
    roomId: v.id("rooms"),
    bedId: v.optional(v.id("beds")),
    packageId: v.optional(v.id("packages")),
    checkIn: v.string(),
    checkOut: v.string(),
    status: bookingStatusValidator,
    source: bookingSourceValidator,
    channelBookingId: v.optional(v.string()),
    adults: v.number(),
    children: v.number(),
    totalAmount: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    if (args.checkIn >= args.checkOut) {
      throw new Error("Check-out must be after check-in");
    }
    await assertSlotFree(ctx, args.roomId, args.bedId, args.checkIn, args.checkOut);

    let guestId = args.guestId;
    if (!guestId) {
      if (!args.guest) throw new Error("Guest info required");
      guestId = await ctx.db.insert("guests", args.guest);
      await logAudit(ctx, actor, {
        action: "guest.create",
        entity: "guests",
        entityId: guestId,
        summary: `Added guest ${args.guest.fullName}`,
        after: args.guest,
      });
    }
    const guest = await ctx.db.get(guestId);

    let totalAmount = args.totalAmount;
    const bookingId = await ctx.db.insert("bookings", {
      guestId,
      roomId: args.roomId,
      bedId: args.bedId,
      packageId: args.packageId,
      checkIn: args.checkIn,
      checkOut: args.checkOut,
      status: args.status,
      source: args.source,
      channelBookingId: args.channelBookingId,
      adults: args.adults,
      children: args.children,
      totalAmount,
      currency: "EUR",
      notes: args.notes,
      createdBy: actor._id,
      portalToken: generatePortalToken(),
      reservationCode: generateReservationCode(),
    });

    // A package pre-fills its included activities/services as line items.
    if (args.packageId) {
      const pkg = await ctx.db.get(args.packageId);
      if (pkg) {
        for (const item of pkg.includedItems) {
          if (item.kind === "activity") {
            await ctx.db.insert("bookingActivities", {
              bookingId,
              activityId: item.refId as Id<"activities">,
              date: args.checkIn,
              participants: item.qty,
            });
          } else {
            await ctx.db.insert("bookingServices", {
              bookingId,
              serviceId: item.refId as Id<"services">,
              qty: item.qty,
              amount: 0, // included in package price
            });
          }
        }
        if (totalAmount === 0) {
          totalAmount = pkg.price;
          await ctx.db.patch(bookingId, { totalAmount });
        }
      }
    }

    await ctx.scheduler.runAfter(0, internal.channex.pushAvailability, {
      start: args.checkIn,
      end: args.checkOut,
    });
    await logAudit(ctx, actor, {
      action: "booking.create",
      entity: "bookings",
      entityId: bookingId,
      summary: `Booked ${guest?.fullName} · ${args.checkIn} → ${args.checkOut}`,
      after: { ...args, totalAmount },
    });
    return bookingId;
  },
});

export const update = mutation({
  args: {
    bookingId: v.id("bookings"),
    roomId: v.optional(v.id("rooms")),
    bedId: v.optional(v.id("beds")),
    checkIn: v.optional(v.string()),
    checkOut: v.optional(v.string()),
    adults: v.optional(v.number()),
    children: v.optional(v.number()),
    totalAmount: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { bookingId, ...patch }) => {
    const actor = await requireRole(ctx, "manager");
    const before = await ctx.db.get(bookingId);
    if (!before) throw new Error("Booking not found");
    const next = { ...before, ...patch };
    if (next.checkIn >= next.checkOut) {
      throw new Error("Check-out must be after check-in");
    }
    await assertSlotFree(
      ctx,
      next.roomId,
      next.bedId,
      next.checkIn,
      next.checkOut,
      bookingId,
    );
    await ctx.db.patch(bookingId, patch);
    await ctx.scheduler.runAfter(0, internal.channex.pushAvailability, {
      start: before.checkIn < next.checkIn ? before.checkIn : next.checkIn,
      end: before.checkOut > next.checkOut ? before.checkOut : next.checkOut,
    });
    const guest = await ctx.db.get(before.guestId);
    await logAudit(ctx, actor, {
      action: "booking.update",
      entity: "bookings",
      entityId: bookingId,
      summary: `Updated booking for ${guest?.fullName}`,
      before,
      after: patch,
    });
  },
});

export const setStatus = mutation({
  args: { bookingId: v.id("bookings"), status: bookingStatusValidator },
  handler: async (ctx, args) => {
    // Crew handle daily check-in/out; confirm / cancel / no-show are manager+.
    const crewAllowed = args.status === "checked_in" || args.status === "checked_out";
    const actor = crewAllowed
      ? await requireUser(ctx)
      : await requireRole(ctx, "manager");
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    await ctx.db.patch(args.bookingId, { status: args.status });
    await ctx.scheduler.runAfter(0, internal.channex.pushAvailability, {
      start: booking.checkIn,
      end: booking.checkOut,
    });
    const guest = await ctx.db.get(booking.guestId);
    await logAudit(ctx, actor, {
      action: `booking.${args.status}`,
      entity: "bookings",
      entityId: args.bookingId,
      summary: `${guest?.fullName}: ${booking.status} → ${args.status}`,
      before: { status: booking.status },
      after: { status: args.status },
    });
  },
});

export const addActivity = mutation({
  args: {
    bookingId: v.id("bookings"),
    activityId: v.id("activities"),
    date: v.string(),
    participants: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "manager");
    const activity = await ctx.db.get(args.activityId);
    if (!activity) throw new Error("Activity not found");
    const id = await ctx.db.insert("bookingActivities", args);
    const booking = await ctx.db.get(args.bookingId);
    await ctx.db.patch(args.bookingId, {
      totalAmount:
        (booking?.totalAmount ?? 0) + activity.price * args.participants,
    });
    await logAudit(ctx, actor, {
      action: "booking.addActivity",
      entity: "bookingActivities",
      entityId: id,
      summary: `Added ${activity.name} ×${args.participants} on ${args.date}`,
      after: args,
    });
    return id;
  },
});

export const removeActivity = mutation({
  args: { id: v.id("bookingActivities") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "manager");
    const item = await ctx.db.get(args.id);
    if (!item) return;
    const activity = await ctx.db.get(item.activityId);
    const booking = await ctx.db.get(item.bookingId);
    if (booking && activity) {
      await ctx.db.patch(item.bookingId, {
        totalAmount: Math.max(
          0,
          booking.totalAmount - activity.price * item.participants,
        ),
      });
    }
    await ctx.db.delete(args.id);
    await logAudit(ctx, actor, {
      action: "booking.removeActivity",
      entity: "bookingActivities",
      entityId: args.id,
      summary: `Removed ${activity?.name ?? "activity"} from booking`,
      before: item,
    });
  },
});

export const addService = mutation({
  args: {
    bookingId: v.id("bookings"),
    serviceId: v.id("services"),
    qty: v.number(),
    date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "manager");
    const service = await ctx.db.get(args.serviceId);
    if (!service) throw new Error("Service not found");
    const amount = service.price * args.qty;
    const id = await ctx.db.insert("bookingServices", { ...args, amount });
    const booking = await ctx.db.get(args.bookingId);
    await ctx.db.patch(args.bookingId, {
      totalAmount: (booking?.totalAmount ?? 0) + amount,
    });
    await logAudit(ctx, actor, {
      action: "booking.addService",
      entity: "bookingServices",
      entityId: id,
      summary: `Added ${service.name} ×${args.qty}`,
      after: { ...args, amount },
    });
    return id;
  },
});

export const removeService = mutation({
  args: { id: v.id("bookingServices") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "manager");
    const item = await ctx.db.get(args.id);
    if (!item) return;
    const service = await ctx.db.get(item.serviceId);
    const booking = await ctx.db.get(item.bookingId);
    if (booking) {
      await ctx.db.patch(item.bookingId, {
        totalAmount: Math.max(0, booking.totalAmount - item.amount),
      });
    }
    await ctx.db.delete(args.id);
    await logAudit(ctx, actor, {
      action: "booking.removeService",
      entity: "bookingServices",
      entityId: args.id,
      summary: `Removed ${service?.name ?? "service"} from booking`,
      before: item,
    });
  },
});

export const updateGuest = mutation({
  args: {
    guestId: v.id("guests"),
    fullName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    country: v.optional(v.string()),
    surfLevel: v.optional(surfLevelValidator),
    allergies: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { guestId, ...patch }) => {
    const actor = await requireUser(ctx);
    const before = await ctx.db.get(guestId);
    if (!before) throw new Error("Guest not found");
    await ctx.db.patch(guestId, patch);
    await logAudit(ctx, actor, {
      action: "guest.update",
      entity: "guests",
      entityId: guestId,
      summary: `Updated guest ${before.fullName}`,
      before,
      after: patch,
    });
  },
});

export const resolveGuestRequest = mutation({
  args: {
    requestId: v.id("guestRequests"),
    approve: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "manager");
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.status !== "pending") throw new Error("Already resolved");

    await ctx.db.patch(args.requestId, {
      status: args.approve ? "approved" : "declined",
      resolvedBy: actor._id,
    });

    // Approved orders become real line items on the booking.
    if (args.approve && request.type === "order") {
      const { activityId, serviceId, qty, date } = request.payload;
      if (activityId) {
        const activity = await ctx.db.get(activityId);
        const booking = await ctx.db.get(request.bookingId);
        if (activity && booking) {
          await ctx.db.insert("bookingActivities", {
            bookingId: request.bookingId,
            activityId,
            date: date ?? booking.checkIn,
            participants: qty ?? 1,
          });
          await ctx.db.patch(request.bookingId, {
            totalAmount: booking.totalAmount + activity.price * (qty ?? 1),
          });
        }
      } else if (serviceId) {
        const service = await ctx.db.get(serviceId);
        const booking = await ctx.db.get(request.bookingId);
        if (service && booking) {
          const amount = service.price * (qty ?? 1);
          await ctx.db.insert("bookingServices", {
            bookingId: request.bookingId,
            serviceId,
            qty: qty ?? 1,
            date,
            amount,
          });
          await ctx.db.patch(request.bookingId, {
            totalAmount: booking.totalAmount + amount,
          });
        }
      }
    }

    await logAudit(ctx, actor, {
      action: args.approve ? "guestRequest.approve" : "guestRequest.decline",
      entity: "guestRequests",
      entityId: args.requestId,
      summary: `${args.approve ? "Approved" : "Declined"} guest ${request.type}`,
      before: { status: "pending" },
      after: { status: args.approve ? "approved" : "declined" },
    });
  },
});

export const listGuests = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const guests = await ctx.db.query("guests").collect();
    if (!args.search) return guests.slice(0, 50);
    const term = args.search.toLowerCase();
    return guests
      .filter(
        (g) =>
          g.fullName.toLowerCase().includes(term) ||
          g.email?.toLowerCase().includes(term),
      )
      .slice(0, 20);
  },
});

export const remove = mutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "manager");
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) return;
    const guest = await ctx.db.get(booking.guestId);
    for (const table of [
      "bookingActivities",
      "bookingServices",
      "payments",
      "guestRequests",
    ] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
    await ctx.db.delete(args.bookingId);
    await ctx.scheduler.runAfter(0, internal.channex.pushAvailability, {
      start: booking.checkIn,
      end: booking.checkOut,
    });
    await logAudit(ctx, actor, {
      action: "booking.delete",
      entity: "bookings",
      entityId: args.bookingId,
      summary: `Deleted booking for ${guest?.fullName}`,
      before: booking,
    });
  },
});


/** Delete a guest and every trace of their stays. Manager+ only. */
export const removeGuest = mutation({
  args: { guestId: v.id("guests") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "manager");
    const guest = await ctx.db.get(args.guestId);
    if (!guest) return;
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_guest", (q) => q.eq("guestId", args.guestId))
      .collect();
    for (const booking of bookings) {
      for (const table of [
        "bookingActivities",
        "bookingServices",
        "payments",
        "guestRequests",
      ] as const) {
        const rows = await ctx.db
          .query(table)
          .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
          .collect();
        for (const row of rows) await ctx.db.delete(row._id);
      }
      await ctx.db.delete(booking._id);
    }
    await ctx.db.delete(args.guestId);
    if (bookings.length > 0) {
      const start = bookings.reduce((a, b) => (b.checkIn < a ? b.checkIn : a), bookings[0].checkIn);
      const end = bookings.reduce((a, b) => (b.checkOut > a ? b.checkOut : a), bookings[0].checkOut);
      await ctx.scheduler.runAfter(0, internal.channex.pushAvailability, { start, end });
    }
    await logAudit(ctx, actor, {
      action: "guest.delete",
      entity: "guests",
      entityId: args.guestId,
      summary: `Deleted guest ${guest.fullName} (${bookings.length} bookings and their payments/requests)`,
      before: guest,
    });
  },
});

/**
 * Calendar drag: move or resize a stay. Recalculates the price for the new
 * room/dates (formule per-person rates, flat package, or nightly), resyncs
 * per-day service lines to the new night count, attaches default services
 * (e.g. breakfast), and shifts activity dates when the whole stay moves.
 */
export const move = mutation({
  args: {
    bookingId: v.id("bookings"),
    roomId: v.id("rooms"),
    bedId: v.optional(v.id("beds")),
    checkIn: v.string(),
    checkOut: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "manager");
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    if (args.checkIn >= args.checkOut) throw new Error("Check-out must be after check-in");
    await assertSlotFree(ctx, args.roomId, args.bedId, args.checkIn, args.checkOut, args.bookingId);

    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("Room not found");
    const type = await ctx.db.get(room.roomTypeId);
    if (!type) throw new Error("Room type not found");
    const nights = Math.round(
      (Date.parse(args.checkOut) - Date.parse(args.checkIn)) / 86400000,
    );
    const pax = booking.adults + booking.children;

    // Stay price under the new room/dates
    const pkg = booking.packageId ? await ctx.db.get(booking.packageId) : null;
    let stay: number;
    let dropPackage = false;
    if (pkg?.roomTypePrices) {
      const rate = pkg.roomTypePrices.find((r) => r.roomTypeId === room.roomTypeId)?.price;
      if (rate === undefined) {
        throw new Error(`${pkg.name} is not offered in ${type.name} — edit the stay instead`);
      }
      stay = Math.round(pax * (rate / 7) * nights * 100) / 100;
    } else if (pkg) {
      if (pkg.nights === nights) {
        stay = pkg.price;
      } else {
        // Flat package no longer matches the stay length — fall back to nightly.
        stay = type.basePrice * nights;
        dropPackage = true;
      }
    } else {
      stay = type.basePrice * nights;
    }

    // Resync per-day service lines and attach missing default services
    const [serviceLines, services] = await Promise.all([
      ctx.db
        .query("bookingServices")
        .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
        .collect(),
      ctx.db.query("services").collect(),
    ]);
    const serviceById = new Map(services.map((s) => [s._id, s]));
    let servicesTotal = 0;
    for (const line of serviceLines) {
      const svc = serviceById.get(line.serviceId);
      if (svc?.unit === "per_day" && line.amount > 0) {
        const amount = svc.price * nights;
        await ctx.db.patch(line._id, { qty: nights, amount });
        servicesTotal += amount;
      } else {
        servicesTotal += line.amount;
      }
    }
    for (const svc of services) {
      if (!svc.active || !svc.includedByDefault) continue;
      if (serviceLines.some((l) => l.serviceId === svc._id)) continue;
      const qty = svc.unit === "per_day" ? nights : 1;
      const amount = svc.price * qty;
      await ctx.db.insert("bookingServices", {
        bookingId: args.bookingId,
        serviceId: svc._id,
        qty,
        amount,
      });
      servicesTotal += amount;
    }

    // Whole-stay move: carry activity dates along
    const shiftDays = Math.round(
      (Date.parse(args.checkIn) - Date.parse(booking.checkIn)) / 86400000,
    );
    const sameLength =
      nights === Math.round((Date.parse(booking.checkOut) - Date.parse(booking.checkIn)) / 86400000);
    if (shiftDays !== 0 && sameLength) {
      const acts = await ctx.db
        .query("bookingActivities")
        .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
        .collect();
      for (const a of acts) {
        const shifted = new Date(Date.parse(a.date) + shiftDays * 86400000)
          .toISOString()
          .slice(0, 10);
        await ctx.db.patch(a._id, { date: shifted });
      }
    }

    const totalAmount = Math.round((stay + servicesTotal) * 100) / 100;
    await ctx.db.patch(args.bookingId, {
      roomId: args.roomId,
      bedId: args.bedId,
      checkIn: args.checkIn,
      checkOut: args.checkOut,
      totalAmount,
      packageId: dropPackage ? undefined : booking.packageId,
    });
    await ctx.scheduler.runAfter(0, internal.channex.pushAvailability, {
      start: booking.checkIn < args.checkIn ? booking.checkIn : args.checkIn,
      end: booking.checkOut > args.checkOut ? booking.checkOut : args.checkOut,
    });
    const guest = await ctx.db.get(booking.guestId);
    await logAudit(ctx, actor, {
      action: "booking.move",
      entity: "bookings",
      entityId: args.bookingId,
      summary: `Moved ${guest?.fullName}: ${booking.checkIn}→${booking.checkOut} became ${args.checkIn}→${args.checkOut} (${eurLog(booking.totalAmount)} → ${eurLog(totalAmount)})`,
      before: {
        roomId: booking.roomId,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        totalAmount: booking.totalAmount,
      },
      after: { roomId: args.roomId, checkIn: args.checkIn, checkOut: args.checkOut, totalAmount },
    });
    return { totalAmount, nights, droppedPackage: dropPackage };
  },
});

function eurLog(n: number) {
  return `€${n.toFixed(2)}`;
}
