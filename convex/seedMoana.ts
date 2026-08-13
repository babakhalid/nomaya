import { internalMutation } from "./_generated/server";

/**
 * Moana Surf Experience — built from their onboarding canvas (tab 1) and the
 * six room photos they shared. Nightly prices are PLACEHOLDERS (not provided
 * in the canvas) — adjust in Settings. No demo bookings: this is a real
 * client instance starting clean. Run: npx convex run seedMoana:run [--prod]
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("rooms").first();
    if (existing) return "Already seeded — skipping.";

    // ── Rooms (from the shared photos; one type per room) ──
    const mkType = (name: string, capacity: number, basePrice: number, amenities: string[]) =>
      ctx.db.insert("roomTypes", { name, mode: "private", capacity, basePrice, amenities });

    const defs: {
      type: string; capacity: number; price: number; amenities: string[];
      room: string; image: string; description: string;
    }[] = [
      { type: "Double or Twin · Shared Bathroom", capacity: 2, price: 35,
        amenities: ["Shared bathroom"], room: "Double or Twin", image: "/rooms/twin-shared.jpg",
        description: "Bright twin room with two singles, saffron-yellow Moroccan blankets and handwoven wall décor. Shared bathroom." },
      { type: "Double or Twin Sea View · Shared Bathroom", capacity: 2, price: 42,
        amenities: ["Sea view", "Shared bathroom"], room: "Double or Twin Sea View", image: "/rooms/twin-seaview.jpg",
        description: "Double or twin with sea view and a colorful striped Berber blanket. Shared bathroom." },
      { type: "Double Room", capacity: 2, price: 38,
        amenities: [], room: "Double Room", image: "/rooms/double.jpg",
        description: "Cozy double opening onto the terrace, warm saffron textiles and woven pendant light." },
      { type: "Double Sea View · Private Bathroom", capacity: 2, price: 50,
        amenities: ["Sea view", "Private bathroom"], room: "Double Sea View", image: "/rooms/double-seaview-private.jpg",
        description: "Double room with sea view, artisan raffia lamp under a carved plaster ceiling, and private bathroom." },
      { type: "Triple Room", capacity: 3, price: 55,
        amenities: [], room: "Triple Room", image: "/rooms/triple.jpg",
        description: "Airy triple with three single beds, straw-hat décor and plenty of light." },
      { type: "Quadruple Room", capacity: 4, price: 70,
        amenities: [], room: "Quadruple Room", image: "/rooms/quadruple.jpg",
        description: "Spacious room for four with woven pendant light — ideal for a group of friends." },
    ];
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      const typeId = await mkType(d.type, d.capacity, d.price, d.amenities);
      await ctx.db.insert("rooms", {
        roomTypeId: typeId, name: d.room, status: "available",
        description: d.description, imageUrl: d.image, sortOrder: i,
      });
    }

    // ── Activities (canvas tab 5) ──
    const surf = await ctx.db.insert("activities", {
      name: "Surf Lesson", type: "surf_lesson", capacityPerSession: 8,
      price: 45, durationMin: 120, color: "#2f948f", active: true, startTime: "10:00",
    });
    await ctx.db.insert("activities", {
      name: "Surf Guiding", type: "surf_guiding", capacityPerSession: 6,
      price: 40, durationMin: 240, color: "#1f6360", active: true, startTime: "10:00",
    });
    await ctx.db.insert("activities", {
      name: "Yoga", type: "yoga", capacityPerSession: 12,
      price: 12, durationMin: 75, color: "#f9c74f", active: true, startTime: "19:00",
    });
    await ctx.db.insert("activities", {
      name: "Paradise Valley", type: "excursion", capacityPerSession: 10,
      price: 35, durationMin: 360, color: "#c05b4d", active: true, startTime: "09:30",
    });
    await ctx.db.insert("activities", {
      name: "Cooking Class", type: "other", capacityPerSession: 8,
      price: 25, durationMin: 180, color: "#87755a", active: true, startTime: "16:00",
    });

    // ── Services (canvas tab 6) ──
    const breakfast = await ctx.db.insert("services", {
      name: "Breakfast", price: 6, unit: "per_day", active: true, startTime: "09:00",
    });
    const dinner = await ctx.db.insert("services", {
      name: "Dinner", price: 12, unit: "per_day", active: true, startTime: "20:00",
    });
    const transfer = await ctx.db.insert("services", {
      name: "Airport Transfer (Agadir)", price: 35, unit: "per_unit", active: true,
    });
    await ctx.db.insert("services", {
      name: "Board + Wetsuit Rental", price: 15, unit: "per_day", active: true,
    });
    await ctx.db.insert("services", {
      name: "Massage / Hammam", price: 55, unit: "per_unit", active: true,
    });

    // ── Packages (canvas tab 7) ──
    const includes = [
      { kind: "activity" as const, refId: surf, qty: 4 },
      { kind: "service" as const, refId: breakfast, qty: 7 },
      { kind: "service" as const, refId: dinner, qty: 5 },
      { kind: "service" as const, refId: transfer, qty: 1 },
    ];
    await ctx.db.insert("packages", {
      name: "Surf Camp · Shared Room",
      description: "One all-inclusive week of waves, sun and authentic Moroccan living. 7 nights, 4 surf lessons, daily breakfast, 5 dinners, airport transfer.",
      price: 525, nights: 7, includedItems: includes, active: true,
    });
    await ctx.db.insert("packages", {
      name: "Surf Camp · Private Room",
      description: "The same all-inclusive week, with a private double room for more privacy.",
      price: 665, nights: 7, includedItems: includes, active: true,
    });

    // ── Channels (canvas tab 8) ──
    await ctx.db.insert("channels", {
      name: "Booking.com", type: "booking_com", status: "mock", lastSyncAt: Date.now(),
    });
    await ctx.db.insert("channels", {
      name: "Airbnb", type: "airbnb", status: "mock", lastSyncAt: Date.now(),
    });

    await ctx.db.insert("auditLogs", {
      actorName: "System", action: "seed.moana", entity: "system",
      summary: "Configured Moana Surf Experience from the onboarding canvas + room photos",
    });
    return "Moana seeded: 6 rooms (15 guests), catalog + 2 packages, clean calendar.";
  },
});

/** Apply the real nightly rates from the canvas room-type sheet. */
export const updatePricing = internalMutation({
  args: {},
  handler: async (ctx) => {
    const prices: Record<string, number> = {
      "Double or Twin · Shared Bathroom": 35,
      "Double or Twin Sea View · Shared Bathroom": 35,
      "Double Room": 35,
      "Double Sea View · Private Bathroom": 45,
      "Triple Room": 55, // estimate — no triple row in the canvas; confirm with client
      "Quadruple Room": 90, // canvas "Entire Apartment (4p)" rate
    };
    const types = await ctx.db.query("roomTypes").collect();
    const changed: string[] = [];
    for (const type of types) {
      const price = prices[type.name];
      if (price !== undefined && type.basePrice !== price) {
        await ctx.db.patch(type._id, { basePrice: price });
        changed.push(`${type.name} → €${price}`);
      }
    }
    if (changed.length) {
      await ctx.db.insert("auditLogs", {
        actorName: "System", action: "roomType.update", entity: "roomTypes",
        summary: `Applied canvas pricing: ${changed.join(", ")}`,
      });
    }
    return changed.length ? changed.join("; ") : "Prices already correct.";
  },
});

/** Remove CLI test bookings (guest "Group Test"). */
export const cleanupTest = internalMutation({
  args: {},
  handler: async (ctx) => {
    const guests = await ctx.db.query("guests").collect();
    const test = guests.filter((g) => g.fullName === "Group Test");
    let n = 0;
    for (const g of test) {
      const bookings = await ctx.db
        .query("bookings")
        .withIndex("by_guest", (q) => q.eq("guestId", g._id))
        .collect();
      for (const b of bookings) {
        await ctx.db.delete(b._id);
        n++;
      }
      await ctx.db.delete(g._id);
    }
    return `Removed ${n} test bookings.`;
  },
});
