# Atrium - Brokerage OS (V1.1)

Internal CRM for real-estate brokerages: **listings**, **leads** (with Lead Fuse), **calendar / Viewing OS**, **Money Map**, **Reports**, **Settings**, maps/places, and **client shortlist links**.

## Stack

- `web/` - Next.js (App Router) + Tailwind - Cove UI (brokerage CRM)
- `admin/` - Next.js Atrium Ops (platform operators) on port 3001
- `api/` - Express + Better Auth + Prisma + PostgreSQL

Accounts are **invite-only**. Public self-signup is disabled. Platform operators provision brokerages in Ops.

## Quick start

### 1. Database

Postgres running locally with database `atrium`:

```bash
createdb atrium   # if needed
```

### 2. API

```bash
cd api
cp .env.example .env   # set CLIENT_ORIGIN=3000 and ADMIN_ORIGIN=3001
npm install
npm run db:deploy      # applies migrations, backs up first, logs to prisma/apply-log.md
npm run db:seed
npm run dev            # http://localhost:4000
```

### 3. Web (CRM)

```bash
cd web
npm install
npm run dev            # http://localhost:3000
```

### 4. Admin (Ops)

```bash
cd admin
npm install
npm run dev            # http://localhost:3001
```

### Logins (local seed)

| App | Email | Password | Role |
|---|---|---|---|
| Ops `:3001` | `platform@atrium.demo` | `demo1234` | platform operator |
| CRM `:3000` | `owner@atrium.demo` | `demo1234` | brokerage owner |
| CRM | `manager@atrium.demo` | `demo1234` | admin |
| CRM | `agent@atrium.demo` | `demo1234` | broker |

**Ops (`:3001`) is for platform operators only** - provision brokerages and invite the first owner.
Brokers, org admins, and owners work only in the CRM (`:3000`). Invite links always open on the CRM.

## Features

**V1.0**
- Auth (Better Auth email/password)
- Listings CRUD + filters + portal publish status tracking
- Leads kanban + notes/activity + **Lead Fuse** + log enquiry + Smart Match
- Calendar with viewing complete + feedback
- Money Map: org-channel ROI with date range, conversion rates, cost per viewing / win, decision cues (Scale / Cut / Review), chart, editable entered spend, and at-risk deal value
- Calendar depth: edit, delete, free-text notes, cancel reasons, Done / No-show / Cancelled for every event type, clear month labels and filters
- Public shortlist page `/s/[token]`

**V1.1**
- Grouped nav: Work / Inventory / Insights / Admin
- Org Settings (currency, default city, org channel catalog)
- Real place search (Nominatim) + Leaflet/OSM maps (listing detail, inventory Map page, shortlists)
- Date-range filters on Dashboard and Reports
- Reports dashboard
- Formal listing brochure PDF (framed photograph, price band, specification table, OSM map, photograph page)
- Exports: formal two-page Reports PDF (executive summary, ruled tables), plus CSV for Reports, Leads and Listings (Export menu on each page)

**V1.2**
- Bulk actions on the Leads board: Select mode, move many leads to a stage, assign or unassign owners
- Duplicate detection (same phone in any format, or same email) with a review dialog and count badge
- Merge leads: pick the lead to keep; sources, notes, activity and calendar events move across and blanks are filled

**V1.4**
- Downloadable guides (Marketing > Guides): upload a PDF, publish it, share a link with campaign tags and a QR code; search, filter, sort, see a trend chart and change vs the previous period
- Public pages (no login): guide library, guide page with a short form (name and email, phone optional, separate marketing opt-in), personal download link that keeps working
- Each request becomes a lead (new `GUIDE` source) or joins an existing one by email or phone, with a follow-up task for the guide owner
- Open or form-first per guide, views and downloads counted, request log and CSV, guide section in Reports (screen, PDF, CSV)
- Safety: private file storage, token links, honeypot, rate limits, hashed IPs, consent wording stored with each request
- Demo data: `cd api && npx tsx scripts/seed-guides.ts` (7 guides, 46 requests, a month of views)

**V1.5**
- Dashboard trend chart you can explore: New leads, Viewings or Deals won; group by Day, Week or Month; ranges 7d, 14d, 30d, 90d, 6m, 1y or custom
- Day / Week / Month buttons are always clickable: picking one on a range that does not suit it moves the date filter to one that does (Week gives 90d, Month gives 1y, Day gives 30d)
- Sort by Date, Highest or Lowest (ranking view)
- Compare to the previous period (change, percentage and a comparison line), average line, peak and active periods
- Hover any bar for the date span, share of the period, running total, change vs previous, and a source or outcome breakdown; click a bar to pin it
- Demo history: `cd api && npx tsx scripts/seed-history.ts` (about 250 leads, viewings and deals over 12 months)

**Database migrations**
- Every schema change is a Prisma migration in `api/prisma/migrations/` (never `db push`)
- `api/prisma/CHANGELOG.md` explains each change (purpose, tables, data impact, risk, reversal)
- `api/prisma/apply-log.md` records every run: when, who, commit, database, result
- `npm run db:status` (drift check), `npm run db:history` (what the database recorded), `npm run db:deploy`, `npm run db:new -- name`

Messaging (WhatsApp) is deferred until Meta Cloud API credentials - no mock inbox.

See `docs/PRODUCT.md` and `docs/STACK.md`.
