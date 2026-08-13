import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { generatePortalToken, generateReservationCode } from "./lib/access";
import { resolveRoomPhoto } from "./inventory";
import { internal } from "./_generated/api";
import { surfLevelValidator } from "./schema";

/**
 * Public self-service booking — no auth. Guests check availability and
 * submit a booking that lands on the calendar as an "inquiry" (slot held,
 * staff confirm from the booking drawer). Every submission is audit-logged.
 */

const HOLDING_STATUSES = ["inquiry", "confirmed", "checked_in"] as const;

function overlaps(b: Doc<"bookings">, checkIn: string, checkOut: string) {
  return (
    (HOLDING_STATUSES as readonly string[]).includes(b.status) &&
    b.checkIn < checkOut &&
    b.checkOut > checkIn
  );
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function nightsBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function validateStay(checkIn: string, checkOut: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    throw new Error("Invalid dates");
  }
  if (checkIn < isoToday()) throw new Error("Check-in must be in the future");
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) throw new Error("Check-out must be after check-in");
  if (nights > 30) throw new Error("For stays over 30 nights, contact us directly");
  return nights;
}

export const availability = query({
  args: { checkIn: v.string(), checkOut: v.string() },
  handler: async (ctx, args) => {
    const nights = validateStay(args.checkIn, args.checkOut);

    const [roomTypes, rooms, beds, bookings, packages, services] = await Promise.all([
      ctx.db.query("roomTypes").collect(),
      ctx.db.query("rooms").collect(),
      ctx.db.query("beds").collect(),
      ctx.db.query("bookings").collect(),
      ctx.db.query("packages").collect(),
      ctx.db.query("services").collect(),
    ]);

    const taken = bookings.filter((b) => overlaps(b, args.checkIn, args.checkOut));

    // One card per actual room — guests pick the room they saw in the photos.
    const typeById = new Map(roomTypes.map((t) => [t._id, t]));
    const roomCards = await Promise.all(rooms
      .filter((r) => r.status === "available")
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(async (room) => {
        const type = typeById.get(room.roomTypeId);
        let available: boolean;
        if (type?.mode === "dorm") {
          const roomBeds = beds.filter((b) => b.roomId === room._id);
          const takenBeds = new Set(
            taken.filter((b) => b.roomId === room._id && b.bedId).map((b) => b.bedId),
          );
          available = roomBeds.length - takenBeds.size > 0;
        } else {
          available = !taken.some((b) => b.roomId === room._id);
        }
        return {
          roomId: room._id,
          name: room.name,
          description: room.description,
          imageUrl: await resolveRoomPhoto(ctx, room),
          typeName: type?.name ?? "",
          mode: type?.mode ?? "private",
          capacity: type?.capacity ?? 2,
          pricePerNight: type?.basePrice ?? 0,
          totalForStay: (type?.basePrice ?? 0) * nights,
          available,
        };
      }));

    return {
      nights,
      rooms: roomCards,
      // packages designed for exactly this stay length
      packages: packages
        .filter((p) => p.active && p.nights === nights)
        .map((p) => ({
          packageId: p._id,
          name: p.name,
          description: p.description,
          price: p.price,
        })),
      services: services
        .filter((s) => s.active)
        .map((s) => ({
          serviceId: s._id,
          name: s.name,
          price: s.price,
          unit: s.unit,
        })),
    };
  },
});

/** Per-date count of free rooms — powers the strike-through date picker. */
export const calendarAvailability = query({
  args: { start: v.string(), end: v.string() },
  handler: async (ctx, args) => {
    if (nightsBetween(args.start, args.end) > 120) throw new Error("Range too large");
    const [rooms, beds, bookings] = await Promise.all([
      ctx.db.query("rooms").collect(),
      ctx.db.query("beds").collect(),
      ctx.db.query("bookings").collect(),
    ]);
    const active = rooms.filter((r) => r.status === "available");
    const holding = bookings.filter(
      (b) =>
        (HOLDING_STATUSES as readonly string[]).includes(b.status) &&
        b.checkIn < args.end &&
        b.checkOut > args.start,
    );
    const perDate: Record<string, number> = {};
    let t = Date.parse(args.start);
    const endT = Date.parse(args.end);
    while (t < endT) {
      const date = new Date(t).toISOString().slice(0, 10);
      let free = 0;
      for (const room of active) {
        const roomBookings = holding.filter(
          (b) => b.roomId === room._id && b.checkIn <= date && b.checkOut > date,
        );
        const roomBeds = beds.filter((b) => b.roomId === room._id);
        if (roomBeds.length > 0) {
          if (roomBookings.length < roomBeds.length) free++;
        } else if (roomBookings.length === 0) {
          free++;
        }
      }
      perDate[date] = free;
      t += 86400000;
    }
    return perDate;
  },
});

export const createRequest = mutation({
  args: {
    checkIn: v.string(),
    checkOut: v.string(),
    roomIds: v.array(v.id("rooms")), // one or more rooms (groups can combine)
    packageId: v.optional(v.id("packages")),
    services: v.optional(
      v.array(v.object({ serviceId: v.id("services"), qty: v.number() })),
    ),
    adults: v.number(),
    children: v.number(),
    fullName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    country: v.optional(v.string()),
    surfLevel: v.optional(surfLevelValidator),
    allergies: v.optional(v.string()),
    notes: v.optional(v.string()),
    companions: v.optional(
      v.array(v.object({ name: v.string(), surfLevel: v.optional(v.string()) })),
    ),
  },
  handler: async (ctx, args) => {
    const nights = validateStay(args.checkIn, args.checkOut);
    const fullName = args.fullName.trim();
    if (fullName.length < 2 || fullName.length > 80) throw new Error("Please enter your name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.email)) throw new Error("Please enter a valid email");

    if (args.roomIds.length < 1) throw new Error("Pick at least one room");
    if (args.roomIds.length > 5) throw new Error("Too many rooms in one request");
    if (args.adults < 1) throw new Error("At least one adult required");
    const pax = args.adults + args.children;

    const chosenRooms = [];
    for (const id of args.roomIds) {
      const room = await ctx.db.get(id);
      if (!room || room.status !== "available") throw new Error("Room not found");
      const roomType = await ctx.db.get(room.roomTypeId);
      if (!roomType) throw new Error("Room type not found");
      chosenRooms.push({ room, type: roomType });
    }
    const chosenRoom = chosenRooms[0].room;
    const type = chosenRooms[0].type;

    if (chosenRooms.some(({ type: t }) => t.mode === "dorm")) {
      if (chosenRooms.length > 1 || pax > 1) {
        throw new Error("Dorm beds are booked per person — submit one request per bed");
      }
    }
    const totalCapacity = chosenRooms.reduce((n, { type: t }) => n + t.capacity, 0);
    if (pax > totalCapacity) {
      throw new Error(`The selected room(s) sleep up to ${totalCapacity}`);
    }

    // Confirm every chosen room is still free (or grab a free bed in a dorm).
    const [beds, bookings] = await Promise.all([
      ctx.db.query("beds").collect(),
      ctx.db.query("bookings").collect(),
    ]);
    const taken = bookings.filter((b) => overlaps(b, args.checkIn, args.checkOut));

    const roomId = chosenRoom._id;
    let bedId = undefined;
    if (type.mode === "dorm") {
      const takenBeds = new Set(
        taken.filter((b) => b.roomId === roomId && b.bedId).map((b) => b.bedId),
      );
      bedId = beds
        .filter((b) => b.roomId === roomId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .find((b) => !takenBeds.has(b._id))?._id;
      if (!bedId) throw new Error("Sorry — this room just filled up for those dates");
    } else {
      for (const { room } of chosenRooms) {
        if (taken.some((b) => b.roomId === room._id)) {
          throw new Error(`Sorry — ${room.name} just got booked for those dates`);
        }
      }
    }

    let totalAmount = chosenRooms.reduce(
      (sum, { type: t }) => sum + t.basePrice * nights,
      0,
    );
    if (args.packageId) {
      if (chosenRooms.length > 1) {
        throw new Error("Packages apply to single-room bookings — add extras à la carte for group stays");
      }
      const pkg = await ctx.db.get(args.packageId);
      if (!pkg || !pkg.active) throw new Error("Package not available");
      if (pkg.nights !== nights) throw new Error("Package doesn't match your stay length");
      totalAmount = pkg.price;
    }

    // Extra services picked at booking time (multiple allowed)
    const extraServices: { serviceId: Id<"services">; qty: number; amount: number }[] = [];
    for (const item of args.services ?? []) {
      if (item.qty < 1 || item.qty > 30) throw new Error("Invalid service quantity");
      const service = await ctx.db.get(item.serviceId);
      if (!service || !service.active) throw new Error("Service not available");
      const amount = service.price * item.qty;
      extraServices.push({ serviceId: item.serviceId, qty: item.qty, amount });
      totalAmount += amount;
    }

    const guestId = await ctx.db.insert("guests", {
      fullName,
      email: args.email,
      phone: args.phone,
      country: args.country,
      surfLevel: args.surfLevel,
      allergies: args.allergies,
    });

    const portalToken = generatePortalToken();
    const reservationCode = generateReservationCode();
    // Each booking row carries only the guests sleeping in its own room, so
    // per-room occupancy (and group totals) stay correct.
    const primaryAdults =
      chosenRooms.length > 1 ? Math.min(args.adults, type.capacity) : args.adults;
    const primaryChildren =
      chosenRooms.length > 1
        ? Math.min(args.children, Math.max(0, type.capacity - primaryAdults))
        : args.children;
    const bookingId = await ctx.db.insert("bookings", {
      guestId,
      roomId,
      bedId,
      packageId: args.packageId,
      checkIn: args.checkIn,
      checkOut: args.checkOut,
      status: "inquiry",
      source: "direct",
      adults: primaryAdults,
      children: primaryChildren,
      totalAmount,
      currency: "EUR",
      notes: args.notes ? `[Self-service] ${args.notes}` : "[Self-service booking]",
      companions: args.companions,
      portalToken,
      reservationCode,
    });

    for (const item of extraServices) {
      await ctx.db.insert("bookingServices", {
        bookingId,
        serviceId: item.serviceId,
        qty: item.qty,
        amount: item.amount,
      });
    }

    // Package line items, same as staff-created bookings
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
              amount: 0,
            });
          }
        }
      }
    }

    // Additional rooms in a group booking: one booking row each so the
    // calendar and availability stay correct; all billing sits on the
    // primary reservation.
    let adultsLeft = args.adults - Math.min(args.adults, type.capacity);
    let childrenLeft =
      args.children - Math.max(0, Math.min(args.children, type.capacity - Math.min(args.adults, type.capacity)));
    for (const { room, type: roomType2 } of chosenRooms.slice(1)) {
      const adultsHere = Math.min(Math.max(adultsLeft, 0), roomType2.capacity);
      const childrenHere = Math.min(
        Math.max(childrenLeft, 0),
        Math.max(0, roomType2.capacity - adultsHere),
      );
      adultsLeft -= adultsHere;
      childrenLeft -= childrenHere;
      await ctx.db.insert("bookings", {
        guestId,
        roomId: room._id,
        checkIn: args.checkIn,
        checkOut: args.checkOut,
        status: "inquiry",
        source: "direct",
        adults: adultsHere,
        children: childrenHere,
        totalAmount: 0,
        currency: "EUR",
        notes: `[Self-service] Group booking — billed on ${reservationCode}`,
        portalToken: generatePortalToken(),
        reservationCode: generateReservationCode(),
      });
    }

    await ctx.scheduler.runAfter(0, internal.channex.pushAvailability, {
      start: args.checkIn,
      end: args.checkOut,
    });
    await ctx.db.insert("auditLogs", {
      actorName: `Guest: ${fullName} (self-service)`,
      action: "booking.selfService",
      entity: "bookings",
      entityId: bookingId,
      summary: `Self-service request: ${fullName} · ${args.checkIn} → ${args.checkOut} · ${chosenRoom.name}`,
      after: {
        checkIn: args.checkIn,
        checkOut: args.checkOut,
        roomType: type.name,
        pax,
        totalAmount,
      },
    });

    return {
      portalToken,
      reservationCode,
      totalAmount,
      nights,
      roomTypeName:
        chosenRooms.length > 1
          ? chosenRooms.map(({ room }) => room.name).join(" + ")
          : chosenRoom.name,
    };
  },
});
