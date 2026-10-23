# Noor Al Salam Hotel

**فندق نور السلام**

Public website, direct booking engine, hotel PMS, housekeeping, invoices, financial ledger, and OTA / channel-manager architecture for a hotel in Saudi Arabia.

The hotel database is the source of truth for reservations, inventory, guests, rooms, housekeeping and money. Booking.com, Agoda, Trip.com, Expedia and any future channel are connections — they never own the core reservation model.

## What this system does

- Public site in English, Arabic (RTL) and Bangla
- Real availability search against PostgreSQL (not a mock widget)
- Direct booking with server-side pricing and transactional inventory locks
- Staff PMS: reservations, guests, rooms, check-in / check-out, housekeeping
- Payments, invoices and an append-only financial ledger (SAR, decimal-safe)
- Channel manager abstraction with room/rate mapping, webhooks, polling, idempotency and sync logs
- OTA commission, payout and reconciliation (only when real figures exist)
- Role-based admin: Super Admin, Hotel Manager, Receptionist, Reservation Manager, Housekeeping, Accountant

## What this system does not do

- It does **not** invent Booking.com / Agoda / Trip.com / Expedia APIs
- A channel is **never** shown as “Connected” until a provider test succeeds
- A reservation is **not** automatically a payment or an OTA payout
- It does not invent hotel awards, reviews, star ratings, an address or a phone number
- Online card payments stay as `PAY_AT_HOTEL` until a Saudi provider adapter is implemented (Moyasar / HyperPay / Tap are reserved, not faked)

## Requirements

- Node.js 20.9+
- PostgreSQL 16+ (or `npm run db:local` for an embedded local server)
- npm

## Installation

```bash
npm install
cp .env.example .env
```

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Put them in `.env` as `AUTH_SECRET` and `CREDENTIAL_ENCRYPTION_KEY`.

## Database

Without a local PostgreSQL install:

```bash
npm run db:local
```

Then, in another terminal:

```bash
npx prisma migrate deploy
npm run db:seed
npm run dev
```

- Public site: [http://localhost:3000](http://localhost:3000)
- Staff PMS: [http://localhost:3000/admin](http://localhost:3000/admin)

Demo staff (development only, fictional):

| Email | Role |
| --- | --- |
| admin@nooralsalam.local | Super Admin |
| manager@nooralsalam.local | Hotel Manager |
| reception@nooralsalam.local | Receptionist |
| reservations@nooralsalam.local | Reservation Manager |
| housekeeping@nooralsalam.local | Housekeeping |
| accounts@nooralsalam.local | Accountant |

Password: value of `SEED_DEMO_PASSWORD` (default `ChangeMe-Demo-123`). Change it before any real use.

Production seed (`NODE_ENV=production`) creates roles, an empty hotel record and **unconnected** channels only. It does not create demo people.

### Stores and housekeeping photographs

Inventory quantities live on `InventoryBalance`. The append-only `InventoryMovement` ledger is the history. Valuation is weighted average, in SAR:

`new cost = (on hand × old cost + received quantity × receipt cost) / (on hand + received quantity)`

Issues, transfers, and housekeeping consumption keep the current average. An approved purchase order does not increase stock until the goods are received. Transfers sit in an in-transit location so the same quantity is not counted in two stores.

Housekeeping staff upload one photograph for each mandatory category. The bytes are stored under `PRIVATE_STORAGE_DIR` (or `.data/private`). PostgreSQL stores only the storage key and metadata. Images are served through an authenticated route, not a public URL. A dirty or cleaning room becomes available only after a manager approves the inspection. Occupied, reserved, maintenance, and out-of-order rooms are left unchanged. Supplies recorded on the task are deducted once, at submission.

## Environment

See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL |
| `AUTH_SECRET` | Signed staff sessions (≥ 32 characters) |
| `CREDENTIAL_ENCRYPTION_KEY` | AES-256-GCM key for OTA credentials (32 bytes, base64) |
| `NEXT_PUBLIC_SITE_URL` | Canonical public URL |
| `PAYMENT_PROVIDER` | `none` until a real adapter exists |
| `CHANNEL_MANAGER` | `none` or `mock` (mock is refused in production) |
| `EMAIL_PROVIDER` | `console` or your adapter |
| `JOBS_SECRET` | Protects `/api/jobs/run` |
| `SEED_DEMO_PASSWORD` | Demo staff password |
| `PRIVATE_STORAGE_DIR` | Private directory for housekeeping and inventory images (default `.data/private`) |
| `HOUSEKEEPING_PHOTO_MAX_BYTES` | Maximum photograph size (default 8 MB) |
| `HOUSEKEEPING_PHOTO_RETENTION_DAYS` | How long room photographs are kept (default 365; `0` keeps them) |

Never put live OTA secrets in `.env`. Enter them in **Admin → Channels** (encrypted at rest, never sent to the browser).

## Scripts

| Command | Action |
| --- | --- |
| `npm run dev` | Next.js development server |
| `npm run build` | Prisma generate + production build |
| `npm run start` | Production server |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Vitest (availability, concurrency, finance, channels, auth) |
| `npm run test:e2e` | Playwright (when configured) |
| `npm run db:migrate` | Prisma migrate (dev) |
| `npm run db:deploy` | Prisma migrate (production) |
| `npm run db:seed` | Seed |
| `npm run worker` | Process due channel jobs / expired holds |

## Architecture

```
Public website → Booking engine → Central reservation system
                                      ↓
                              Central inventory
                                      ↓
                         Hotel PMS + financial ledger

Central inventory → Channel manager → Booking.com / Agoda / Trip.com / Expedia / others
```

Important paths:

- `frontend/src/app/(site)` — public website
- `frontend/src/app/(admin)/admin` — PMS
- `backend/src/server/services` — business rules (availability, reservations, money, channels)
- `backend/src/integrations/channels` — provider adapters (unimplemented OTAs fail loudly)
- `backend/src/integrations/payments` — payment provider seam
- `backend/prisma/schema.prisma` — source-of-truth data model

## OTA / channel manager

Individual hotels typically cannot call Booking.com Connectivity APIs directly. The supported path is:

1. Connect an approved channel manager in the OTA extranet
2. Connect that manager to this PMS under **Admin → Channels → External channel manager**
3. Map internal room types and rate plans to the manager’s IDs
4. Implement the connector against the **current official documentation** after credentials are approved

Until then, the Channels page shows setup steps and official documentation links. Test Connection will report **not implemented** — that is correct, not a fake success.

Inbound webhooks: `POST /api/channels/[channel]/webhook`  
Signature verification is mandatory. Repeated events are idempotent (`channel` + `externalEventId`).

Scheduled work: `POST /api/jobs/run` with `Authorization: Bearer $JOBS_SECRET`, or `npm run worker`.

## Payments

- Guest bookings can use **Pay at hotel** when no online provider is configured
- Staff record cash / card / bank against a reservation
- OTA-collected money is **not** posted as hotel cash; it arrives later as an OTA payout
- If an OTA booking has no payment data: reservation `CONFIRMED`, payment `INFORMATION_NOT_PROVIDED`

## Localization

- Currency: SAR / ر.س
- Timezone: Asia/Riyadh
- Dates: Gregorian (optional Hijri display in settings)
- Languages: `en` (default, no prefix), `/ar`, `/bn`

## Production checklist

1. Set real secrets; never commit `.env`
2. `npx prisma migrate deploy`
3. `npm run db:seed` (production mode — no demo guests)
4. Replace example room / facility copy in admin
5. Configure tax / VAT for the hotel (do not assume 15%)
6. Enter the real address, phone and WhatsApp only when known
7. Configure email
8. Connect a certified channel manager before advertising OTA sync
9. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
10. Point `NEXT_PUBLIC_SITE_URL` at the live domain

## License

Private — Noor Al Salam Hotel.
