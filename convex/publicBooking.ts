import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { generatePortalToken, generateReservationCode } from "./lib/access";
import { resolveRoomPhoto } from "./inventory";
import { resolvePackagePhoto } from "./catalog";
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

function isoAddDays(iso: string, days: number) {
  return new Date(Date.parse(iso) + days * 86400000).toISOString().slice(0, 10);
}

function nightsBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function validateStay(checkIn: string, checkOut: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    throw new Error("Invalid dates");
  }
  if (checkIn < isoToday()) throw new Error("Check-in must be in the future");
  if (checkIn > isoAddDays(isoToday(), 540)) {
    throw new Error("Please pick a date within the next 18 months");
  }
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) throw new Error("Check-out must be after check-in");
  if (nights > 30) throw new Error("For stays over 30 nights, contact us directly");
  return nights;
}

export const availability = query({
  args: { checkIn: v.string(), checkOut: v.string() },
  handler: async (ctx, args) => {
    const nights = validateStay(args.checkIn, args.checkOut);

    const [roomTypes, rooms, beds, bookings, packages, services, roomBlocks] = await Promise.all([
      ctx.db.query("roomTypes").collect(),
      ctx.db.query("rooms").collect(),
      ctx.db.query("beds").collect(),
      ctx.db.query("bookings").collect(),
      ctx.db.query("packages").collect(),
      ctx.db.query("services").collect(),
      ctx.db.query("roomBlocks").collect(),
    ]);

    const taken = bookings.filter((b) => overlaps(b, args.checkIn, args.checkOut));
    const blockedRoomIds = new Set(
      roomBlocks
        .filter((bl) => bl.start < args.checkOut && bl.end > args.checkIn)
        .map((bl) => bl.roomId),
    );

    // One card per actual room — guests pick the room they saw in the photos.
    const typeById = new Map(roomTypes.map((t) => [t._id, t]));
    const roomCards = await Promise.all(rooms
      .filter((r) => r.status === "available")
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(async (room) => {
        const type = typeById.get(room.roomTypeId);
        let available: boolean;
        if (blockedRoomIds.has(room._id)) {
          available = false;
        } else if (type?.mode === "dorm") {
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
          roomTypeId: room.roomTypeId,
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
      // Formules (per-person weekly rates by room type) fit any stay length;
      // classic flat packages only fit their exact night count.
      packages: packages
        .filter((p) => p.active && (p.roomTypePrices ? true : p.nights === nights))
        .map((p) => ({
          packageId: p._id,
          name: p.name,
          description: p.description,
          price: p.price,
          roomTypePrices: p.roomTypePrices,
          minGuests: p.minGuests,
        })),
      services: services
        .filter((s) => s.active)
        .map((s) => ({
          serviceId: s._id,
          name: s.name,
          price: s.price,
          unit: s.unit,
          imageUrl: s.imageUrl,
        })),
    };
  },
});

/** Formules for the landing step — shown before any dates are picked. */
export const listPackages = query({
  args: {},
  handler: async (ctx) => {
    const [packages, roomTypes, rooms] = await Promise.all([
      ctx.db.query("packages").collect(),
      ctx.db.query("roomTypes").collect(),
      ctx.db.query("rooms").collect(),
    ]);
    const cheapestRoom = rooms.length
      ? Math.min(
          ...rooms
            .filter((r) => r.status === "available")
            .map((r) => roomTypes.find((t) => t._id === r.roomTypeId)?.basePrice ?? Infinity),
        )
      : 0;
    return {
      packages: await Promise.all(packages
        .filter((p) => p.active)
        .sort((a, b) => a.price - b.price)
        .map(async (p) => ({
          packageId: p._id,
          name: p.name,
          description: p.description,
          price: p.price,
          imageUrl: await resolvePackagePhoto(ctx, p),
          perPerson: !!p.roomTypePrices,
          minGuests: p.minGuests,
        }))),
      roomOnlyFrom: Number.isFinite(cheapestRoom) ? cheapestRoom : 0,
    };
  },
});

/** Per-date count of free rooms — powers the strike-through date picker. */
export const calendarAvailability = query({
  args: { start: v.string(), end: v.string() },
  handler: async (ctx, args) => {
    if (nightsBetween(args.start, args.end) > 120) throw new Error("Range too large");
    const [rooms, beds, bookings, roomBlocks] = await Promise.all([
      ctx.db.query("rooms").collect(),
      ctx.db.query("beds").collect(),
      ctx.db.query("bookings").collect(),
      ctx.db.query("roomBlocks").collect(),
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
        const blocked = roomBlocks.some(
          (bl) => bl.roomId === room._id && bl.start <= date && bl.end > date,
        );
        if (blocked) continue;
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
    // Bound every free-text / list input so a public form can't bloat the DB.
    if ((args.allergies?.length ?? 0) > 500) throw new Error("Allergies note is too long");
    if ((args.notes?.length ?? 0) > 1000) throw new Error("Note is too long");
    if ((args.phone?.length ?? 0) > 30) throw new Error("Phone number is too long");
    if ((args.country?.length ?? 0) > 60) throw new Error("Country is too long");
    if ((args.companions?.length ?? 0) > 12) throw new Error("Too many companions");
    for (const c of args.companions ?? []) {
      if (c.name.length > 80) throw new Error("A companion name is too long");
    }

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
    const roomBlocks = await ctx.db.query("roomBlocks").collect();
    for (const { room } of chosenRooms) {
      if (roomBlocks.some((bl) => bl.roomId === room._id && bl.start < args.checkOut && bl.end > args.checkIn)) {
        throw new Error(`${room.name} is unavailable for those dates`);
      }
    }

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

    // Guests are placed room by room (adults first). Used for pricing and
    // for the per-room booking rows below.
    const distribution: { adults: number; children: number }[] = [];
    {
      let adultsLeft = args.adults;
      let childrenLeft = args.children;
      for (const { type: t } of chosenRooms) {
        const a = Math.min(adultsLeft, t.capacity);
        const c = Math.min(childrenLeft, Math.max(0, t.capacity - a));
        distribution.push({ adults: a, children: c });
        adultsLeft -= a;
        childrenLeft -= c;
      }
    }

    let totalAmount = chosenRooms.reduce(
      (sum, { type: t }) => sum + t.basePrice * nights,
      0,
    );
    if (args.packageId) {
      const pkg = await ctx.db.get(args.packageId);
      if (!pkg || !pkg.active) throw new Error("Package not available");
      if (pkg.roomTypePrices) {
        // Formule: per-person weekly rate by room type, prorated per night.
        if (pkg.minGuests && pax < pkg.minGuests) {
          throw new Error(`${pkg.name} requires at least ${pkg.minGuests} guests`);
        }
        const rateByType = new Map(pkg.roomTypePrices.map((r) => [r.roomTypeId, r.price]));
        let sum = 0;
        chosenRooms.forEach(({ type: t }, i) => {
          const weekly = rateByType.get(t._id);
          if (weekly === undefined) throw new Error(`${pkg.name} is not offered in ${t.name}`);
          const occupants = distribution[i].adults + distribution[i].children;
          sum += occupants * (weekly / 7) * nights;
        });
        totalAmount = Math.round(sum * 100) / 100;
      } else {
        if (chosenRooms.length > 1) {
          throw new Error("Packages apply to single-room bookings — add extras à la carte for group stays");
        }
        if (pkg.nights !== nights) throw new Error("Package doesn't match your stay length");
        totalAmount = pkg.price;
      }
    }

    // Extra services picked at booking time (multiple allowed)
    const extraServices: { serviceId: Id<"services">; qty: number; amount: number }[] = [];
    for (const item of args.services ?? []) {
      if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 30) throw new Error("Invalid service quantity");
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
    const primaryAdults = distribution[0].adults;
    const primaryChildren = distribution[0].children;
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
    for (const [idx, { room }] of chosenRooms.slice(1).entries()) {
      const adultsHere = distribution[idx + 1].adults;
      const childrenHere = distribution[idx + 1].children;
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
