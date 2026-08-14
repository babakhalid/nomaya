import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logAudit, requireRole, requireUser } from "./lib/access";
import { packageItemValidator } from "./schema";
import type { Id } from "./_generated/dataModel";

// ── Activities ─────────────────────────────────────────────────────────

export const listActivities = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.db.query("activities").collect();
  },
});

export const upsertActivity = mutation({
  args: {
    id: v.optional(v.id("activities")),
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
    startTime: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...fields }) => {
    const actor = await requireRole(ctx, "manager");
    if (id) {
      const before = await ctx.db.get(id);
      await ctx.db.patch(id, fields);
      await logAudit(ctx, actor, {
        action: "activity.update",
        entity: "activities",
        entityId: id,
        summary: `Updated activity "${fields.name}"`,
        before,
        after: fields,
      });
      return id;
    }
    const newId = await ctx.db.insert("activities", fields);
    await logAudit(ctx, actor, {
      action: "activity.create",
      entity: "activities",
      entityId: newId,
      summary: `Created activity "${fields.name}"`,
      after: fields,
    });
    return newId;
  },
});

// ── Services ───────────────────────────────────────────────────────────

export const listServices = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.db.query("services").collect();
  },
});

export const upsertService = mutation({
  args: {
    id: v.optional(v.id("services")),
    name: v.string(),
    price: v.number(),
    unit: v.union(
      v.literal("per_stay"),
      v.literal("per_day"),
      v.literal("per_unit"),
    ),
    active: v.boolean(),
    startTime: v.optional(v.string()),
    includedByDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...fields }) => {
    const actor = await requireRole(ctx, "manager");
    if (id) {
      const before = await ctx.db.get(id);
      await ctx.db.patch(id, fields);
      await logAudit(ctx, actor, {
        action: "service.update",
        entity: "services",
        entityId: id,
        summary: `Updated service "${fields.name}"`,
        before,
        after: fields,
      });
      return id;
    }
    const newId = await ctx.db.insert("services", fields);
    await logAudit(ctx, actor, {
      action: "service.create",
      entity: "services",
      entityId: newId,
      summary: `Created service "${fields.name}"`,
      after: fields,
    });
    return newId;
  },
});

// ── Packages ───────────────────────────────────────────────────────────

export async function resolvePackagePhoto(
  ctx: { storage: { getUrl: (id: Id<"_storage">) => Promise<string | null> } },
  pkg: { imageStorageId?: Id<"_storage">; imageUrl?: string },
) {
  if (pkg.imageStorageId) {
    const url = await ctx.storage.getUrl(pkg.imageStorageId);
    if (url) return url;
  }
  return pkg.imageUrl;
}

export const listPackages = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const packages = await ctx.db.query("packages").collect();
    return await Promise.all(
      packages.map(async (pkg) => ({
        ...pkg,
        photoUrl: await resolvePackagePhoto(ctx, pkg),
      })),
    );
  },
});

export const upsertPackage = mutation({
  args: {
    id: v.optional(v.id("packages")),
    name: v.string(),
    description: v.optional(v.string()),
    price: v.number(),
    nights: v.number(),
    includedItems: v.array(packageItemValidator),
    active: v.boolean(),
    roomTypePrices: v.optional(
      v.array(v.object({ roomTypeId: v.id("roomTypes"), price: v.number() })),
    ),
    minGuests: v.optional(v.number()),
  },
  handler: async (ctx, { id, ...raw }) => {
    // An empty rate list means "flat-price package", not "no rooms allowed".
    const fields = {
      ...raw,
      roomTypePrices:
        raw.roomTypePrices && raw.roomTypePrices.length > 0
          ? raw.roomTypePrices
          : undefined,
      minGuests: raw.minGuests && raw.minGuests > 1 ? raw.minGuests : undefined,
    };
    const actor = await requireRole(ctx, "manager");
    if (id) {
      const before = await ctx.db.get(id);
      await ctx.db.patch(id, fields);
      await logAudit(ctx, actor, {
        action: "package.update",
        entity: "packages",
        entityId: id,
        summary: `Updated package "${fields.name}"`,
        before,
        after: fields,
      });
      return id;
    }
    const newId = await ctx.db.insert("packages", fields);
    await logAudit(ctx, actor, {
      action: "package.create",
      entity: "packages",
      entityId: newId,
      summary: `Created package "${fields.name}"`,
      after: fields,
    });
    return newId;
  },
});


export const setPackagePhoto = mutation({
  args: { packageId: v.id("packages"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "manager");
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg) throw new Error("Package not found");
    if (pkg.imageStorageId) {
      await ctx.storage.delete(pkg.imageStorageId).catch(() => {});
    }
    await ctx.db.patch(args.packageId, { imageStorageId: args.storageId });
    await logAudit(ctx, actor, {
      action: "package.photo",
      entity: "packages",
      entityId: args.packageId,
      summary: `Updated photo for package "${pkg.name}"`,
    });
  },
});
