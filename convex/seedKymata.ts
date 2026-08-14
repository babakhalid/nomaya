import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { generatePortalToken, generateReservationCode } from "./lib/access";

/**
 * Kymata Surf Morocco — real catalog + demo bookings for the client demo.
 * Idempotent. Run with: npx convex run seedKymata:run (add --prod)
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

    // ── Room types (their real categories, ~21 guests total) ──
    const doubleSea = await ctx.db.insert("roomTypes", {
      name: "Double · Balcony Sea View", mode: "private", capacity: 2,
      basePrice: 55, amenities: ["Sea view", "Private balcony"],
    });
    const tripleSea = await ctx.db.insert("roomTypes", {
      name: "Deluxe Triple · Sea View", mode: "private", capacity: 3,
      basePrice: 70, amenities: ["Sea view", "Three single beds"],
    });
    const twin = await ctx.db.insert("roomTypes", {
      name: "Double / Twin", mode: "private", capacity: 2,
      basePrice: 45, amenities: ["Standard room"],
    });
    const family = await ctx.db.insert("roomTypes", {
      name: "Family Room (Quadruple)", mode: "private", capacity: 4,
      basePrice: 85, amenities: ["Sea view", "Sleeps 4"],
    });

    // rooms named after the iconic spots
    const mk = (name: string, typeId: Id<"roomTypes">, order: number, description: string) =>
      ctx.db.insert("rooms", {
        roomTypeId: typeId, name, status: "available", sortOrder: order, description,
      });
    const anchorPoint = await mk("Anchor Point", doubleSea, 0, "Double with a private balcony and the Atlantic straight ahead.");
    await mk("Panoramas", doubleSea, 1, "Sea-view double — wake up to the ocean.");
    await mk("Hash Point", doubleSea, 2, "Cozy double with a balcony over the coast.");
    const killers = await mk("Killers", tripleSea, 3, "Deluxe triple with sea view — perfect for three friends.");
    await mk("Boilers", tripleSea, 4, "Bright triple, three singles, ocean light.");
    await mk("La Source", twin, 5, "Standard double or twin — simple and comfortable.");
    await mk("Devil's Rock", twin, 6, "Twin room, two singles, easy beach access.");
    const banana = await mk("Banana Beach", family, 7, "Family room for four with sea view.");

    // ── Activities ──
    const surf = await ctx.db.insert("activities", {
      name: "Surf Session", type: "surf_lesson", capacityPerSession: 10,
      price: 40, durationMin: 150, color: "#3a80bd", active: true, startTime: "10:00",
    });
    const yoga = await ctx.db.insert("activities", {
      name: "Sunset Yoga", type: "yoga", capacityPerSession: 12,
      price: 15, durationMin: 75, color: "#f9c74f", active: true, startTime: "18:30",
    });
    await ctx.db.insert("activities", {
      name: "Surf Guiding (Anchor Point)", type: "surf_guiding", capacityPerSession: 6,
      price: 35, durationMin: 240, color: "#24558b", active: true, startTime: "09:00",
    });
    const bonfire = await ctx.db.insert("activities", {
      name: "Bonfire on the Beach", type: "other", capacityPerSession: 21,
      price: 0, durationMin: 120, color: "#c05b4d", active: true, startTime: "20:30",
    });
    await ctx.db.insert("activities", {
      name: "Paradise Valley Trip", type: "excursion", capacityPerSession: 10,
      price: 35, durationMin: 360, color: "#87755a", active: true, startTime: "09:30",
    });

    // ── Services ──
    const meals = await ctx.db.insert("services", {
      name: "All Meals (all diets)", price: 20, unit: "per_day", active: true, startTime: "09:00",
    });
    await ctx.db.insert("services", {
      name: "Breakfast", price: 7, unit: "per_day", active: true, startTime: "09:00",
    });
    const transfer = await ctx.db.insert("services", {
      name: "Airport Transfer (Agadir)", price: 35, unit: "per_unit", active: true,
    });
    const rental = await ctx.db.insert("services", {
      name: "Board & Wetsuit Rental", price: 15, unit: "per_day", active: true,
    });

    const videoAnalysis = await ctx.db.insert("activities", {
      name: "Surf Video Analysis", type: "other", capacityPerSession: 10,
      price: 0, durationMin: 60, color: "#8b8462", active: true, startTime: "17:00",
    });

    // ── Packages (real offers, priced per person / week) ──
    const surfIncludes = [
      { kind: "activity" as const, refId: surf, qty: 6 },
      { kind: "activity" as const, refId: videoAnalysis, qty: 1 },
      { kind: "service" as const, refId: meals, qty: 7 },
      { kind: "service" as const, refId: rental, qty: 7 },
      { kind: "service" as const, refId: transfer, qty: 2 },
    ];
    const yogaIncludes = [
      { kind: "activity" as const, refId: surf, qty: 6 },
      { kind: "activity" as const, refId: yoga, qty: 6 },
      { kind: "service" as const, refId: meals, qty: 7 },
      { kind: "service" as const, refId: rental, qty: 7 },
      { kind: "service" as const, refId: transfer, qty: 2 },
    ];
    await ctx.db.insert("packages", {
      name: "Surf Lessons · Shared Triple",
      description: "The Authentic Surf Camp Experience — 7 nights, 6 days of surf, board & wetsuit, all meals (all diets), transport to spots, 1× video analysis, 24/7 airport transfers. Per person.",
      price: 490, nights: 7, includedItems: surfIncludes, active: true,
    });
    await ctx.db.insert("packages", {
      name: "Surf Lessons · Double or Twin",
      description: "The Authentic Surf Camp Experience — 7 nights, 6 days of surf, board & wetsuit, all meals (all diets), transport to spots, 1× video analysis, 24/7 airport transfers. Per person.",
      price: 550, nights: 7, includedItems: surfIncludes, active: true,
    });
    await ctx.db.insert("packages", {
      name: "Surf x Yoga · Shared Triple",
      description: "Balance, Breathe & Ride — 6 surf sessions + 6 yoga classes, all meals (all diets), board & wetsuit, transport to spots, 24/7 airport transfers. Per person.",
      price: 525, nights: 7, includedItems: yogaIncludes, active: true,
    });
    await ctx.db.insert("packages", {
      name: "Surf x Yoga · Double or Twin",
      description: "Balance, Breathe & Ride — 6 surf sessions + 6 yoga classes, all meals (all diets), board & wetsuit, transport to spots, 24/7 airport transfers. Per person.",
      price: 595, nights: 7, includedItems: yogaIncludes, active: true,
    });

    // ── Demo guests & bookings (dashboard alive for the meeting) ──
    const marie = await ctx.db.insert("guests", {
      fullName: "Marie Lefebvre", email: "marie.lefebvre@gmail.com",
      phone: "+33 6 52 44 18 90", country: "France", surfLevel: "beginner",
    });
    const tom = await ctx.db.insert("guests", {
      fullName: "Tom Krüger", email: "tom.krueger@gmx.de",
      phone: "+49 171 555 2381", country: "Germany", surfLevel: "intermediate",
      allergies: "Vegetarian",
    });
    const laila = await ctx.db.insert("guests", {
      fullName: "Laila Mansouri", email: "laila.mansouri@gmail.com",
      phone: "+212 6 11 81 27 57", country: "Morocco", surfLevel: "beginner",
    });

    const mkBooking = (guestId: Id<"guests">, roomId: Id<"rooms">, checkIn: string, checkOut: string,
      status: "confirmed" | "checked_in", source: "direct" | "booking_com", total: number) =>
      ctx.db.insert("bookings", {
        guestId, roomId, checkIn, checkOut, status, source,
        adults: 2, children: 0, totalAmount: total, currency: "EUR",
        notes: "[Demo]", portalToken: generatePortalToken(),
        reservationCode: generateReservationCode(),
      });

    const bMarie = await mkBooking(marie, anchorPoint, day(-2), day(5), "checked_in", "direct", 490);
    const bTom = await mkBooking(tom, killers, day(1), day(8), "confirmed", "booking_com", 595);
    const bLaila = await mkBooking(laila, banana, day(3), day(10), "confirmed", "direct", 595);

    const addAct = (bookingId: Id<"bookings">, activityId: Id<"activities">, date: string, participants = 2) =>
      ctx.db.insert("bookingActivities", { bookingId, activityId, date, participants });
    for (let i = 0; i < 4; i++) await addAct(bMarie, surf, day(i));
    await addAct(bMarie, yoga, day(0));
    await addAct(bMarie, bonfire, day(1));
    await addAct(bTom, surf, day(2), 2);
    await addAct(bLaila, yoga, day(4), 2);

    await ctx.db.insert("payments", {
      bookingId: bMarie, amount: 150, currency: "EUR", method: "bank_transfer",
      direction: "in", date: day(-10), note: "Deposit",
    });
    await ctx.db.insert("payments", {
      bookingId: bMarie, amount: 340, currency: "EUR", method: "cash",
      direction: "in", date: day(-2), note: "Balance at check-in",
    });
    await ctx.db.insert("payments", {
      bookingId: bTom, amount: 200, currency: "EUR", method: "card",
      direction: "in", date: day(-5), note: "Deposit",
    });

    await ctx.db.insert("guestRequests", {
      bookingId: bLaila, type: "order",
      payload: { activityId: yoga, qty: 2, date: day(5), note: "Sunset session on the rooftop please" },
      status: "pending",
    });

    await ctx.db.insert("channels", {
      name: "Booking.com", type: "booking_com", status: "mock", lastSyncAt: Date.now(),
    });
    await ctx.db.insert("channels", {
      name: "Airbnb", type: "airbnb", status: "mock", lastSyncAt: Date.now(),
    });

    await ctx.db.insert("expenses", {
      category: "food", amount: 260, currency: "EUR", date: day(-3),
      description: "Souk run — week groceries",
    });

    await ctx.db.insert("auditLogs", {
      actorName: "System", action: "seed.kymata", entity: "system",
      summary: "Seeded Kymata Surf Morocco catalog and demo bookings",
    });
    return "Kymata seeded: 8 rooms (~21 guests), 4 per-person packages, demo bookings.";
  },
});

/**
 * Replace placeholder inventory with Kymata's 8 REAL rooms (21 guests exactly)
 * and rebuild the demo bookings on them. Idempotent (skips if AZURA exists).
 * Run with: npx convex run seedKymata:setRealRooms (add --prod)
 */
export const setRealRooms = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existingRooms = await ctx.db.query("rooms").collect();
    if (existingRooms.some((r) => r.name === "AZURA")) {
      return "Real rooms already set up — skipping.";
    }
    const today = new Date();
    const day = (offset: number) => isoAddDays(today, offset);

    // wipe inventory + booking data (catalog: activities/services/packages stay)
    for (const table of [
      "payments", "bookingActivities", "bookingServices", "guestRequests",
      "channelRequests", "bookings", "guests", "beds", "rooms", "roomTypes",
    ] as const) {
      for (const row of await ctx.db.query(table).collect()) await ctx.db.delete(row._id);
    }

    // ── Room types ──
    const double = await ctx.db.insert("roomTypes", {
      name: "Double · Private Bathroom", mode: "private", capacity: 2,
      basePrice: 55, amenities: ["Private bathroom"],
    });
    const doubleBalcony = await ctx.db.insert("roomTypes", {
      name: "Double · Balcony Sea View", mode: "private", capacity: 2,
      basePrice: 65, amenities: ["Private balcony", "Sea view", "Private bathroom"],
    });
    const twin = await ctx.db.insert("roomTypes", {
      name: "Twin · Private Bathroom", mode: "private", capacity: 2,
      basePrice: 50, amenities: ["Two single beds", "Private bathroom"],
    });
    const triple = await ctx.db.insert("roomTypes", {
      name: "Triple · Private Bathroom", mode: "private", capacity: 3,
      basePrice: 70, amenities: ["Private bathroom"],
    });
    const quad = await ctx.db.insert("roomTypes", {
      name: "Quadruple · Private Bathroom", mode: "private", capacity: 4,
      basePrice: 90, amenities: ["Private bathroom"],
    });

    // ── The 8 real rooms ──
    const rooms: { name: string; typeId: Id<"roomTypes">; image: string; description: string }[] = [
      { name: "AZURA", typeId: triple, image: "/rooms/azura.jpg",
        description: "A bright triple room with Moroccan arched windows, traditional tiled floors and private bathroom. Perfect for three friends or a small group. Beds: 1 double + 1 single." },
      { name: "CORALYS", typeId: triple, image: "/rooms/coralys.jpg",
        description: "Spacious triple room bathed in warm light, featuring authentic Moroccan décor, hand-woven rugs and a private en-suite bathroom. Beds: 3 singles." },
      { name: "LUVIA", typeId: quad, image: "/rooms/luvia.jpg",
        description: "Our largest room, ideal for groups of 4. Generous space, natural materials, Moroccan tile floors and a fully private bathroom. Beds: 4 singles." },
      { name: "MIRAE", typeId: twin, image: "/rooms/mirae.jpg",
        description: "A cozy twin room featuring two comfortable beds, warm tadelakt walls, traditional tilework and a private bathroom with shower." },
      { name: "NÉREA", typeId: twin, image: "/rooms/nerea.jpg",
        description: "Light-filled twin room with beautiful Moroccan arch window, natural wood hangers and private bathroom. Ideal for two travelers." },
      { name: "ORYA", typeId: triple, image: "/rooms/orya.jpg",
        description: "Warm and welcoming triple room with three beds, colorful Berber rugs, and natural light flowing through Moroccan-style windows. Beds: 3 singles." },
      { name: "SOLAN", typeId: double, image: "/rooms/solan.jpg",
        description: "An intimate double room with a king bed, stunning arched window with terracotta view, and private bathroom. Perfect for couples." },
      { name: "TIMOULAY", typeId: doubleBalcony, image: "/rooms/timoulay.jpg",
        description: "Our premium double room with a private balcony and stunning sea views. Large sliding glass door, private bathroom and authentic Moroccan touches." },
    ];
    const roomIds: Record<string, Id<"rooms">> = {};
    for (let i = 0; i < rooms.length; i++) {
      roomIds[rooms[i].name] = await ctx.db.insert("rooms", {
        roomTypeId: rooms[i].typeId, name: rooms[i].name, status: "available",
        description: rooms[i].description, imageUrl: rooms[i].image, sortOrder: i,
      });
    }

    // ── Rebuild demo bookings on the real rooms ──
    const activities = await ctx.db.query("activities").collect();
    const byName = (n: string) => activities.find((a) => a.name === n);
    const surf = byName("Surf Session");
    const yoga = byName("Sunset Yoga");
    const bonfire = byName("Bonfire on the Beach");

    const marie = await ctx.db.insert("guests", {
      fullName: "Marie Lefebvre", email: "marie.lefebvre@gmail.com",
      phone: "+33 6 52 44 18 90", country: "France", surfLevel: "beginner",
    });
    const tom = await ctx.db.insert("guests", {
      fullName: "Tom Krüger", email: "tom.krueger@gmx.de",
      phone: "+49 171 555 2381", country: "Germany", surfLevel: "intermediate",
      allergies: "Vegetarian",
    });
    const laila = await ctx.db.insert("guests", {
      fullName: "Laila Mansouri", email: "laila.mansouri@gmail.com",
      phone: "+212 6 11 81 27 57", country: "Morocco", surfLevel: "beginner",
    });

    const mkBooking = (guestId: Id<"guests">, roomName: string, checkIn: string, checkOut: string,
      status: "confirmed" | "checked_in", source: "direct" | "booking_com", adults: number, total: number) =>
      ctx.db.insert("bookings", {
        guestId, roomId: roomIds[roomName], checkIn, checkOut, status, source,
        adults, children: 0, totalAmount: total, currency: "EUR",
        notes: "[Demo]", portalToken: generatePortalToken(),
        reservationCode: generateReservationCode(),
      });

    const bMarie = await mkBooking(marie, "TIMOULAY", day(-2), day(5), "checked_in", "direct", 2, 1100);
    const bTom = await mkBooking(tom, "CORALYS", day(1), day(8), "confirmed", "booking_com", 3, 1470);
    const bLaila = await mkBooking(laila, "LUVIA", day(3), day(10), "confirmed", "direct", 2, 1190);

    const addAct = (bookingId: Id<"bookings">, activityId: Id<"activities"> | undefined, date: string, participants: number) =>
      activityId ? ctx.db.insert("bookingActivities", { bookingId, activityId, date, participants }) : Promise.resolve(null);
    for (let i = 0; i < 4; i++) await addAct(bMarie, surf?._id, day(i), 2);
    await addAct(bMarie, yoga?._id, day(0), 2);
    await addAct(bMarie, bonfire?._id, day(1), 2);
    await addAct(bTom, surf?._id, day(2), 3);
    await addAct(bLaila, yoga?._id, day(4), 2);

    await ctx.db.insert("payments", {
      bookingId: bMarie, amount: 300, currency: "EUR", method: "bank_transfer",
      direction: "in", date: day(-10), note: "Deposit",
    });
    await ctx.db.insert("payments", {
      bookingId: bMarie, amount: 800, currency: "EUR", method: "cash",
      direction: "in", date: day(-2), note: "Balance at check-in",
    });
    await ctx.db.insert("payments", {
      bookingId: bTom, amount: 450, currency: "EUR", method: "card",
      direction: "in", date: day(-5), note: "Deposit",
    });
    if (yoga) {
      await ctx.db.insert("guestRequests", {
        bookingId: bLaila, type: "order",
        payload: { activityId: yoga._id, qty: 2, date: day(5), note: "Sunset session on the rooftop please" },
        status: "pending",
      });
    }
    await ctx.db.insert("channels", {
      name: "Booking.com", type: "booking_com", status: "mock", lastSyncAt: Date.now(),
    });
    await ctx.db.insert("channels", {
      name: "Airbnb", type: "airbnb", status: "mock", lastSyncAt: Date.now(),
    });

    await ctx.db.insert("auditLogs", {
      actorName: "System", action: "seed.kymataRealRooms", entity: "rooms",
      summary: "Replaced placeholder inventory with the 8 real Kymata rooms (21 guests)",
    });
    return "8 real rooms created (AZURA…TIMOULAY, 21 guests) with rebuilt demo bookings.";
  },
});

// Convert the 4 tier-named per-person packages into 2 formules with
// per-room-type weekly rates (the new pricing model). Idempotent.
export const toFormules = internalMutation({
  args: {},
  handler: async (ctx) => {
    const packages = await ctx.db.query("packages").collect();
    if (packages.some((p) => p.active && p.roomTypePrices)) {
      return "Formules already in place — skipping.";
    }
    const roomTypes = await ctx.db.query("roomTypes").collect();
    const sharedTier = roomTypes.filter((t) => /Triple|Quadruple/i.test(t.name));
    const doubleTier = roomTypes.filter((t) => /Double|Twin/i.test(t.name));

    const defs = [
      { name: "Surf Lessons", source: "Surf Lessons · Shared Triple", shared: 490, dbl: 550 },
      { name: "Surf x Yoga", source: "Surf x Yoga · Shared Triple", shared: 525, dbl: 595 },
    ];
    for (const def of defs) {
      const src = packages.find((p) => p.name === def.source);
      await ctx.db.insert("packages", {
        name: def.name,
        description: src?.description,
        price: def.shared,
        nights: 7,
        includedItems: src?.includedItems ?? [],
        active: true,
        minGuests: undefined,
        roomTypePrices: [
          ...sharedTier.map((t) => ({ roomTypeId: t._id, price: def.shared })),
          ...doubleTier.map((t) => ({ roomTypeId: t._id, price: def.dbl })),
        ],
      });
    }
    for (const p of packages) {
      if (p.active) await ctx.db.patch(p._id, { active: false });
    }
    return `Created 2 formules (${sharedTier.length} shared-tier + ${doubleTier.length} double-tier room types); deactivated ${packages.length} old packages.`;
  },
});
