import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export const roleValidator = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("crew"),
);

export const bookingStatusValidator = v.union(
  v.literal("inquiry"),
  v.literal("confirmed"),
  v.literal("checked_in"),
  v.literal("checked_out"),
  v.literal("cancelled"),
  v.literal("no_show"),
);

export const bookingSourceValidator = v.union(
  v.literal("direct"),
  v.literal("booking_com"),
  v.literal("airbnb"),
  v.literal("expedia"),
  v.literal("hostelworld"),
  v.literal("walk_in"),
);

export const surfLevelValidator = v.union(
  v.literal("beginner"),
  v.literal("intermediate"),
  v.literal("advanced"),
);

export const packageItemValidator = v.object({
  kind: v.union(v.literal("activity"), v.literal("service")),
  refId: v.string(), // activityId or serviceId as string
  qty: v.number(),
});

export default defineSchema({
  ...authTables,

  // ── Identity & access ────────────────────────────────────────────────
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(roleValidator),
    active: v.optional(v.boolean()),
  }).index("email", ["email"]),

  auditLogs: defineTable({
    actorId: v.optional(v.id("users")),
    actorName: v.string(),
    action: v.string(), // e.g. "booking.create"
    entity: v.string(), // table name
    entityId: v.optional(v.string()),
    summary: v.string(), // human-readable one-liner
    before: v.optional(v.any()),
    after: v.optional(v.any()),
  })
    .index("by_actor", ["actorId"])
    .index("by_entity", ["entity"]),

  // ── Inventory ────────────────────────────────────────────────────────
  roomTypes: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    mode: v.union(v.literal("private"), v.literal("dorm")),
    capacity: v.number(),
    basePrice: v.number(), // per night (private) or per bed (dorm), EUR
    amenities: v.optional(v.array(v.string())),
  }),

  rooms: defineTable({
    roomTypeId: v.id("roomTypes"),
    name: v.string(),
    floor: v.optional(v.string()),
    status: v.union(v.literal("available"), v.literal("maintenance")),
    notes: v.optional(v.string()),
    description: v.optional(v.string()), // guest-facing blurb
    imageUrl: v.optional(v.string()), // guest-facing photo (public path or URL)
    imageStorageId: v.optional(v.id("_storage")), // uploaded photo (wins over imageUrl)
    sortOrder: v.number(),
  }).index("by_roomType", ["roomTypeId"]),

  beds: defineTable({
    roomId: v.id("rooms"),
    label: v.string(),
    sortOrder: v.number(),
  }).index("by_room", ["roomId"]),

  // Admin-set date ranges when a room is off the market (renovation, repair…)
  roomBlocks: defineTable({
    roomId: v.id("rooms"),
    start: v.string(), // YYYY-MM-DD inclusive
    end: v.string(), // YYYY-MM-DD exclusive (checkout-style)
    reason: v.string(),
    createdBy: v.optional(v.id("users")),
  }).index("by_room", ["roomId"]),

  activities: defineTable({
    name: v.string(),
    type: v.union(
      v.literal("surf_lesson"),
      v.literal("surf_guiding"),
      v.literal("yoga"),
      v.literal("excursion"),
      v.literal("other"),
    ),
    capacityPerSession: v.number(),
    price: v.number(),
    durationMin: v.number(),
    color: v.string(),
    active: v.boolean(),
    startTime: v.optional(v.string()), // daily fixed time, "HH:MM" 24h
    imageUrl: v.optional(v.string()),
  }),

  services: defineTable({
    name: v.string(),
    price: v.number(),
    unit: v.union(
      v.literal("per_stay"),
      v.literal("per_day"),
      v.literal("per_unit"),
    ),
    active: v.boolean(),
    startTime: v.optional(v.string()), // e.g. breakfast at 09:00
    imageUrl: v.optional(v.string()),
    // Auto-attached to stays when the calendar recalculates a booking
    includedByDefault: v.optional(v.boolean()),
  }),

  packages: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    // Flat price for classic packages; for formules with roomTypePrices
    // this is the "from" price (lowest per-person weekly rate) for display.
    price: v.number(),
    nights: v.number(),
    includedItems: v.array(packageItemValidator),
    active: v.boolean(),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    // BookingLayer-style formule: per-person price PER WEEK by room type,
    // prorated per night. Only listed room types can be booked with it.
    roomTypePrices: v.optional(
      v.array(v.object({ roomTypeId: v.id("roomTypes"), price: v.number() })),
    ),
    minGuests: v.optional(v.number()),
  }),

  // ── Guests & bookings ────────────────────────────────────────────────
  guests: defineTable({
    fullName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    country: v.optional(v.string()),
    surfLevel: v.optional(surfLevelValidator),
    allergies: v.optional(v.string()),
    notes: v.optional(v.string()),
  }).index("by_name", ["fullName"]),

  bookings: defineTable({
    guestId: v.id("guests"),
    roomId: v.id("rooms"),
    bedId: v.optional(v.id("beds")),
    packageId: v.optional(v.id("packages")),
    checkIn: v.string(), // YYYY-MM-DD
    checkOut: v.string(), // YYYY-MM-DD (exclusive)
    status: bookingStatusValidator,
    source: bookingSourceValidator,
    channelBookingId: v.optional(v.string()),
    adults: v.number(),
    children: v.number(),
    totalAmount: v.number(),
    currency: v.string(),
    notes: v.optional(v.string()),
    // Fellow travellers (lead guest lives in `guests`)
    companions: v.optional(
      v.array(v.object({ name: v.string(), surfLevel: v.optional(v.string()) })),
    ),
    createdBy: v.optional(v.id("users")),
    portalToken: v.string(),
    // Short human-friendly code (e.g. TSH-4F7K2) — guests quote it on the
    // phone / to the Hermes agent for identity verification.
    reservationCode: v.optional(v.string()),
  })
    .index("by_room", ["roomId"])
    .index("by_guest", ["guestId"])
    .index("by_checkIn", ["checkIn"])
    .index("by_status", ["status"])
    .index("by_portalToken", ["portalToken"])
    .index("by_reservationCode", ["reservationCode"]),

  bookingActivities: defineTable({
    bookingId: v.id("bookings"),
    activityId: v.id("activities"),
    date: v.string(), // YYYY-MM-DD
    participants: v.number(),
  })
    .index("by_booking", ["bookingId"])
    .index("by_date", ["date"]),

  bookingServices: defineTable({
    bookingId: v.id("bookings"),
    serviceId: v.id("services"),
    qty: v.number(),
    date: v.optional(v.string()),
    amount: v.number(),
  })
    .index("by_booking", ["bookingId"])
    .index("by_date", ["date"]),

  guestRequests: defineTable({
    bookingId: v.id("bookings"),
    type: v.union(v.literal("order"), v.literal("requirement")),
    payload: v.object({
      activityId: v.optional(v.id("activities")),
      serviceId: v.optional(v.id("services")),
      qty: v.optional(v.number()),
      date: v.optional(v.string()),
      note: v.optional(v.string()),
    }),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("declined"),
    ),
    resolvedBy: v.optional(v.id("users")),
  })
    .index("by_booking", ["bookingId"])
    .index("by_status", ["status"]),

  // ── Channel hub (Channex.io-shaped) ──────────────────────────────────
  channels: defineTable({
    name: v.string(),
    type: v.union(
      v.literal("booking_com"),
      v.literal("airbnb"),
      v.literal("expedia"),
      v.literal("hostelworld"),
      v.literal("other"),
    ),
    status: v.union(
      v.literal("connected"),
      v.literal("mock"),
      v.literal("error"),
      v.literal("disabled"),
    ),
    lastSyncAt: v.optional(v.number()),
    config: v.optional(v.any()),
  }),

  channelRequests: defineTable({
    channelId: v.id("channels"),
    type: v.union(
      v.literal("new_booking"),
      v.literal("modification"),
      v.literal("cancellation"),
    ),
    // Channex-style webhook payload
    payload: v.object({
      ota_reservation_code: v.string(),
      guest_name: v.string(),
      guest_email: v.optional(v.string()),
      guest_country: v.optional(v.string()),
      arrival_date: v.string(),
      departure_date: v.string(),
      room_type: v.string(),
      occupancy: v.number(),
      total_price: v.number(),
      currency: v.string(),
      notes: v.optional(v.string()),
    }),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("rejected"),
    ),
    linkedBookingId: v.optional(v.id("bookings")),
    resolvedBy: v.optional(v.id("users")),
  })
    .index("by_status", ["status"])
    .index("by_channel", ["channelId"]),

  // ── Channex.io live sync ─────────────────────────────────────────────
  channexConfig: defineTable({
    propertyId: v.string(), // Channex property UUID
    webhookId: v.optional(v.string()),
    webhookSecret: v.string(),
    active: v.boolean(),
    lastSyncAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  }),

  channexRoomMap: defineTable({
    roomTypeId: v.id("roomTypes"),
    channexRoomTypeId: v.string(),
    channexRatePlanId: v.string(),
  })
    .index("by_roomType", ["roomTypeId"])
    .index("by_channexRoomType", ["channexRoomTypeId"]),

  // ── Money ────────────────────────────────────────────────────────────
  payments: defineTable({
    bookingId: v.id("bookings"),
    amount: v.number(),
    currency: v.string(),
    method: v.union(
      v.literal("cash"),
      v.literal("bank_transfer"),
      v.literal("card"),
      v.literal("ota_payout"),
    ),
    direction: v.union(v.literal("in"), v.literal("refund")),
    date: v.string(), // YYYY-MM-DD
    recordedBy: v.optional(v.id("users")),
    note: v.optional(v.string()),
  })
    .index("by_booking", ["bookingId"])
    .index("by_date", ["date"]),

  teamMembers: defineTable({
    name: v.string(),
    position: v.string(),
    salary: v.number(), // monthly, EUR
    active: v.boolean(),
    notes: v.optional(v.string()),
  }),

  expenses: defineTable({
    category: v.union(
      v.literal("food"),
      v.literal("staff"),
      v.literal("equipment"),
      v.literal("maintenance"),
      v.literal("transport"),
      v.literal("utilities"),
      v.literal("salary"),
      v.literal("rent"),
      v.literal("coaches"),
      v.literal("other"),
    ),
    // fixed = same every month (salary, rent…); variable = fluctuates
    kind: v.optional(v.union(v.literal("fixed"), v.literal("variable"))),
    // Required label when category is "other" — names the expense type
    customLabel: v.optional(v.string()),
    amount: v.number(),
    currency: v.string(),
    date: v.string(),
    description: v.string(),
    recordedBy: v.optional(v.id("users")),
  }).index("by_date", ["date"]),
});
