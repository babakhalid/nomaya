import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { generatePortalToken, generateReservationCode } from "./lib/access";

/**
 * Demo data seeder. Run with: npx convex run seed:run
 * Idempotent — refuses to run if rooms already exist.
 */

function isoAddDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("rooms").first();
    if (existing) return "Already seeded — skipping.";

    const today = new Date();
    const day = (offset: number) => isoAddDays(today, offset);

    // ── Room types ──
    const doubleType = await ctx.db.insert("roomTypes", {
      name: "Ocean Double",
      description: "Private double with ocean view and terrace",
      mode: "private",
      capacity: 2,
      basePrice: 55,
      amenities: ["Private bathroom", "Terrace", "Ocean view"],
    });
    const familyType = await ctx.db.insert("roomTypes", {
      name: "Family Suite",
      description: "Two connected rooms, sleeps four",
      mode: "private",
      capacity: 4,
      basePrice: 85,
      amenities: ["Private bathroom", "Kitchenette"],
    });
    const dormType = await ctx.db.insert("roomTypes", {
      name: "Surf Dorm",
      description: "Shared dorm, per-bed booking",
      mode: "dorm",
      capacity: 6,
      basePrice: 18,
      amenities: ["Lockers", "Shared bathroom"],
    });

    // ── Rooms + beds ──
    const roomAtlas = await ctx.db.insert("rooms", {
      roomTypeId: doubleType, name: "Atlas", floor: "1", status: "available", sortOrder: 0,
    });
    await ctx.db.insert("rooms", {
      roomTypeId: doubleType, name: "Anza", floor: "1", status: "available", sortOrder: 1,
    });
    const roomTaghazout = await ctx.db.insert("rooms", {
      roomTypeId: doubleType, name: "Taghazout", floor: "2", status: "available", sortOrder: 2,
    });
    const roomAmouddou = await ctx.db.insert("rooms", {
      roomTypeId: familyType, name: "Amouddou", floor: "2", status: "available", sortOrder: 3,
    });
    const dormBanana = await ctx.db.insert("rooms", {
      roomTypeId: dormType, name: "Banana Dorm", floor: "G", status: "available", sortOrder: 4,
    });
    const dormDevils = await ctx.db.insert("rooms", {
      roomTypeId: dormType, name: "Devil's Rock Dorm", floor: "G", status: "available", sortOrder: 5,
    });

    const bananaBeds: Id<"beds">[] = [];
    for (let i = 0; i < 6; i++) {
      bananaBeds.push(
        await ctx.db.insert("beds", { roomId: dormBanana, label: `Bed ${i + 1}`, sortOrder: i }),
      );
    }
    const devilsBeds: Id<"beds">[] = [];
    for (let i = 0; i < 4; i++) {
      devilsBeds.push(
        await ctx.db.insert("beds", { roomId: dormDevils, label: `Bed ${i + 1}`, sortOrder: i }),
      );
    }

    // ── Activities ──
    const beginnerSurf = await ctx.db.insert("activities", {
      name: "Beginner Surf Lesson", type: "surf_lesson", capacityPerSession: 8,
      price: 30, durationMin: 120, color: "#2b8188", active: true, startTime: "10:00",
    });
    const intermediateSurf = await ctx.db.insert("activities", {
      name: "Intermediate Coaching", type: "surf_lesson", capacityPerSession: 6,
      price: 35, durationMin: 120, color: "#4a9fa4", active: true, startTime: "10:00",
    });
    const surfGuiding = await ctx.db.insert("activities", {
      name: "Surf Guiding", type: "surf_guiding", capacityPerSession: 6,
      price: 25, durationMin: 240, color: "#0f5c63", active: true, startTime: "10:00",
    });
    await ctx.db.insert("activities", {
      name: "Free Surf Session", type: "surf_guiding", capacityPerSession: 20,
      price: 0, durationMin: 120, color: "#7dc0c2", active: true, startTime: "14:30",
    });
    await ctx.db.insert("activities", {
      name: "Souk Trip", type: "excursion", capacityPerSession: 12,
      price: 0, durationMin: 120, color: "#a3906f", active: true, startTime: "16:00",
    });
    const yoga = await ctx.db.insert("activities", {
      name: "Sunset Yoga", type: "yoga", capacityPerSession: 12,
      price: 12, durationMin: 75, color: "#e8b04b", active: true, startTime: "19:00",
    });
    const excursion = await ctx.db.insert("activities", {
      name: "Paradise Valley Trip", type: "excursion", capacityPerSession: 10,
      price: 40, durationMin: 360, color: "#c05b4d", active: true, startTime: "09:30",
    });

    // ── Services ──
    const transfer = await ctx.db.insert("services", {
      name: "Airport Transfer (AGA)", price: 35, unit: "per_unit", active: true,
    });
    const rental = await ctx.db.insert("services", {
      name: "Board + Wetsuit Rental", price: 15, unit: "per_day", active: true,
    });
    const halfBoard = await ctx.db.insert("services", {
      name: "Half-Board Meals", price: 14, unit: "per_day", active: true,
    });
    await ctx.db.insert("services", {
      name: "Breakfast", price: 6, unit: "per_day", active: true, startTime: "09:00",
    });
    await ctx.db.insert("services", {
      name: "Lunch", price: 10, unit: "per_day", active: true, startTime: "13:00",
    });
    await ctx.db.insert("services", {
      name: "Dinner", price: 12, unit: "per_day", active: true, startTime: "20:00",
    });
    await ctx.db.insert("services", {
      name: "Laundry Bag", price: 8, unit: "per_unit", active: true,
    });

    // ── Packages ──
    await ctx.db.insert("packages", {
      name: "7-Night Surf & Stay",
      description: "Week in a dorm bed, 5 surf lessons, daily half-board, airport pickup",
      price: 385,
      nights: 7,
      includedItems: [
        { kind: "activity", refId: beginnerSurf, qty: 5 },
        { kind: "service", refId: halfBoard, qty: 7 },
        { kind: "service", refId: transfer, qty: 1 },
      ],
      active: true,
    });
    await ctx.db.insert("packages", {
      name: "Weekend Swell Escape",
      description: "3 nights private double, 2 guided sessions, sunset yoga",
      price: 290,
      nights: 3,
      includedItems: [
        { kind: "activity", refId: surfGuiding, qty: 2 },
        { kind: "activity", refId: yoga, qty: 1 },
      ],
      active: true,
    });

    // ── Guests ──
    const mkGuest = (g: {
      fullName: string; email?: string; phone?: string; country?: string;
      surfLevel?: "beginner" | "intermediate" | "advanced"; allergies?: string;
    }) => ctx.db.insert("guests", g);

    const lena = await mkGuest({
      fullName: "Lena Bergström", email: "lena.bergstrom@gmail.com",
      phone: "+46 70 314 8829", country: "Sweden", surfLevel: "beginner",
      allergies: "Lactose intolerant",
    });
    const theo = await mkGuest({
      fullName: "Théo Marchetti", email: "theo.marchetti@proton.me",
      phone: "+33 6 52 19 44 07", country: "France", surfLevel: "intermediate",
    });
    const priya = await mkGuest({
      fullName: "Priya Raghunathan", email: "priya.r@outlook.com",
      phone: "+44 7911 284 663", country: "United Kingdom", surfLevel: "beginner",
      allergies: "Peanuts (severe)",
    });
    const jonas = await mkGuest({
      fullName: "Jonas Wetzel", email: "jwetzel@gmx.de",
      phone: "+49 151 2387 1142", country: "Germany", surfLevel: "advanced",
    });
    const aline = await mkGuest({
      fullName: "Aline Duarte", email: "aline.duarte@icloud.com",
      phone: "+351 91 442 7730", country: "Portugal", surfLevel: "intermediate",
    });
    const noor = await mkGuest({
      fullName: "Noor El Fassi", email: "noor.elfassi@gmail.com",
      phone: "+212 661 48 22 93", country: "Morocco", surfLevel: "beginner",
      allergies: "Vegetarian",
    });
    const casper = await mkGuest({
      fullName: "Casper Vandenberg", email: "caspervdb@hotmail.com",
      phone: "+31 6 2841 9034", country: "Netherlands", surfLevel: "beginner",
    });

    // ── Bookings ──
    const mkBooking = async (b: {
      guestId: typeof lena; roomId: typeof roomAtlas; bedId?: (typeof bananaBeds)[number];
      checkIn: string; checkOut: string;
      status: "inquiry" | "confirmed" | "checked_in" | "checked_out";
      source: "direct" | "booking_com" | "airbnb" | "walk_in" | "hostelworld";
      adults: number; children?: number; totalAmount: number;
      channelBookingId?: string; notes?: string;
    }) =>
      ctx.db.insert("bookings", {
        guestId: b.guestId, roomId: b.roomId, bedId: b.bedId,
        checkIn: b.checkIn, checkOut: b.checkOut, status: b.status,
        source: b.source, channelBookingId: b.channelBookingId,
        adults: b.adults, children: b.children ?? 0,
        totalAmount: b.totalAmount, currency: "EUR", notes: b.notes,
        portalToken: generatePortalToken(),
        reservationCode: generateReservationCode(),
      });

    const bLena = await mkBooking({
      guestId: lena, roomId: dormBanana, bedId: bananaBeds[0],
      checkIn: day(-2), checkOut: day(5), status: "checked_in",
      source: "hostelworld", channelBookingId: "HW-88213947",
      adults: 1, totalAmount: 385,
      notes: "7-Night Surf & Stay package",
    });
    const bTheo = await mkBooking({
      guestId: theo, roomId: roomAtlas,
      checkIn: day(-1), checkOut: day(4), status: "checked_in",
      source: "booking_com", channelBookingId: "BDC-4471820365",
      adults: 2, totalAmount: 275,
    });
    const bPriya = await mkBooking({
      guestId: priya, roomId: dormBanana, bedId: bananaBeds[1],
      checkIn: day(0), checkOut: day(7), status: "confirmed",
      source: "direct", adults: 1, totalAmount: 126,
    });
    const bJonas = await mkBooking({
      guestId: jonas, roomId: roomTaghazout,
      checkIn: day(1), checkOut: day(8), status: "confirmed",
      source: "airbnb", channelBookingId: "ABB-HMKQ5T8ZRW",
      adults: 1, totalAmount: 385,
    });
    const bAline = await mkBooking({
      guestId: aline, roomId: roomAmouddou,
      checkIn: day(3), checkOut: day(10), status: "confirmed",
      source: "direct", adults: 2, children: 2, totalAmount: 595,
    });
    const bNoor = await mkBooking({
      guestId: noor, roomId: dormDevils, bedId: devilsBeds[0],
      checkIn: day(-5), checkOut: day(-1), status: "checked_out",
      source: "walk_in", adults: 1, totalAmount: 72,
    });
    await mkBooking({
      guestId: casper, roomId: dormBanana, bedId: bananaBeds[2],
      checkIn: day(4), checkOut: day(11), status: "inquiry",
      source: "direct", adults: 1, totalAmount: 126,
    });

    // ── Booking activities (surf roster across the week) ──
    const addAct = (bookingId: typeof bLena, activityId: typeof beginnerSurf, date: string, participants = 1) =>
      ctx.db.insert("bookingActivities", { bookingId, activityId, date, participants });

    for (let i = 0; i < 5; i++) await addAct(bLena, beginnerSurf, day(i));
    await addAct(bTheo, intermediateSurf, day(0), 2);
    await addAct(bTheo, intermediateSurf, day(1), 2);
    await addAct(bTheo, yoga, day(0), 2);
    await addAct(bPriya, beginnerSurf, day(1));
    await addAct(bPriya, beginnerSurf, day(2));
    await addAct(bPriya, yoga, day(1));
    await addAct(bJonas, surfGuiding, day(2));
    await addAct(bJonas, surfGuiding, day(3));
    await addAct(bAline, beginnerSurf, day(4), 2);
    await addAct(bAline, excursion, day(5), 4);

    // ── Booking services ──
    await ctx.db.insert("bookingServices", {
      bookingId: bLena, serviceId: halfBoard, qty: 7, amount: 0,
    });
    await ctx.db.insert("bookingServices", {
      bookingId: bLena, serviceId: transfer, qty: 1, date: day(-2), amount: 0,
    });
    await ctx.db.insert("bookingServices", {
      bookingId: bTheo, serviceId: rental, qty: 5, amount: 75,
    });
    await ctx.db.insert("bookingServices", {
      bookingId: bJonas, serviceId: transfer, qty: 1, date: day(1), amount: 35,
    });
    await ctx.db.insert("bookingServices", {
      bookingId: bAline, serviceId: transfer, qty: 1, date: day(3), amount: 35,
    });

    // ── Payments ──
    const pay = (bookingId: typeof bLena, amount: number, method: "cash" | "bank_transfer" | "card" | "ota_payout", date: string, note?: string) =>
      ctx.db.insert("payments", {
        bookingId, amount, currency: "EUR", method, direction: "in", date, note,
      });

    await pay(bLena, 100, "bank_transfer", day(-14), "Deposit");
    await pay(bLena, 285, "cash", day(-2), "Balance at check-in");
    await pay(bTheo, 275, "ota_payout", day(-1), "Booking.com payout");
    await pay(bPriya, 50, "bank_transfer", day(-7), "Deposit");
    await pay(bNoor, 72, "cash", day(-5));
    await pay(bAline, 200, "bank_transfer", day(-4), "Deposit");

    // ── Expenses ──
    await ctx.db.insert("expenses", {
      category: "food", amount: 240.5, currency: "EUR", date: day(-3),
      description: "Weekly souk run — produce and fish",
    });
    await ctx.db.insert("expenses", {
      category: "equipment", amount: 180, currency: "EUR", date: day(-6),
      description: "Two new 8ft foamies",
    });
    await ctx.db.insert("expenses", {
      category: "transport", amount: 62.4, currency: "EUR", date: day(-2),
      description: "Van fuel + parking Taghazout",
    });
    await ctx.db.insert("expenses", {
      category: "utilities", amount: 118.7, currency: "EUR", date: day(-10),
      description: "Electricity + water June",
    });

    // ── Channels + pending requests ──
    const bookingCom = await ctx.db.insert("channels", {
      name: "Booking.com", type: "booking_com", status: "mock", lastSyncAt: Date.now(),
    });
    const airbnb = await ctx.db.insert("channels", {
      name: "Airbnb", type: "airbnb", status: "mock", lastSyncAt: Date.now(),
    });
    await ctx.db.insert("channels", {
      name: "Hostelworld", type: "hostelworld", status: "mock", lastSyncAt: Date.now(),
    });

    await ctx.db.insert("channelRequests", {
      channelId: bookingCom,
      type: "new_booking",
      status: "pending",
      payload: {
        ota_reservation_code: "BDC-5529183074",
        guest_name: "Maëlle Roussel",
        guest_email: "maelle.roussel@orange.fr",
        guest_country: "France",
        arrival_date: day(6),
        departure_date: day(11),
        room_type: "Ocean Double",
        occupancy: 2,
        total_price: 275,
        currency: "EUR",
        notes: "Arriving late, around 22:30",
      },
    });
    await ctx.db.insert("channelRequests", {
      channelId: airbnb,
      type: "new_booking",
      status: "pending",
      payload: {
        ota_reservation_code: "ABB-PN3XK7WQJD",
        guest_name: "Rok Zupančič",
        guest_email: "rok.zupancic@siol.net",
        guest_country: "Slovenia",
        arrival_date: day(9),
        departure_date: day(16),
        room_type: "Surf Dorm",
        occupancy: 1,
        total_price: 126,
        currency: "EUR",
      },
    });

    // ── A pending guest request (portal demo) ──
    await ctx.db.insert("guestRequests", {
      bookingId: bPriya,
      type: "order",
      payload: { activityId: yoga, qty: 1, date: day(2), note: "Evening session if possible" },
      status: "pending",
    });

    await ctx.db.insert("auditLogs", {
      actorName: "System",
      action: "seed.run",
      entity: "system",
      summary: "Seeded demo data (rooms, guests, bookings, channels)",
    });

    return "Seeded demo data.";
  },
});

/**
 * One-off top-up for already-seeded databases: adds the restauration
 * services (Breakfast / Lunch / Dinner) if they don't exist yet, and gives
 * one in-house booking a breakfast line so the calendar row has data.
 * Run with: npx convex run seed:ensureMealServices
 */
export const ensureMealServices = internalMutation({
  args: {},
  handler: async (ctx) => {
    const services = await ctx.db.query("services").collect();
    const wanted: { name: string; price: number }[] = [
      { name: "Breakfast", price: 6 },
      { name: "Lunch", price: 10 },
      { name: "Dinner", price: 12 },
    ];
    const created: string[] = [];
    for (const meal of wanted) {
      if (services.some((s) => s.name === meal.name)) continue;
      await ctx.db.insert("services", {
        name: meal.name,
        price: meal.price,
        unit: "per_day",
        active: true,
      });
      created.push(meal.name);
    }
    if (created.length > 0) {
      await ctx.db.insert("auditLogs", {
        actorName: "System",
        action: "service.create",
        entity: "services",
        summary: `Added restauration services: ${created.join(", ")}`,
      });
    }
    return created.length > 0
      ? `Added: ${created.join(", ")}`
      : "Meal services already present.";
  },
});

/**
 * Set the house daily program on existing catalogs (idempotent, by name):
 * Breakfast 09:00 · Surf 10:00 · Lunch 13:00 · Free surf 14:30 · Souk 16:00 ·
 * Yoga 19:00 · Dinner 20:00. Creates Free Surf Session / Souk Trip if missing.
 * Run with: npx convex run seed:setDailyTimes  (add --prod for production)
 */
export const setDailyTimes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const activityTimes: Record<string, string> = {
      "Beginner Surf Lesson": "10:00",
      "Intermediate Coaching": "10:00",
      "Surf Guiding": "10:00",
      "Free Surf Session": "14:30",
      "Souk Trip": "16:00",
      "Sunset Yoga": "19:00",
      "Paradise Valley Trip": "09:30",
    };
    const serviceTimes: Record<string, string> = {
      Breakfast: "09:00",
      Lunch: "13:00",
      Dinner: "20:00",
    };

    const activities = await ctx.db.query("activities").collect();
    const services = await ctx.db.query("services").collect();
    const changes: string[] = [];

    for (const [name, startTime] of Object.entries(activityTimes)) {
      const doc = activities.find((a) => a.name === name);
      if (doc) {
        if (doc.startTime !== startTime) {
          await ctx.db.patch(doc._id, { startTime });
          changes.push(`${name} → ${startTime}`);
        }
      } else if (name === "Free Surf Session") {
        await ctx.db.insert("activities", {
          name, type: "surf_guiding", capacityPerSession: 20,
          price: 0, durationMin: 120, color: "#7dc0c2", active: true, startTime,
        });
        changes.push(`created ${name} at ${startTime}`);
      } else if (name === "Souk Trip") {
        await ctx.db.insert("activities", {
          name, type: "excursion", capacityPerSession: 12,
          price: 0, durationMin: 120, color: "#a3906f", active: true, startTime,
        });
        changes.push(`created ${name} at ${startTime}`);
      }
    }
    for (const [name, startTime] of Object.entries(serviceTimes)) {
      const doc = services.find((s) => s.name === name);
      if (doc && doc.startTime !== startTime) {
        await ctx.db.patch(doc._id, { startTime });
        changes.push(`${name} → ${startTime}`);
      }
    }

    if (changes.length > 0) {
      await ctx.db.insert("auditLogs", {
        actorName: "System",
        action: "catalog.setDailyTimes",
        entity: "activities",
        summary: `Set daily program times: ${changes.join(", ")}`,
      });
    }
    return changes.length > 0 ? changes.join("; ") : "Already up to date.";
  },
});

/** Give every existing booking a reservation code (idempotent). */
export const backfillReservationCodes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const bookings = await ctx.db.query("bookings").collect();
    let patched = 0;
    for (const b of bookings) {
      if (!b.reservationCode) {
        await ctx.db.patch(b._id, { reservationCode: generateReservationCode() });
        patched++;
      }
    }
    return `Assigned codes to ${patched} bookings.`;
  },
});

/** Add a guest directly (idempotent by phone). Run via CLI. */
export const addGuest = internalMutation({
  args: {
    fullName: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    country: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const guests = await ctx.db.query("guests").collect();
    const digits = (s: string) => s.replace(/\D/g, "");
    const existing = guests.find(
      (g) => g.phone && digits(g.phone).slice(-9) === digits(args.phone).slice(-9),
    );
    if (existing) {
      await ctx.db.patch(existing._id, { fullName: args.fullName, phone: args.phone });
      return `Updated existing guest ${args.fullName} (${existing._id})`;
    }
    const id = await ctx.db.insert("guests", args);
    await ctx.db.insert("auditLogs", {
      actorName: "System",
      action: "guest.create",
      entity: "guests",
      entityId: id,
      summary: `Added guest ${args.fullName} via CLI`,
      after: args,
    });
    return `Added guest ${args.fullName} (${id})`;
  },
});

/**
 * Get Salty real inventory: wipes the demo rooms/bookings and creates the
 * nine real rooms with photos. Idempotent — skips if "Tide Room" exists.
 * Run with: npx convex run seed:setupRealRooms (add --prod for production)
 */
export const setupRealRooms = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existingRooms = await ctx.db.query("rooms").collect();
    if (existingRooms.some((r) => r.name === "Tide Room")) {
      return "Real rooms already set up — skipping.";
    }

    // Wipe demo data that references the old inventory
    for (const table of [
      "payments", "bookingActivities", "bookingServices", "guestRequests",
      "channelRequests", "bookings", "guests", "beds", "rooms", "roomTypes",
    ] as const) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }

    // Room types
    const doubleShared = await ctx.db.insert("roomTypes", {
      name: "Double Room · Shared Bathroom", mode: "private",
      capacity: 2, basePrice: 35, amenities: ["Shared bathroom"],
    });
    const twinShared = await ctx.db.insert("roomTypes", {
      name: "Twin Room · Shared Bathroom", mode: "private",
      capacity: 2, basePrice: 35, amenities: ["Two single beds", "Shared bathroom"],
    });
    const privateBath = await ctx.db.insert("roomTypes", {
      name: "Double or Twin · Private Bathroom", mode: "private",
      capacity: 2, basePrice: 45, amenities: ["Private en-suite bathroom"],
    });
    const triple = await ctx.db.insert("roomTypes", {
      name: "Triple Room · Shared Bathroom", mode: "private",
      capacity: 3, basePrice: 45, amenities: ["Three single beds", "Shared bathroom"],
    });
    const apartment = await ctx.db.insert("roomTypes", {
      name: "Entire Apartment", mode: "private",
      capacity: 4, basePrice: 90, amenities: ["Two bedrooms", "Private kitchen", "Living space"],
    });

    const rooms: {
      name: string; typeId: typeof doubleShared; description: string; image: string;
    }[] = [
      { name: "Tide Room", typeId: twinShared, image: "/rooms/tide-room.jpg",
        description: "Two singles, a balcony, and all the light you need to start the day." },
      { name: "Ocean Suite", typeId: privateBath, image: "/rooms/ocean-suite.jpg",
        description: "Relax in comfort with your own private en-suite bathroom." },
      { name: "Seaside Trio", typeId: triple, image: "/rooms/seaside-trio.jpg",
        description: "Three singles and shared facilities — ideal for a group of friends." },
      { name: "Sunset Double", typeId: doubleShared, image: "/rooms/sunset-double.jpg",
        description: "A warm double room with its own balcony — perfect for evening light." },
      { name: "Coastal Room", typeId: doubleShared, image: "/rooms/coastal-room.jpg",
        description: "A cosy, compact double — clean, simple, and everything you need." },
      { name: "Salt Room", typeId: doubleShared, image: "/rooms/salt-room.jpg",
        description: "A simply furnished double — two singles, good light, easy access." },
      { name: "Golden Room", typeId: doubleShared, image: "/rooms/golden-room.jpg",
        description: "Warm tones, a private balcony, and a double bed to come home to." },
      { name: "Tide Twin", typeId: twinShared, image: "/rooms/tide-twin.jpg",
        description: "Two singles and a striped rug — laid-back and easy on the eye." },
      { name: "The Salty Flat", typeId: apartment, image: "/rooms/salty-flat.jpg",
        description: "Two bedrooms, a private kitchen, and your own living space. The most independent way to stay." },
    ];
    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];
      await ctx.db.insert("rooms", {
        roomTypeId: room.typeId,
        name: room.name,
        status: "available",
        description: room.description,
        imageUrl: room.image,
        sortOrder: i,
      });
    }

    await ctx.db.insert("auditLogs", {
      actorName: "System",
      action: "seed.setupRealRooms",
      entity: "rooms",
      summary: "Replaced demo inventory with the 9 real Get Salty rooms",
    });
    return "Created 9 real rooms across 5 room types.";
  },
});

/**
 * Demo bookings + payments for the REAL Get Salty rooms, so the dashboard,
 * calendar and analytics feel alive (same experience as the Nomaya demo).
 * Idempotent — skips if any "[Demo]" booking exists.
 * Run with: npx convex run seed:seedDemoBookings (add --prod for production)
 */
export const seedDemoBookings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const bookings = await ctx.db.query("bookings").collect();
    if (bookings.some((b) => b.notes?.includes("[Demo]"))) {
      return "Demo bookings already present — skipping.";
    }

    const rooms = await ctx.db.query("rooms").collect();
    const roomTypes = await ctx.db.query("roomTypes").collect();
    const activities = await ctx.db.query("activities").collect();
    const channels = await ctx.db.query("channels").collect();
    const roomByName = (name: string) => rooms.find((r) => r.name === name);
    const activityByName = (name: string) => activities.find((a) => a.name === name);
    const priceOf = (roomName: string) => {
      const room = roomByName(roomName);
      const type = roomTypes.find((t) => t._id === room?.roomTypeId);
      return type?.basePrice ?? 35;
    };

    const today = new Date();
    const day = (offset: number) => isoAddDays(today, offset);
    const nightsOf = (a: string, b: string) =>
      Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

    const mkGuest = (g: {
      fullName: string; email?: string; phone?: string; country?: string;
      surfLevel?: "beginner" | "intermediate" | "advanced"; allergies?: string;
    }) => ctx.db.insert("guests", g);

    const mkBooking = async (b: {
      guestId: Id<"guests">; roomName: string; checkIn: string; checkOut: string;
      status: "inquiry" | "confirmed" | "checked_in" | "checked_out";
      source: "direct" | "booking_com" | "airbnb" | "walk_in";
      adults: number; children?: number;
      channelBookingId?: string; extra?: number; note?: string;
    }) => {
      const room = roomByName(b.roomName);
      if (!room) throw new Error(`Room not found: ${b.roomName}`);
      return await ctx.db.insert("bookings", {
        guestId: b.guestId,
        roomId: room._id,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        status: b.status,
        source: b.source,
        channelBookingId: b.channelBookingId,
        adults: b.adults,
        children: b.children ?? 0,
        totalAmount: priceOf(b.roomName) * nightsOf(b.checkIn, b.checkOut) + (b.extra ?? 0),
        currency: "EUR",
        notes: `[Demo]${b.note ? ` ${b.note}` : ""}`,
        portalToken: generatePortalToken(),
        reservationCode: generateReservationCode(),
      });
    };
    const pay = (bookingId: Id<"bookings">, amount: number, method: "cash" | "bank_transfer" | "card" | "ota_payout", date: string, note?: string) =>
      ctx.db.insert("payments", {
        bookingId, amount, currency: "EUR", method, direction: "in", date, note,
      });

    // ── Guests ──
    const mara = await mkGuest({
      fullName: "Mara Lindqvist", email: "mara.lindqvist@gmail.com",
      phone: "+46 73 512 9084", country: "Sweden", surfLevel: "beginner",
      allergies: "Gluten-free",
    });
    const hugo = await mkGuest({
      fullName: "Hugo Delacroix", email: "hugo.delacroix@proton.me",
      phone: "+33 6 71 40 22 85", country: "France", surfLevel: "intermediate",
    });
    const ciara = await mkGuest({
      fullName: "Ciara O'Donnell", email: "ciara.odonnell@gmail.com",
      phone: "+353 87 244 1963", country: "Ireland", surfLevel: "beginner",
    });
    const lennart = await mkGuest({
      fullName: "Lennart Böhme", email: "l.boehme@gmx.de",
      phone: "+49 160 4471 208", country: "Germany", surfLevel: "advanced",
    });
    const salma = await mkGuest({
      fullName: "Salma Idrissi", email: "salma.idrissi@gmail.com",
      phone: "+212 662 48 17 93", country: "Morocco",
      surfLevel: "intermediate", allergies: "Vegetarian",
    });
    const tomas = await mkGuest({
      fullName: "Tomás Herrera", email: "tomas.herrera@outlook.es",
      phone: "+34 655 90 21 47", country: "Spain", surfLevel: "beginner",
    });
    const family = await mkGuest({
      fullName: "Anneke van Dijk", email: "anneke.vandijk@kpnmail.nl",
      phone: "+31 6 4032 7719", country: "Netherlands", surfLevel: "beginner",
      allergies: "Kids: no nuts",
    });

    // ── Bookings ──
    const bMara = await mkBooking({
      guestId: mara, roomName: "Tide Room", checkIn: day(-2), checkOut: day(5),
      status: "checked_in", source: "direct", adults: 1,
      note: "Solo traveler, first surf trip",
    });
    const bHugo = await mkBooking({
      guestId: hugo, roomName: "Ocean Suite", checkIn: day(1), checkOut: day(6),
      status: "confirmed", source: "direct", adults: 2,
    });
    const bCiara = await mkBooking({
      guestId: ciara, roomName: "Seaside Trio", checkIn: day(3), checkOut: day(8),
      status: "confirmed", source: "airbnb", channelBookingId: "ABB-HM8T2WQK4N",
      adults: 3, note: "Group of friends",
    });
    const bLennart = await mkBooking({
      guestId: lennart, roomName: "Sunset Double", checkIn: day(-1), checkOut: day(4),
      status: "checked_in", source: "booking_com", channelBookingId: "BDC-8837120465",
      adults: 2,
    });
    const bSalma = await mkBooking({
      guestId: salma, roomName: "Coastal Room", checkIn: day(-6), checkOut: day(-1),
      status: "checked_out", source: "walk_in", adults: 1,
    });
    await mkBooking({
      guestId: tomas, roomName: "Golden Room", checkIn: day(5), checkOut: day(9),
      status: "inquiry", source: "direct", adults: 2,
      note: "Self-service request",
    });
    const bFamily = await mkBooking({
      guestId: family, roomName: "The Salty Flat", checkIn: day(7), checkOut: day(14),
      status: "confirmed", source: "direct", adults: 2, children: 2,
    });

    // ── Payments (like the Nomaya experience: deposits, cash, OTA payouts) ──
    await pay(bMara, 100, "bank_transfer", day(-12), "Deposit");
    await pay(bMara, 145, "cash", day(-2), "Balance at check-in");
    await pay(bHugo, 90, "bank_transfer", day(-8), "Deposit");
    await pay(bLennart, 175, "ota_payout", day(-1), "Booking.com payout");
    await pay(bSalma, 175, "cash", day(-6));
    await pay(bFamily, 250, "bank_transfer", day(-3), "Deposit");

    // ── Activities for the coming days ──
    const beginner = activityByName("Beginner Surf Lesson");
    const guiding = activityByName("Surf Guiding");
    const yoga = activityByName("Sunset Yoga");
    const addAct = (bookingId: Id<"bookings">, activityId: Id<"activities"> | undefined, date: string, participants = 1) =>
      activityId
        ? ctx.db.insert("bookingActivities", { bookingId, activityId, date, participants })
        : Promise.resolve(null);

    for (let i = 0; i < 4; i++) await addAct(bMara, beginner?._id, day(i));
    await addAct(bMara, yoga?._id, day(1));
    await addAct(bLennart, guiding?._id, day(0), 2);
    await addAct(bLennart, guiding?._id, day(1), 2);
    await addAct(bHugo, beginner?._id, day(2), 2);
    await addAct(bCiara, beginner?._id, day(4), 3);
    await addAct(bCiara, yoga?._id, day(4), 3);

    // ── A pending guest request + channel request for the inbox ──
    if (yoga) {
      await ctx.db.insert("guestRequests", {
        bookingId: bMara,
        type: "order",
        payload: { activityId: yoga._id, qty: 1, date: day(2), note: "Rooftop session if possible" },
        status: "pending",
      });
    }
    const bookingCom = channels.find((c) => c.type === "booking_com");
    if (bookingCom) {
      await ctx.db.insert("channelRequests", {
        channelId: bookingCom._id,
        type: "new_booking",
        status: "pending",
        payload: {
          ota_reservation_code: "BDC-5561283970",
          guest_name: "Elsa Nyberg",
          guest_email: "elsa.nyberg@telia.se",
          guest_country: "Sweden",
          arrival_date: day(9),
          departure_date: day(13),
          room_type: "Double Room · Shared Bathroom",
          occupancy: 2,
          total_price: 140,
          currency: "EUR",
        },
      });
    }

    // ── Expenses so analytics isn't empty ──
    await ctx.db.insert("expenses", {
      category: "food", amount: 215.4, currency: "EUR", date: day(-3),
      description: "Souk run — produce, fish, spices",
    });
    await ctx.db.insert("expenses", {
      category: "equipment", amount: 150, currency: "EUR", date: day(-7),
      description: "Wetsuit repairs + new leashes",
    });
    await ctx.db.insert("expenses", {
      category: "utilities", amount: 96.5, currency: "EUR", date: day(-10),
      description: "Electricity + water",
    });

    await ctx.db.insert("auditLogs", {
      actorName: "System",
      action: "seed.demoBookings",
      entity: "bookings",
      summary: "Seeded demo bookings, payments and activities on the real rooms",
    });
    return "Seeded 7 demo bookings with payments, activities, requests and expenses.";
  },
});

/** One-off: reset sandbox channel cards wrongly marked "connected" back to mock. */
export const resetSandboxChannelStatus = internalMutation({
  args: {},
  handler: async (ctx) => {
    const isSandbox = (process.env.CHANNEX_BASE_URL ?? "").includes("staging");
    if (!isSandbox) return "Not on sandbox — no change.";
    const channels = await ctx.db.query("channels").collect();
    let fixed = 0;
    for (const channel of channels) {
      if (channel.status === "connected") {
        await ctx.db.patch(channel._id, { status: "mock" });
        fixed++;
      }
    }
    return `Reset ${fixed} channel(s) to sandbox status.`;
  },
});

// One-off: flag Breakfast as included-by-default for calendar recalculations.
export const markBreakfastDefault = internalMutation({
  args: {},
  handler: async (ctx) => {
    const services = await ctx.db.query("services").collect();
    const hits = services.filter((s) => s.name.toLowerCase().includes("breakfast"));
    for (const s of hits) await ctx.db.patch(s._id, { includedByDefault: true });
    return `Flagged ${hits.length} service(s): ${hits.map((s) => s.name).join(", ") || "none"}`;
  },
});
