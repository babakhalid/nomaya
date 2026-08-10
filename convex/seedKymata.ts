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
