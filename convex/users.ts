import { v } from "convex/values";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { logAudit, requireRole, requireUser } from "./lib/access";
import { roleValidator } from "./schema";
import { internal } from "./_generated/api";

export const me = query({
  args: {},
  handler: async (ctx) => {
    try {
      return await requireUser(ctx);
    } catch {
      return null;
    }
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    // Managers need the list for the audit-log filter; role/active
    // mutations below remain admin-only.
    await requireRole(ctx, "manager");
    return await ctx.db.query("users").collect();
  },
});

export const setRole = mutation({
  args: { userId: v.id("users"), role: roleValidator },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");
    if (target._id === actor._id) throw new Error("Cannot change your own role");
    await ctx.db.patch(args.userId, { role: args.role });
    await logAudit(ctx, actor, {
      action: "user.setRole",
      entity: "users",
      entityId: args.userId,
      summary: `Changed ${target.name ?? target.email} role to ${args.role}`,
      before: { role: target.role },
      after: { role: args.role },
    });
  },
});

export const setActive = mutation({
  args: { userId: v.id("users"), active: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");
    if (target._id === actor._id) throw new Error("Cannot deactivate yourself");
    await ctx.db.patch(args.userId, { active: args.active });
    await logAudit(ctx, actor, {
      action: args.active ? "user.activate" : "user.deactivate",
      entity: "users",
      entityId: args.userId,
      summary: `${args.active ? "Activated" : "Deactivated"} ${target.name ?? target.email}`,
      before: { active: target.active },
      after: { active: args.active },
    });
  },
});

/**
 * Ops escape hatch (CLI only, not callable from clients):
 * npx convex run users:forceRole '{"email": "...", "role": "admin"}' [--prod]
 */
export const forceRole = internalMutation({
  args: { email: v.string(), role: roleValidator },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").collect();
    const user = users.find((u) => u.email === args.email);
    if (!user) throw new Error(`No user with email ${args.email}`);
    await ctx.db.patch(user._id, { role: args.role });
    await logAudit(ctx, null, {
      action: "user.setRole",
      entity: "users",
      entityId: user._id,
      summary: `CLI: set ${user.name ?? user.email} role to ${args.role}`,
      before: { role: user.role },
      after: { role: args.role },
    });
    return `${user.name ?? user.email} is now ${args.role}`;
  },
});

/**
 * DEV helper — reset one account's password (nothing is deleted).
 *   npx convex run users:devSetPassword '{"email":"...","password":"..."}'
 */
export const devSetPassword = internalAction({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args): Promise<string> => {
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: args.email, secret: args.password },
    });
    return `Password updated for ${args.email}.`;
  },
});


/**
 * DEV/admin provisioning — create a staff login with a role in one step.
 *   npx convex run users:devCreateStaff '{"email":"...","password":"...","name":"...","role":"host"}'
 * If the account already exists it just (re)sets the password and role.
 */
export const devCreateStaff = internalAction({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
    role: roleValidator,
  },
  handler: async (ctx, args): Promise<string> => {
    try {
      await createAccount(ctx, {
        provider: "password",
        account: { id: args.email, secret: args.password },
        profile: { email: args.email, name: args.name } as never,
      });
    } catch {
      // Already exists — just reset the secret.
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: { id: args.email, secret: args.password },
      });
    }
    await ctx.runMutation(internal.users.forceRole, { email: args.email, role: args.role });
    return `Provisioned ${args.name} <${args.email}> as ${args.role}.`;
  },
});
