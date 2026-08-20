import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { logAudit, requireRole, requireUser } from "./lib/access";
import { internal } from "./_generated/api";

/** Uploaded photo wins over a static/imported URL. */
export async function resolveRoomPhoto(
  ctx: QueryCtx,
  room: Doc<"rooms">,
): Promise<string | undefined> {
  if (room.imageStorageId) {
    const url = await ctx.storage.getUrl(room.imageStorageId);
    if (url) return url;
  }
  return room.imageUrl;
}

// ── Room types ─────────────────────────────────────────────────────────

export const listRoomTypes = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.db.query("roomTypes").collect();
  },
});

export const upsertRoomType = mutation({
  args: {
    id: v.optional(v.id("roomTypes")),
    name: v.string(),
    description: v.optional(v.string()),
    mode: v.union(v.literal("private"), v.literal("dorm")),
    capacity: v.number(),
    basePrice: v.number(),
    amenities: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { id, ...fields }) => {
    const actor = await requireRole(ctx, "manager");
    if (id) {
      const before = await ctx.db.get(id);
      await ctx.db.patch(id, fields);
      if (before && before.basePrice !== fields.basePrice) {
        // price changed → sync new rates to the channels
        await ctx.scheduler.runAfter(0, internal.channex.pushRates, {});
      }
      await logAudit(ctx, actor, {
        action: "roomType.update",
        entity: "roomTypes",
        entityId: id,
        summary: `Updated room type "${fields.name}"`,
        before,
        after: fields,
      });
      return id;
    }
    const newId = await ctx.db.insert("roomTypes", fields);
    await logAudit(ctx, actor, {
      action: "roomType.create",
      entity: "roomTypes",
      entityId: newId,
      summary: `Created room type "${fields.name}"`,
      after: fields,
    });
    return newId;
  },
});

// ── Rooms ──────────────────────────────────────────────────────────────

export const listRooms = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rooms = await ctx.db.query("rooms").collect();
    const sorted = rooms.sort((a, b) => a.sortOrder - b.sortOrder);
    return await Promise.all(
      sorted.map(async (room) => ({
        ...room,
        photoUrl: await resolveRoomPhoto(ctx, room),
      })),
    );
  },
});

/** Step 1 of a photo upload: the client POSTs the file to this URL. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "manager");
    return await ctx.storage.generateUploadUrl();
  },
});

/** Step 2: attach the uploaded file to the room (replaces the old one). */
export const setRoomPhoto = mutation({
  args: { roomId: v.id("rooms"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "manager");
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("Room not found");
    if (room.imageStorageId) {
      await ctx.storage.delete(room.imageStorageId).catch(() => {});
    }
    await ctx.db.patch(args.roomId, { imageStorageId: args.storageId });
    await logAudit(ctx, actor, {
      action: "room.setPhoto",
      entity: "rooms",
      entityId: args.roomId,
      summary: `Uploaded a new photo for room "${room.name}"`,
    });
  },
});

export const upsertRoom = mutation({
  args: {
    id: v.optional(v.id("rooms")),
    roomTypeId: v.id("roomTypes"),
    name: v.string(),
    floor: v.optional(v.string()),
    status: v.union(v.literal("available"), v.literal("maintenance")),
    notes: v.optional(v.string()),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    bedCount: v.optional(v.number()), // for dorms: sync beds to this count
  },
  handler: async (ctx, { id, bedCount, ...fields }) => {
    const actor = await requireRole(ctx, "manager");
    const roomType = await ctx.db.get(fields.roomTypeId);
    if (!roomType) throw new Error("Room type not found");

    let roomId = id;
    if (roomId) {
      const before = await ctx.db.get(roomId);
      await ctx.db.patch(roomId, {
        ...fields,
        sortOrder: fields.sortOrder ?? before?.sortOrder ?? 0,
      });
      await logAudit(ctx, actor, {
        action: "room.update",
        entity: "rooms",
        entityId: roomId,
        summary: `Updated room "${fields.name}"`,
        before,
        after: fields,
      });
    } else {
      const all = await ctx.db.query("rooms").collect();
      roomId = await ctx.db.insert("rooms", {
        ...fields,
        sortOrder: fields.sortOrder ?? all.length,
      });
      await logAudit(ctx, actor, {
        action: "room.create",
        entity: "rooms",
        entityId: roomId,
        summary: `Created room "${fields.name}"`,
        after: fields,
      });
    }

    // Keep dorm bed rows in sync with the requested count.
    if (roomType.mode === "dorm" && bedCount !== undefined) {
      const beds = await ctx.db
        .query("beds")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .collect();
      const sorted = beds.sort((a, b) => a.sortOrder - b.sortOrder);
      for (let i = sorted.length; i < bedCount; i++) {
        await ctx.db.insert("beds", {
          roomId,
          label: `Bed ${i + 1}`,
          sortOrder: i,
        });
      }
      for (let i = bedCount; i < sorted.length; i++) {
        await ctx.db.delete(sorted[i]._id);
      }
    }
    return roomId;
  },
});

export const listBeds = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const beds = await ctx.db.query("beds").collect();
    return beds.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

// ── Room blocks (renovation / off-market date ranges) ────────────────────

export const listBlocks = query({
  args: { start: v.string(), end: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const blocks = await ctx.db.query("roomBlocks").collect();
    return blocks.filter((b) => b.start < args.end && b.end > args.start);
  },
});

export const blockDates = mutation({
  args: {
    roomId: v.id("rooms"),
    start: v.string(),
    end: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "manager");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.start) || !/^\d{4}-\d{2}-\d{2}$/.test(args.end)) {
      throw new Error("Invalid dates");
    }
    if (args.end <= args.start) throw new Error("End must be after start");
    const reason = args.reason.trim();
    if (reason.length < 2 || reason.length > 120) throw new Error("Add a short reason");
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("Room not found");

    // Don't block over an existing active booking on that room.
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
    const clash = bookings.find(
      (b) =>
        b.status !== "cancelled" &&
        b.status !== "no_show" &&
        b.checkIn < args.end &&
        b.checkOut > args.start,
    );
    if (clash) {
      throw new Error(`A booking already covers ${clash.checkIn} → ${clash.checkOut}`);
    }

    const id = await ctx.db.insert("roomBlocks", {
      roomId: args.roomId,
      start: args.start,
      end: args.end,
      reason,
      createdBy: actor._id,
    });
    await ctx.scheduler.runAfter(0, internal.channex.pushAvailability, {
      start: args.start,
      end: args.end,
    });
    await logAudit(ctx, actor, {
      action: "room.block",
      entity: "roomBlocks",
      entityId: id,
      summary: `Blocked ${room.name}: ${args.start} → ${args.end} (${reason})`,
      after: { roomId: args.roomId, start: args.start, end: args.end, reason },
    });
    return id;
  },
});

export const removeBlock = mutation({
  args: { blockId: v.id("roomBlocks") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "manager");
    const block = await ctx.db.get(args.blockId);
    if (!block) return;
    const room = await ctx.db.get(block.roomId);
    await ctx.db.delete(args.blockId);
    await ctx.scheduler.runAfter(0, internal.channex.pushAvailability, {
      start: block.start,
      end: block.end,
    });
    await logAudit(ctx, actor, {
      action: "room.unblock",
      entity: "roomBlocks",
      entityId: args.blockId,
      summary: `Unblocked ${room?.name ?? "room"}: ${block.start} → ${block.end}`,
      before: block,
    });
  },
});
