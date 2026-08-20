export type Role = "admin" | "manager" | "marketing" | "host" | "crew";

export type Page =
  | "dashboard"
  | "calendar"
  | "guests"
  | "requests"
  | "channels"
  | "analytics"
  | "team"
  | "settings"
  | "logs";

/**
 * Which roles may open which page. Single source of truth for the sidebar
 * and the route guards. Not hierarchical: marketing sees Analytics but not
 * Settings; host sees neither.
 */
export const PAGE_ACCESS: Record<Page, Role[]> = {
  dashboard: ["admin", "manager", "marketing", "host", "crew"],
  calendar: ["admin", "manager", "marketing", "host", "crew"],
  guests: ["admin", "manager", "marketing", "host", "crew"],
  requests: ["admin", "manager", "marketing", "host", "crew"],
  channels: ["admin", "manager", "marketing"],
  analytics: ["admin", "manager", "marketing"],
  team: ["admin", "manager"],
  settings: ["admin", "manager"],
  logs: ["admin", "manager"],
};

export function canAccessPage(role: Role | undefined, page: Page): boolean {
  return !!role && PAGE_ACCESS[page].includes(role);
}

/** Financial figures are hidden from host and crew. */
export function canSeeRevenue(role: Role | undefined): boolean {
  return role === "admin" || role === "manager" || role === "marketing";
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  marketing: "Marketing",
  host: "Host",
  crew: "Crew",
};
