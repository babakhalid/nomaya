/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytics from "../analytics.js";
import type * as auditLogs from "../auditLogs.js";
import type * as auth from "../auth.js";
import type * as bookings from "../bookings.js";
import type * as calendar from "../calendar.js";
import type * as catalog from "../catalog.js";
import type * as channels from "../channels.js";
import type * as channex from "../channex.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as guestDirectory from "../guestDirectory.js";
import type * as hermes from "../hermes.js";
import type * as http from "../http.js";
import type * as inventory from "../inventory.js";
import type * as lib_access from "../lib/access.js";
import type * as payments from "../payments.js";
import type * as portal from "../portal.js";
import type * as publicBooking from "../publicBooking.js";
import type * as requests from "../requests.js";
import type * as seed from "../seed.js";
import type * as seedKymata from "../seedKymata.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  auditLogs: typeof auditLogs;
  auth: typeof auth;
  bookings: typeof bookings;
  calendar: typeof calendar;
  catalog: typeof catalog;
  channels: typeof channels;
  channex: typeof channex;
  crons: typeof crons;
  dashboard: typeof dashboard;
  guestDirectory: typeof guestDirectory;
  hermes: typeof hermes;
  http: typeof http;
  inventory: typeof inventory;
  "lib/access": typeof lib_access;
  payments: typeof payments;
  portal: typeof portal;
  publicBooking: typeof publicBooking;
  requests: typeof requests;
  seed: typeof seed;
  seedKymata: typeof seedKymata;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
