import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { generatePortalToken, logAudit, requireRole, requireUser } from "./lib/access";

/**
 * Live Channex.io integration (staging sandbox for now).
 *
 * Outbound: availability + rates pushed on every booking change and daily.
 * Inbound: Channex webhook → pull booking revision → channel inbox.
 * Swap CHANNEX_BASE_URL / CHANNEX_API_KEY env vars to go to production.
 */

const HORIZON_DAYS = 365;

// ── HTTP helper (actions only) ─────────────────────────────────────────

async function channexFetch(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: unknown,
) {
  const base = process.env.CHANNEX_BASE_URL;
  const key = process.env.CHANNEX_API_KEY;
  if (!base || !key) throw new Error("Channex env vars not configured");
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "user-api-key": key,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON response */
  }
  if (!response.ok && response.status !== 201) {
    throw new Error(`Channex ${method} ${path} → ${response.status}: ${text.slice(0, 400)}`);
  }
  if (json?.errors) {
    throw new Error(`Channex ${method} ${path} validation: ${JSON.stringify(json.errors).slice(0, 400)}`);
  }
  return json;
}

function isoAddDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Internal data plumbing ─────────────────────────────────────────────

export const getConfig = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("channexConfig").first();
  },
});

export const getMappings = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("channexRoomMap").collect();
  },
});

export const saveSetup = internalMutation({
  args: {
    propertyId: v.string(),
    webhookId: v.optional(v.string()),
    webhookSecret: v.string(),
    mappings: v.array(
      v.object({
        roomTypeId: v.id("roomTypes"),
        channexRoomTypeId: v.string(),
        channexRatePlanId: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("channexConfig").first();
    if (existing) await ctx.db.delete(existing._id);
    for (const row of await ctx.db.query("channexRoomMap").collect()) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.insert("channexConfig", {
      propertyId: args.propertyId,
      webhookId: args.webhookId,
      webhookSecret: args.webhookSecret,
      active: true,
      lastSyncAt: Date.now(),
    });
    for (const mapping of args.mappings) {
      await ctx.db.insert("channexRoomMap", mapping);
    }
    await ctx.db.insert("auditLogs", {
      actorName: "System",
      action: "channex.setup",
      entity: "channexConfig",
      summary: `Connected to Channex property ${args.propertyId} (${args.mappings.length} room types mapped)`,
    });
  },
});

export const markSync = internalMutation({
  args: { error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const config = await ctx.db.query("channexConfig").first();
    if (!config) return;
    await ctx.db.patch(config._id, {
      lastSyncAt: Date.now(),
      lastError: args.error,
    });
  },
});

/** Per-room-type free counts for a date range (dorms count free beds). */
export const availabilityData = internalQuery({
  args: { start: v.string(), end: v.string() },
  handler: async (ctx, args) => {
    const [roomTypes, rooms, beds, bookings, mappings] = await Promise.all([
      ctx.db.query("roomTypes").collect(),
      ctx.db.query("rooms").collect(),
      ctx.db.query("beds").collect(),
      ctx.db.query("bookings").collect(),
      ctx.db.query("channexRoomMap").collect(),
    ]);
    const holding = bookings.filter(
      (b) =>
        ["inquiry", "confirmed", "checked_in"].includes(b.status) &&
        b.checkIn < args.end &&
        b.checkOut > args.start,
    );

    const days: string[] = [];
    let t = Date.parse(args.start);
    const endT = Date.parse(args.end);
    while (t < endT) {
      days.push(new Date(t).toISOString().slice(0, 10));
      t += 86400000;
    }

    return mappings.map((mapping) => {
      const type = roomTypes.find((rt) => rt._id === mapping.roomTypeId);
      const typeRooms = rooms.filter(
        (r) => r.roomTypeId === mapping.roomTypeId && r.status === "available",
      );
      const perDate: Record<string, number> = {};
      for (const date of days) {
        let free = 0;
        for (const room of typeRooms) {
          const active = holding.filter(
            (b) => b.roomId === room._id && b.checkIn <= date && b.checkOut > date,
          );
          if (type?.mode === "dorm") {
            const total = beds.filter((b) => b.roomId === room._id).length;
            free += Math.max(0, total - active.length);
          } else {
            free += active.length > 0 ? 0 : 1;
          }
        }
        perDate[date] = free;
      }
      return {
        channexRoomTypeId: mapping.channexRoomTypeId,
        channexRatePlanId: mapping.channexRatePlanId,
        basePrice: type?.basePrice ?? 0,
        perDate,
      };
    });
  },
});

/** Property + room/rate data used by the one-time setup action. */
export const setupData = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [roomTypes, rooms, beds] = await Promise.all([
      ctx.db.query("roomTypes").collect(),
      ctx.db.query("rooms").collect(),
      ctx.db.query("beds").collect(),
    ]);
    return roomTypes.map((type) => ({
      roomTypeId: type._id,
      title: type.name,
      capacity: type.capacity,
      basePrice: type.basePrice,
      countOfRooms:
        type.mode === "dorm"
          ? rooms
              .filter((r) => r.roomTypeId === type._id)
              .reduce((n, room) => n + beds.filter((b) => b.roomId === room._id).length, 0)
          : rooms.filter((r) => r.roomTypeId === type._id).length,
    }));
  },
});

// ── One-time setup: create property, rooms, rates, webhook ────────────

export const setup = internalAction({
  args: {},
  handler: async (ctx): Promise<string> => {
    const existing = await ctx.runQuery(internal.channex.getConfig, {});
    if (existing) return `Already connected to property ${existing.propertyId}`;

    const propertyResult = await channexFetch("/properties", "POST", {
      property: {
        title: "Moana Surf Experience",
        currency: "EUR",
        email: "moanasurfmaroc@gmail.com",
        phone: "+212622847675",
        zip_code: "80750",
        country: "MA",
        city: "Agadir",
        address: "Hay Tissaliouine Tamraght Aourir",
        timezone: "Africa/Casablanca",
        property_type: "hotel",
        settings: {
          allow_availability_autoupdate_on_confirmation: false,
          allow_availability_autoupdate_on_modification: false,
          allow_availability_autoupdate_on_cancellation: false,
        },
      },
    });
    const propertyId: string = propertyResult.data.id;

    const setupRows = await ctx.runQuery(internal.channex.setupData, {});
    const mappings: {
      roomTypeId: Id<"roomTypes">;
      channexRoomTypeId: string;
      channexRatePlanId: string;
    }[] = [];

    for (const row of setupRows) {
      if (row.countOfRooms === 0) continue;
      const roomTypeResult = await channexFetch("/room_types", "POST", {
        room_type: {
          property_id: propertyId,
          title: row.title,
          count_of_rooms: row.countOfRooms,
          occ_adults: row.capacity,
          occ_children: 0,
          occ_infants: 0,
          default_occupancy: row.capacity,
          room_kind: "room",
        },
      });
      const channexRoomTypeId: string = roomTypeResult.data.id;

      const ratePlanResult = await channexFetch("/rate_plans", "POST", {
        rate_plan: {
          title: `${row.title} — Standard Rate`,
          property_id: propertyId,
          room_type_id: channexRoomTypeId,
          currency: "EUR",
          sell_mode: "per_room",
          rate_mode: "manual",
          options: [{ occupancy: row.capacity, is_primary: true, rate: 0 }],
        },
      });
      mappings.push({
        roomTypeId: row.roomTypeId,
        channexRoomTypeId,
        channexRatePlanId: ratePlanResult.data.id,
      });
    }

    // Webhook back to us, authenticated with a shared secret header
    const webhookSecret = generatePortalToken() + generatePortalToken();
    const callbackUrl = `${process.env.CONVEX_SITE_URL}/channex/webhook`;
    const webhookResult = await channexFetch("/webhooks", "POST", {
      webhook: {
        property_id: propertyId,
        callback_url: callbackUrl,
        event_mask: "booking",
        headers: { "x-webhook-secret": webhookSecret },
        request_params: {},
        is_active: true,
        send_data: true,
      },
    });

    await ctx.runMutation(internal.channex.saveSetup, {
      propertyId,
      webhookId: webhookResult.data.id,
      webhookSecret,
      mappings,
    });

    // Initial full push: availability + rates for the whole horizon
    await ctx.runAction(internal.channex.pushAvailability, {});
    await ctx.runAction(internal.channex.pushRates, {});
    return `Connected: property ${propertyId}, ${mappings.length} room types, webhook → ${callbackUrl}`;
  },
});

// ── Outbound sync ──────────────────────────────────────────────────────

export const pushAvailability = internalAction({
  args: { start: v.optional(v.string()), end: v.optional(v.string()) },
  handler: async (ctx, args): Promise<string> => {
    const config = await ctx.runQuery(internal.channex.getConfig, {});
    if (!config?.active) return "Channex not connected — skipped";

    const today = new Date().toISOString().slice(0, 10);
    const start = args.start && args.start > today ? args.start : today;
    const end = args.end ?? isoAddDays(new Date(), HORIZON_DAYS);
    if (end <= start) return "Range in the past — skipped";

    const data = await ctx.runQuery(internal.channex.availabilityData, { start, end });
    const values: unknown[] = [];
    for (const row of data) {
      // collapse consecutive dates with the same availability into ranges
      const dates = Object.keys(row.perDate).sort();
      let rangeStart: string | null = null;
      let prevDate: string | null = null;
      let prevValue: number | null = null;
      const flush = () => {
        if (rangeStart !== null && prevDate !== null && prevValue !== null) {
          values.push({
            property_id: config.propertyId,
            room_type_id: row.channexRoomTypeId,
            date_from: rangeStart,
            date_to: prevDate,
            availability: prevValue,
          });
        }
      };
      for (const date of dates) {
        const value = row.perDate[date];
        if (prevValue === null || value !== prevValue) {
          flush();
          rangeStart = date;
        }
        prevDate = date;
        prevValue = value;
      }
      flush();
    }
    if (values.length === 0) return "Nothing to push";

    try {
      await channexFetch("/availability", "POST", { values });
      await ctx.runMutation(internal.channex.markSync, {});
      return `Pushed ${values.length} availability ranges (${start} → ${end})`;
    } catch (error) {
      await ctx.runMutation(internal.channex.markSync, {
        error: error instanceof Error ? error.message : "push failed",
      });
      throw error;
    }
  },
});

export const pushRates = internalAction({
  args: {},
  handler: async (ctx): Promise<string> => {
    const config = await ctx.runQuery(internal.channex.getConfig, {});
    if (!config?.active) return "Channex not connected — skipped";
    const start = new Date().toISOString().slice(0, 10);
    const end = isoAddDays(new Date(), HORIZON_DAYS);
    const data = await ctx.runQuery(internal.channex.availabilityData, { start, end });
    const values = data
      .filter((row) => row.basePrice > 0)
      .map((row) => ({
        property_id: config.propertyId,
        rate_plan_id: row.channexRatePlanId,
        date_from: start,
        date_to: end,
        rate: Math.round(row.basePrice * 100), // cents
      }));
    if (values.length === 0) return "No rates to push";
    await channexFetch("/restrictions", "POST", { values });
    return `Pushed rates for ${values.length} rate plans`;
  },
});

// ── Inbound: booking revisions ─────────────────────────────────────────

export const handleBookingEvent = internalAction({
  args: { revisionId: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const result = await channexFetch(`/booking_revisions/${args.revisionId}`);
    const attrs = result.data.attributes;

    const rooms: any[] = attrs.rooms ?? [];
    const first = rooms[0] ?? {};
    const total = rooms.reduce((sum: number, r: any) => sum + Number(r.amount ?? 0), 0);
    const customer = attrs.customer ?? {};
    const guestName =
      [customer.name, customer.surname].filter(Boolean).join(" ") || "OTA Guest";

    await ctx.runMutation(internal.channex.ingestRevision, {
      otaName: String(attrs.ota_name ?? "Channex"),
      uniqueId: String(attrs.unique_id ?? attrs.ota_reservation_code ?? args.revisionId),
      status: String(attrs.status ?? "new"),
      guestName,
      guestEmail: customer.mail ? String(customer.mail) : undefined,
      guestCountry: customer.country ? String(customer.country) : undefined,
      arrival: String(first.checkin_date ?? ""),
      departure: String(first.checkout_date ?? ""),
      channexRoomTypeId: first.room_type_id ? String(first.room_type_id) : undefined,
      occupancy: Number(first.occupancy?.adults ?? 1),
      totalPrice: total,
      notes: attrs.notes ? String(attrs.notes) : undefined,
    });

    await channexFetch(`/booking_revisions/${args.revisionId}/ack`, "POST", {});
    return `Ingested + acked revision ${args.revisionId}`;
  },
});

const OTA_TYPE: Record<string, "booking_com" | "airbnb" | "expedia" | "hostelworld" | "other"> = {
  "Booking.com": "booking_com",
  Airbnb: "airbnb",
  Expedia: "expedia",
  Hostelworld: "hostelworld",
};

export const ingestRevision = internalMutation({
  args: {
    otaName: v.string(),
    uniqueId: v.string(),
    status: v.string(),
    guestName: v.string(),
    guestEmail: v.optional(v.string()),
    guestCountry: v.optional(v.string()),
    arrival: v.string(),
    departure: v.string(),
    channexRoomTypeId: v.optional(v.string()),
    occupancy: v.number(),
    totalPrice: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // find-or-create the channel row for this OTA. A booking arriving does
    // NOT mean the real OTA account is connected — on the sandbox everything
    // stays "mock" (shown as "Sandbox"); we never overwrite an existing status.
    const isSandbox = (process.env.CHANNEX_BASE_URL ?? "").includes("staging");
    const channels = await ctx.db.query("channels").collect();
    let channel = channels.find((c) => c.name === args.otaName);
    if (!channel) {
      const id = await ctx.db.insert("channels", {
        name: args.otaName,
        type: OTA_TYPE[args.otaName] ?? "other",
        status: isSandbox ? "mock" : "connected",
        lastSyncAt: Date.now(),
      });
      channel = (await ctx.db.get(id))!;
    } else {
      await ctx.db.patch(channel._id, { lastSyncAt: Date.now() });
    }

    // resolve room type name for the inbox display
    let roomTypeName = "See booking";
    if (args.channexRoomTypeId) {
      const mapping = await ctx.db
        .query("channexRoomMap")
        .withIndex("by_channexRoomType", (q) =>
          q.eq("channexRoomTypeId", args.channexRoomTypeId!),
        )
        .unique();
      if (mapping) {
        const roomType = await ctx.db.get(mapping.roomTypeId);
        if (roomType) roomTypeName = roomType.name;
      }
    }

    // dedupe: same OTA code + same type pending already?
    const requestType =
      args.status === "cancelled"
        ? ("cancellation" as const)
        : args.status === "modified"
          ? ("modification" as const)
          : ("new_booking" as const);
    const pending = await ctx.db
      .query("channelRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    if (
      pending.some(
        (r) => r.payload.ota_reservation_code === args.uniqueId && r.type === requestType,
      )
    ) {
      return;
    }

    const id = await ctx.db.insert("channelRequests", {
      channelId: channel._id,
      type: requestType,
      status: "pending",
      payload: {
        ota_reservation_code: args.uniqueId,
        guest_name: args.guestName,
        guest_email: args.guestEmail,
        guest_country: args.guestCountry,
        arrival_date: args.arrival,
        departure_date: args.departure,
        room_type: roomTypeName,
        occupancy: args.occupancy,
        total_price: args.totalPrice,
        currency: "EUR",
        notes: args.notes,
      },
    });
    await ctx.db.insert("auditLogs", {
      actorName: "Channex",
      action: `channex.${requestType}`,
      entity: "channelRequests",
      entityId: id,
      summary: `${args.otaName}: ${requestType.replace("_", " ")} for ${args.guestName} (${args.uniqueId})`,
    });
  },
});

// ── Staff-facing API (Channels page) ───────────────────────────────────

export const status = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const config = await ctx.db.query("channexConfig").first();
    if (!config) return { connected: false as const };
    const mappings = await ctx.db.query("channexRoomMap").collect();
    return {
      connected: true as const,
      propertyId: config.propertyId,
      active: config.active,
      lastSyncAt: config.lastSyncAt,
      lastError: config.lastError,
      mappedRoomTypes: mappings.length,
    };
  },
});

export const connect = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await requireRole(ctx, "admin");
    await ctx.scheduler.runAfter(0, internal.channex.setup, {});
    await logAudit(ctx, actor, {
      action: "channex.connect",
      entity: "channexConfig",
      summary: "Started Channex connection setup",
    });
  },
});

/** Caller's display name if they're manager+, for the iframe session. */
export const callerName = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, "manager");
    return user.name ?? user.email ?? "PMS user";
  },
});

/**
 * One-time authenticated URL for Channex's embedded channel-management UI
 * (connect OTAs + room mapping), white-labeled inside our Channels page.
 */
export const iframeUrl = action({
  args: {},
  handler: async (ctx): Promise<string> => {
    const username = await ctx.runQuery(internal.channex.callerName, {});
    const config = await ctx.runQuery(internal.channex.getConfig, {});
    if (!config) throw new Error("Connect to Channex first");
    const result = await channexFetch("/auth/one_time_token", "POST", {
      one_time_token: {
        property_id: config.propertyId,
        username,
      },
    });
    const base = (process.env.CHANNEX_BASE_URL ?? "").replace("/api/v1", "");
    const params = new URLSearchParams({
      oauth_session_key: result.data.token,
      app_mode: "headless",
      redirect_to: "/channels",
      property_id: config.propertyId,
      channels: "BDC,ABB,EXP,HWL,VRB,AGO,OC",
    });
    return `${base}/auth/exchange?${params.toString()}`;
  },
});

export const syncNow = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await requireRole(ctx, "manager");
    await ctx.scheduler.runAfter(0, internal.channex.pushAvailability, {});
    await ctx.scheduler.runAfter(0, internal.channex.pushRates, {});
    await logAudit(ctx, actor, {
      action: "channex.syncNow",
      entity: "channexConfig",
      summary: "Manual full sync to Channex triggered",
    });
  },
});
