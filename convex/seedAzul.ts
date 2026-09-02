import { internalMutation } from "./_generated/server";
import { generatePortalToken, generateReservationCode } from "./lib/access";
import type { Id } from "./_generated/dataModel";

/** Seed Azul Guesthouse — a small surf guesthouse (rooms sold whole). */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await ctx.db.query("rooms").first()) return "Already seeded — skipping.";
    const today = new Date();
    const day = (o: number) => new Date(today.getTime() + o * 86400000).toISOString().slice(0, 10);

    // Rooms: private whole-room + one shared dorm.
    const ROOMS: [string, "private" | "dorm", number, number, string, number][] = [
      // name, mode, capacity, price/night(or per bed), description, beds(if dorm)
      ["Azul Suite", "private", 2, 65, "Sea-view double with private bathroom and balcony.", 0],
      ["Blue Room", "private", 2, 45, "Cosy double with shared bathroom, steps from the beach.", 0],
      ["Garden Twin", "private", 2, 45, "Bright twin opening onto the garden.", 0],
      ["Family Room", "private", 4, 90, "Spacious room for four — one double, two singles.", 0],
      ["Surf Dorm", "dorm", 6, 18, "Six-bed shared dorm for solo travellers.", 6],
    ];
    let sort = 0;
    const roomIdByName = new Map<string, Id<"rooms">>();
    for (const [name, mode, capacity, price, description, beds] of ROOMS) {
      const typeId = await ctx.db.insert("roomTypes", { name, description, mode, capacity, basePrice: price });
      const roomId = await ctx.db.insert("rooms", { roomTypeId: typeId, name, status: "available", description, sortOrder: sort++ });
      if (mode === "dorm") for (let i = 0; i < beds; i++) await ctx.db.insert("beds", { roomId, label: `Bed ${i + 1}`, sortOrder: i });
      roomIdByName.set(name, roomId);
    }

    // Catalog
    for (const [name, type, color, startTime] of [
      ["Surf Lesson", "surf_lesson", "#96655a", "10:00"],
      ["Surf Guiding", "surf_guiding", "#6e4a42", "10:00"],
      ["Yoga", "yoga", "#f9c74f", "08:00"],
    ] as const) {
      await ctx.db.insert("activities", { name, type, capacityPerSession: 8, price: 25, durationMin: 120, color, active: true, startTime });
    }
    for (const [name, price, unit, startTime] of [
      ["Breakfast", 6, "per_day", "09:00"],
      ["Dinner", 12, "per_day", "20:00"],
      ["Board + Wetsuit Rental", 15, "per_day", undefined],
      ["Airport Transfer (Agadir)", 30, "per_unit", undefined],
    ] as const) {
      await ctx.db.insert("services", { name, price, unit: unit as "per_day" | "per_unit", active: true, startTime });
    }
    for (const [name, price, nights, description] of [
      ["Surf & Stay — 7 nights", 420, 7, "7 nights + 5 surf sessions + breakfast."],
      ["Weekend Surf — 3 nights", 190, 3, "3 nights + 2 surf sessions + breakfast."],
    ] as const) {
      await ctx.db.insert("packages", { name, description, price, nights, includedItems: [], active: true });
    }

    // A few demo bookings so it's not empty
    const demo: [string, string, number, number, number, string][] = [
      ["Lucas Meyer", "Azul Suite", -2, 5, 2, "confirmed"],
      ["Sofia Ferreira", "Blue Room", 0, 4, 1, "checked_in"],
      ["Marc Dubois", "Family Room", 3, 7, 3, "confirmed"],
      ["Aya Tazi", "Garden Twin", -6, -1, 2, "checked_out"],
    ];
    for (const [name, room, inOff, outOff, adults, status] of demo) {
      const guestId = await ctx.db.insert("guests", { fullName: name });
      await ctx.db.insert("bookings", {
        guestId, roomId: roomIdByName.get(room)!, checkIn: day(inOff), checkOut: day(outOff),
        status: status as "confirmed" | "checked_in" | "checked_out", source: "direct",
        adults, children: 0, totalAmount: 0, currency: "EUR",
        portalToken: generatePortalToken(), reservationCode: generateReservationCode(),
      });
    }
    return "Azul seeded: 5 rooms, catalog, 4 demo bookings.";
  },
});
