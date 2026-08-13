import { internalMutation } from "./_generated/server";
import { generatePortalToken, generateReservationCode } from "./lib/access";
import type { Id } from "./_generated/dataModel";

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
        const payments = await ctx.db
          .query("payments")
          .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
          .collect();
        for (const pay of payments) await ctx.db.delete(pay._id);
        await ctx.db.delete(b._id);
        n++;
      }
      await ctx.db.delete(g._id);
    }
    return `Removed ${n} test bookings.`;
  },
});

// Real Moana formules (per person per week, by room type) — replaces the
// canvas placeholder packages. Idempotent: deactivates everything first.
export const setFormules = internalMutation({
  args: {},
  handler: async (ctx) => {
    const roomTypes = await ctx.db.query("roomTypes").collect();
    const idOf = (name: string) => {
      const t = roomTypes.find((rt) => rt.name === name);
      if (!t) throw new Error(`Room type not found: ${name}`);
      return t._id;
    };
    const PRIVATE = ["Double Room", "Double Sea View · Private Bathroom"];
    const SHARED = ["Double or Twin · Shared Bathroom", "Double or Twin Sea View · Shared Bathroom"];
    const rates = (suite: number, double: number, triple: number, quad: number) => [
      ...PRIVATE.map((n) => ({ roomTypeId: idOf(n), price: suite })),
      ...SHARED.map((n) => ({ roomTypeId: idOf(n), price: double })),
      { roomTypeId: idOf("Triple Room"), price: triple },
      { roomTypeId: idOf("Quadruple Room"), price: quad },
    ];

    for (const pkg of await ctx.db.query("packages").collect()) {
      await ctx.db.patch(pkg._id, { active: false });
    }

    const formules = [
      {
        name: "Surfeur débutant / intermédiaire",
        description:
          "À tous les surfeurs et surfeuses en devenir, pour bien commencer ou continuer sur de bonnes bases. Votre moniteur de surf est là pour vous apprendre ce sport en prenant un maximum de plaisir.",
        price: 450,
        roomTypePrices: rates(630, 540, 480, 450),
        minGuests: undefined as number | undefined,
      },
      {
        name: "Surf & Yoga",
        description:
          "Le surf et le yoga sont deux disciplines complémentaires du corps et de l'esprit. Les séances de yoga vous préparent à vos sessions de surf, et vous font gagner en force, souplesse et équilibre.",
        price: 540,
        roomTypePrices: rates(720, 630, 570, 540),
        minGuests: undefined as number | undefined,
      },
      {
        name: "Surf Guiding",
        description:
          "Recommandé pour les surfeurs de niveau confirmé qui souhaitent découvrir les meilleures vagues de la région. Cette formule se déroule au rythme de la houle, pour être au bon endroit au bon moment.",
        price: 480,
        roomTypePrices: rates(660, 570, 510, 480),
        minGuests: 3 as number | undefined,
      },
      {
        name: "Famille de Surfeurs",
        description:
          "Nous pensons aussi aux familles : nous organisons le séjour pour que vous n'ayez plus rien à penser et que tout le monde profite au maximum des vacances surf. Adulte 650 € / semaine — pour les enfants, contactez-nous.",
        price: 650,
        roomTypePrices: [{ roomTypeId: idOf("Quadruple Room"), price: 650 }],
        minGuests: undefined as number | undefined,
      },
    ];
    for (const f of formules) {
      await ctx.db.insert("packages", {
        name: f.name,
        description: f.description,
        price: f.price,
        nights: 7,
        includedItems: [],
        active: true,
        roomTypePrices: f.roomTypePrices,
        minGuests: f.minGuests,
      });
    }
    return `Seeded ${formules.length} formules.`;
  },
});

// Attach experience photos to formules, activities and extras; add the two
// missing excursions (camel + buggy/quad — prices are estimates to confirm).
export const setExperienceImages = internalMutation({
  args: {},
  handler: async (ctx) => {
    const IMG = {
      surf: "/experiences/surf.jpg",
      yoga: "/experiences/yoga.jpg",
      hammam: "/experiences/hammam.jpg",
      cuisine: "/experiences/cuisine.jpg",
      chameau: "/experiences/chameau.jpg",
      quad: "/experiences/quad.jpg",
    };
    const packages = await ctx.db.query("packages").collect();
    const pkgImage: Record<string, string> = {
      "Surfeur débutant / intermédiaire": IMG.surf,
      "Surf Guiding": IMG.surf,
      "Famille de Surfeurs": IMG.surf,
      "Surf & Yoga": IMG.yoga,
    };
    for (const pkg of packages) {
      const img = pkgImage[pkg.name];
      if (img) await ctx.db.patch(pkg._id, { imageUrl: img });
    }

    const activities = await ctx.db.query("activities").collect();
    const actImage: Record<string, string> = {
      "Surf Lesson": IMG.surf,
      "Surf Guiding": IMG.surf,
      Yoga: IMG.yoga,
      "Cooking Class": IMG.cuisine,
    };
    for (const a of activities) {
      const img = actImage[a.name];
      if (img) await ctx.db.patch(a._id, { imageUrl: img });
    }

    const services = await ctx.db.query("services").collect();
    for (const svc of services) {
      if (svc.name === "Massage / Hammam") {
        await ctx.db.patch(svc._id, { imageUrl: IMG.hammam });
      }
    }
    const upserts = [
      { name: "Cours de cuisine", price: 30, imageUrl: IMG.cuisine },
      { name: "Balade en chameau", price: 25, imageUrl: IMG.chameau },
      { name: "Balade en Buggy / Quad", price: 45, imageUrl: IMG.quad },
    ];
    for (const u of upserts) {
      const existing = services.find((s) => s.name === u.name);
      if (existing) {
        await ctx.db.patch(existing._id, { imageUrl: u.imageUrl });
      } else {
        await ctx.db.insert("services", {
          name: u.name,
          price: u.price,
          unit: "per_unit",
          active: true,
          imageUrl: u.imageUrl,
        });
      }
    }
    return "Experience images set.";
  },
});

// Real activity/extra prices from the owner (2026-08-13).
export const setExperiencePrices = internalMutation({
  args: {},
  handler: async (ctx) => {
    const activities = await ctx.db.query("activities").collect();
    const actPrice: Record<string, number> = {
      "Surf Lesson": 40, // per day
      Yoga: 10,
      "Cooking Class": 15,
    };
    for (const a of activities) {
      const price = actPrice[a.name];
      if (price !== undefined) await ctx.db.patch(a._id, { price });
    }

    const services = await ctx.db.query("services").collect();
    // Split the combined service: Hammam €30, Massage €35.
    const combined = services.find((s) => s.name === "Massage / Hammam");
    if (combined) {
      await ctx.db.patch(combined._id, { name: "Hammam", price: 30 });
    } else {
      const hammam = services.find((s) => s.name === "Hammam");
      if (hammam) await ctx.db.patch(hammam._id, { price: 30 });
    }
    if (!services.some((s) => s.name === "Massage")) {
      await ctx.db.insert("services", {
        name: "Massage",
        price: 35,
        unit: "per_unit",
        active: true,
        imageUrl: "/experiences/hammam.jpg",
      });
    }
    const cuisine = services.find((s) => s.name === "Cours de cuisine");
    if (cuisine) await ctx.db.patch(cuisine._id, { price: 15 });
    return "Prices updated.";
  },
});

// Demo bookings/payments/requests so the platform looks alive for the
// client walkthrough. Remove with demoCleanup.
const DEMO_GUESTS = [
  { fullName: "Léa Fontaine", email: "lea.fontaine@orange.fr", phone: "+33 6 48 12 97 35", country: "France", surfLevel: "beginner" as const },
  { fullName: "Mathis Leroy", email: "mathis.leroy@gmail.com", phone: "+33 7 81 45 02 66", country: "France", surfLevel: "intermediate" as const },
  { fullName: "Anouk Verhoeven", email: "anouk.verhoeven@gmail.com", phone: "+31 6 2483 9174", country: "Netherlands", surfLevel: "beginner" as const },
  { fullName: "Jonas Weber", email: "jonas.weber@web.de", phone: "+49 176 4520 8813", country: "Germany", surfLevel: "advanced" as const },
  { fullName: "Camille Roussel", email: "camille.roussel@hotmail.fr", phone: "+33 6 92 30 41 87", country: "France", surfLevel: "intermediate" as const },
  { fullName: "Yasmine El Idrissi", email: "yasmine.elidrissi@gmail.com", phone: "+212 6 61 48 29 07", country: "Morocco", surfLevel: "beginner" as const },
  { fullName: "Tomás Herrera", email: "tomas.herrera.v@gmail.com", phone: "+34 655 21 90 48", country: "Spain", surfLevel: "advanced" as const },
  { fullName: "Ingrid Solberg", email: "ingrid.solberg@icloud.com", phone: "+47 928 41 566", country: "Norway", surfLevel: "beginner" as const },
];

export const demoData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rooms = await ctx.db.query("rooms").collect();
    const packages = await ctx.db.query("packages").collect();
    const roomBy = (name: string) => {
      const r = rooms.find((x) => x.name === name);
      if (!r) throw new Error(`Room not found: ${name}`);
      return r._id;
    };
    const pkgBy = (name: string) =>
      packages.find((x) => x.name === name)?._id;

    const guestIds: Id<"guests">[] = [];
    for (const g of DEMO_GUESTS) {
      guestIds.push(await ctx.db.insert("guests", g));
    }

    // [guestIdx, room, checkIn, checkOut, status, source, adults, children, total, pkgName?, paid, method]
    const B = [
      [0, "Double or Twin", "2026-07-19", "2026-07-26", "checked_out", "direct", 2, 0, 1080, "Surfeur débutant / intermédiaire", 1080, "card"],
      [1, "Double Room", "2026-07-27", "2026-08-03", "checked_out", "booking_com", 2, 0, 1440, "Surf & Yoga", 1440, "ota_payout"],
      [2, "Double or Twin Sea View", "2026-08-09", "2026-08-16", "checked_in", "direct", 2, 0, 1080, "Surfeur débutant / intermédiaire", 500, "card"],
      [3, "Double Sea View", "2026-08-11", "2026-08-18", "checked_in", "airbnb", 1, 0, 660, "Surf Guiding", 660, "ota_payout"],
      [4, "Triple Room", "2026-08-18", "2026-08-25", "confirmed", "direct", 3, 0, 1710, "Surf & Yoga", 600, "bank_transfer"],
      [5, "Double Room", "2026-08-21", "2026-08-25", "confirmed", "direct", 2, 0, 360, null, 120, "card"],
      [6, "Quadruple Room", "2026-08-30", "2026-09-06", "confirmed", "booking_com", 4, 0, 1920, "Surf Guiding", 1920, "ota_payout"],
      [7, "Double or Twin", "2026-09-05", "2026-09-12", "inquiry", "direct", 2, 0, 1080, "Surfeur débutant / intermédiaire", 0, null],
    ] as const;

    let n = 0;
    for (const [gi, roomName, ci, co, status, source, adults, children, total, pkgName, paid, method] of B) {
      const bookingId = await ctx.db.insert("bookings", {
        guestId: guestIds[gi],
        roomId: roomBy(roomName),
        packageId: pkgName ? pkgBy(pkgName) : undefined,
        checkIn: ci,
        checkOut: co,
        status,
        source,
        adults,
        children,
        totalAmount: total,
        currency: "EUR",
        portalToken: generatePortalToken(),
        reservationCode: generateReservationCode(),
      });
      if (paid > 0 && method) {
        await ctx.db.insert("payments", {
          bookingId,
          amount: paid,
          currency: "EUR",
          method,
          direction: "in",
          date: ci < "2026-08-13" ? ci : "2026-08-1" + String(2 - (n % 2)),
          note: method === "ota_payout" ? "OTA payout" : undefined,
        });
      }
      if (status === "checked_in" || status === "confirmed") {
        const acts = await ctx.db.query("activities").collect();
        const surf = acts.find((a) => a.name === "Surf Lesson");
        if (surf && pkgName && pkgName !== "Surf Guiding") {
          await ctx.db.insert("bookingActivities", {
            bookingId,
            activityId: surf._id,
            date: ci,
            participants: adults + children,
          });
        }
      }
      n++;
    }

    // A couple of pending guest requests for the Requests page
    const inHouse = await ctx.db
      .query("bookings")
      .withIndex("by_guest", (q) => q.eq("guestId", guestIds[2]))
      .first();
    if (inHouse) {
      await ctx.db.insert("guestRequests", {
        bookingId: inHouse._id,
        type: "requirement",
        payload: { note: "Late checkout possible on Sunday? Our flight leaves at 21:40." },
        status: "pending",
      });
    }
    const guiding = await ctx.db
      .query("bookings")
      .withIndex("by_guest", (q) => q.eq("guestId", guestIds[3]))
      .first();
    if (guiding) {
      await ctx.db.insert("guestRequests", {
        bookingId: guiding._id,
        type: "order",
        payload: { note: "One massage after Thursday's session please.", qty: 1 },
        status: "pending",
      });
    }
    return `Demo: ${B.length} bookings for ${DEMO_GUESTS.length} guests.`;
  },
});

export const demoCleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const emails = new Set(DEMO_GUESTS.map((g) => g.email));
    const guests = await ctx.db.query("guests").collect();
    let n = 0;
    for (const g of guests) {
      if (!g.email || !emails.has(g.email)) continue;
      const bookings = await ctx.db
        .query("bookings")
        .withIndex("by_guest", (q) => q.eq("guestId", g._id))
        .collect();
      for (const b of bookings) {
        for (const t of ["payments", "bookingActivities", "bookingServices", "guestRequests"] as const) {
          const rows = await ctx.db
            .query(t)
            .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
            .collect();
          for (const row of rows) await ctx.db.delete(row._id);
        }
        await ctx.db.delete(b._id);
        n++;
      }
      await ctx.db.delete(g._id);
    }
    return `Removed ${n} demo bookings.`;
  },
});
