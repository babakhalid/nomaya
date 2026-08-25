import { internalMutation } from "./_generated/server";

/**
 * Seed Surf School Rabat — an Experience Management System. Sessions are
 * modelled as per-spot units (the app's "dorm" room = a session with N
 * bookable spots). Guests book a spot in a session.
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("rooms").first();
    if (existing) return "Already seeded — skipping.";

    // Session slots — each is a bookable session with a fixed time and N spots.
    const SESSIONS: [string, number, number, string][] = [
      // name, spots, price/spot (MAD→EUR placeholder), description
      ["Beginner · 09:00", 8, 25, "Beginner group lesson on the beach break. Board & wetsuit included."],
      ["Beginner · 11:00", 8, 25, "Mid-morning beginner group lesson. Board & wetsuit included."],
      ["Intermediate · 14:00", 6, 30, "Green-wave coaching for improvers. Video feedback on request."],
      ["Advanced Guiding · 16:00", 4, 40, "Guided session to the best peak of the day, small group."],
      ["Sunset Session · 18:00", 6, 30, "Golden-hour surf, all levels welcome with a coach in the water."],
      ["Private Lesson", 2, 70, "One-to-one (or two) private coaching, flexible time."],
    ];
    let sort = 0;
    for (const [name, spots, price, description] of SESSIONS) {
      const typeId = await ctx.db.insert("roomTypes", {
        name,
        description,
        mode: "dorm", // per-spot
        capacity: spots,
        basePrice: price,
      });
      const roomId = await ctx.db.insert("rooms", {
        roomTypeId: typeId,
        name,
        status: "available",
        description,
        sortOrder: sort++,
      });
      for (let i = 0; i < spots; i++) {
        await ctx.db.insert("beds", { roomId, label: `Spot ${i + 1}`, sortOrder: i });
      }
    }

    // Catalog — activities (extras beyond the session) + services + packs.
    const acts: [string, "surf_lesson" | "yoga" | "excursion" | "other", string, string][] = [
      ["Video Analysis", "other", "#2f948f", "16:00"],
      ["Theory Class", "other", "#87755a", "13:00"],
      ["Yoga / Stretch", "yoga", "#f9c74f", "08:00"],
    ];
    for (const [name, type, color, startTime] of acts) {
      await ctx.db.insert("activities", {
        name, type, capacityPerSession: 10, price: 0, durationMin: 60,
        color, active: true, startTime,
      });
    }
    for (const [name, price, unit] of [
      ["Board rental", 8, "per_day"],
      ["Wetsuit rental", 6, "per_day"],
      ["Surf photos", 15, "per_unit"],
      ["Airport / hotel transfer", 20, "per_unit"],
    ] as const) {
      await ctx.db.insert("services", {
        name, price, unit: unit as "per_day" | "per_unit", active: true,
      });
    }
    // Session packs (flat price)
    for (const [name, price, description] of [
      ["5-Session Pack", 110, "Five group sessions — save vs. per-session."],
      ["10-Session Pack", 200, "Ten group sessions for the committed."],
    ] as const) {
      await ctx.db.insert("packages", {
        name, description, price, nights: 1, includedItems: [], active: true,
      });
    }

    return `Seeded ${SESSIONS.length} sessions + catalog.`;
  },
});
