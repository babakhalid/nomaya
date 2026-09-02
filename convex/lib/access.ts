import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type Role = "admin" | "manager" | "marketing" | "host" | "crew";

// Rank gates manager/admin-only mutations. host & marketing are operational
// (rank 0, like crew) — their extra reach is page access, not write power.
const ROLE_RANK: Record<Role, number> = {
  crew: 0,
  host: 0,
  marketing: 0,
  manager: 1,
  admin: 2,
};

// Financial figures (revenue, balances) are hidden from roles without a
// money mandate: host and crew. admin/manager/marketing see them.
export function canSeeRevenue(role: Role | undefined): boolean {
  return role === "admin" || role === "manager" || role === "marketing";
}

export async function requireUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not signed in");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User not found");
  if (user.active === false) throw new Error("Account deactivated");
  return user;
}

export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  minimum: Role,
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  const role = (user.role ?? "crew") as Role;
  if (ROLE_RANK[role] < ROLE_RANK[minimum]) {
    throw new Error(`Requires ${minimum} access`);
  }
  return user;
}

/**
 * Every mutation records what happened here. `summary` is the line shown in
 * the admin log; before/after snapshots power the diff view.
 */
export async function logAudit(
  ctx: MutationCtx,
  actor: Doc<"users"> | null,
  entry: {
    action: string;
    entity: string;
    entityId?: string;
    summary: string;
    before?: unknown;
    after?: unknown;
  },
) {
  await ctx.db.insert("auditLogs", {
    actorId: actor?._id as Id<"users"> | undefined,
    actorName: actor?.name ?? actor?.email ?? "System",
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    summary: entry.summary,
    before: entry.before,
    after: entry.after,
  });
}

export function generatePortalToken(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let token = "";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  for (const b of bytes) token += alphabet[b % alphabet.length];
  return token;
}

/** Short reservation code guests can read out loud: AZ-4F7K2 */
export function generateReservationCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
  let code = "";
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return `AZ-${code}`;
}

/** Compare phone numbers loosely: digits only, match on the last 9. */
export function phonesMatch(a: string, b: string): boolean {
  const digits = (s: string) => s.replace(/\D/g, "");
  const da = digits(a);
  const db = digits(b);
  if (da.length < 8 || db.length < 8) return false;
  return da.slice(-9) === db.slice(-9);
}
