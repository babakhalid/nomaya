# Kymata Surf Morocco — PMS

Get Salty's property-management system (fork of the Nomaya PMS): channel-manager-style calendar
(rooms **and** dorm beds), booking channels hub (Channex.io-shaped, sandboxed),
payment tracking + accounting exports, guest portal, statistics dashboard and a
full audit log.

## Stack

- **Vite 8 + React 19 + TypeScript**, React Router 8
- **Convex** (database, server functions, real-time sync) + **Convex Auth** (email/password)
- **Tailwind CSS v4** (custom sand/ocean brand tokens in `src/index.css`)
- **GSAP** (`@gsap/react`) for motion, **Recharts** for analytics

## Run it

```bash
npm install

# Terminal 1 — Convex backend sync (cloud project: nomaya-data)
npx convex dev

# Terminal 2 — frontend
npm run dev
```

Data lives in **Convex cloud** — team `baba-khalid`, project `get-salty`
(eu-west-1). Dashboard: https://dashboard.convex.dev

| Environment | Convex deployment | Frontend |
| --- | --- | --- |
| dev | `graceful-dotterel-332` | http://localhost:5173+ |
| production | `harmless-llama-517` | **https://getsalty.vercel.app** |

GitHub: https://github.com/babakhalid/get-salty · Vercel project: `getsalty`
Convex project: `get-salty` (team `baba-khalid`)

The **first account created on the sign-in page becomes admin**; everyone after
starts as `crew` (promote them in Settings → Team).

Deployment env vars (set automatically by `npx @convex-dev/auth`):
`JWT_PRIVATE_KEY`, `JWKS`, plus `SITE_URL` (the frontend origin — update this
when deploying to Vercel).

For a fresh database, seed demo data with `npx convex run seed:run`.
A snapshot of the original local data is kept in `local-backup.zip`
(restore with `npx convex import local-backup.zip`).

### Releasing changes

```bash
npx convex deploy -y        # push backend to the prod deployment
npx vercel deploy --prod    # push frontend (or connect the GitHub repo in Vercel for auto-deploys)
git push                    # keep the repo in sync
```

Vercel prod env: `VITE_CONVEX_URL=https://harmless-llama-517.eu-west-1.convex.cloud`.
Convex prod env: `JWT_PRIVATE_KEY`, `JWKS`, `HERMES_API_KEY`, `SITE_URL=https://getsalty.vercel.app`.
Hermes production endpoint: `https://harmless-llama-517.eu-west-1.convex.site/hermes/verify`.

## Structure

```
convex/
  schema.ts        # all tables (rooms, beds, bookings, channels, payments…)
  lib/access.ts    # requireUser / requireRole / logAudit — every mutation logs
  bookings.ts      # create/update, overlap checks, line items, guest requests
  calendar.ts      # grid rows (private rooms + dorm beds) + day briefing
  channels.ts      # mock Channex adapter: inbox, accept→booking, reject
  payments.ts      # payments, expenses, outstanding balances
  portal.ts        # public guest portal (token-scoped, no auth)
  analytics.ts     # report + CSV export data
  dashboard.ts     # morning-briefing overview
  seed.ts          # demo data (idempotent)
src/
  pages/           # SignIn, Dashboard, Calendar, Channels, Analytics, Logs,
                   # Settings, GuestPortal
  components/      # ui primitives, AppShell, calendar drawers
```

## Roles

| Role    | Access                                              |
| ------- | --------------------------------------------------- |
| admin   | everything + team management                        |
| manager | all operations, settings, channels, analytics, audit log |
| crew    | dashboard + calendar, check-in/out, record payments |

Enforced **server-side** in every Convex function (`convex/lib/access.ts`).

## Channel manager

`channelRequests.payload` mirrors the Channex.io booking-webhook shape. To go
live: register a webhook route in `convex/http.ts` that inserts into
`channelRequests`, and push availability via the Channex REST API. The inbox,
accept/reject flow and calendar don't change.

## Hermes agent integration

External messaging agents (WhatsApp/phone bot) verify guests by **phone
number + reservation code** before acting on a booking. Every booking gets a
short code like `TSH-4F7K2`, shown in the booking drawer, the guest portal,
and the self-service confirmation screen.

```
POST https://<deployment>.convex.site/hermes/verify
Headers:  x-api-key: <HERMES_API_KEY>          # npx convex env get HERMES_API_KEY
Body:     { "phone": "+212665001638", "reservationCode": "TSH-4F7K2" }
```

- Match → `{ verified: true, guest: {...}, booking: {... balance, portalToken} }`
- Mismatch / unknown / cancelled → `{ verified: false }` (nothing leaked)
- Missing or wrong key → `401`
- Phone matching is loose (last 9 digits), so `+212 6 65 00 16 38`,
  `0665001638` and `+212665001638` all match.
- Every attempt (success or failure) is written to the audit log as
  "Hermes agent".

## Guest portal

Each booking has an unguessable `portalToken` → `/guest/:token` (copy the link
from the booking drawer). Guests set surf level / allergies and order
activities or services; requests appear in the booking drawer for approval and
become billable line items.
