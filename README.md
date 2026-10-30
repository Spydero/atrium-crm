# Atrium - Brokerage OS (V1.1)

Internal CRM for real-estate brokerages: **listings**, **leads** (with Lead Fuse), **calendar / Viewing OS**, **Money Map**, **Reports**, **Settings**, maps/places, and **client shortlist links**.

## Stack

- `web/` - Next.js (App Router) + Tailwind - Cove UI
- `api/` - Express + Better Auth + Prisma + PostgreSQL

## Quick start

### 1. Database

Postgres running locally with database `atrium`:

```bash
createdb atrium   # if needed
```

### 2. API

```bash
cd api
cp .env.example .env   # or use existing .env
npm install
npx prisma db push
npm run db:seed
npm run dev            # http://localhost:4000
```

### 3. Web

```bash
cd web
npm install
npm run dev            # http://localhost:3000
```

### Demo login

- Email: `agent@atrium.demo`
- Password: `demo1234`

Also: `owner@atrium.demo`, `manager@atrium.demo` (same password).

## Features

**V1.0**
- Auth (Better Auth email/password)
- Listings CRUD + filters + mock portal publish
- Leads kanban + notes/activity + **Lead Fuse** + simulate portal lead + Smart Match
- Calendar with viewing complete + feedback
- Money Map (source ROI + at-risk value)
- Public shortlist page `/s/[token]`

**V1.1**
- Grouped nav: Work / Inventory / Insights / Admin
- Org Settings (currency, default city, enabled portals)
- Real place search (Nominatim) + Leaflet/OSM maps (listing detail, inventory Map page, shortlists)
- Date-range filters on Dashboard and Reports
- Reports dashboard
- Designed listing brochure PDF (hero photo, spec cards, OSM location map)
- Exports: designed Reports PDF, plus CSV for Reports, Leads and Listings (Export menu on each page)

Messaging (WhatsApp) is deferred until Meta Cloud API credentials - no mock inbox.

See `docs/PRODUCT.md` and `docs/STACK.md`.
