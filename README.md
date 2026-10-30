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
- Formal listing brochure PDF (framed photograph, price band, specification table, OSM map, photograph page)
- Exports: formal two-page Reports PDF (executive summary, ruled tables), plus CSV for Reports, Leads and Listings (Export menu on each page)

**V1.2**
- Bulk actions on the Leads board: Select mode, move many leads to a stage, assign or unassign owners
- Duplicate detection (same phone in any format, or same email) with a review dialog and count badge
- Merge leads: pick the lead to keep; sources, notes, activity and calendar events move across and blanks are filled

**V1.4**
- Downloadable guides (Marketing > Guides): upload a PDF, publish it, share a link with campaign tags and a QR code
- Public pages (no login): guide library, guide page with a short form (name and email, phone optional, separate marketing opt-in), personal download link that keeps working
- Each request becomes a lead (new `GUIDE` source) or joins an existing one by email or phone, with a follow-up task for the guide owner
- Open or form-first per guide, views and downloads counted, request log and CSV, guide section in Reports (screen, PDF, CSV)
- Safety: private file storage, token links, honeypot, rate limits, hashed IPs, consent wording stored with each request
- Demo data: `cd api && npx tsx scripts/seed-guides.ts` (7 guides, 46 requests, a month of views)

Messaging (WhatsApp) is deferred until Meta Cloud API credentials - no mock inbox.

See `docs/PRODUCT.md` and `docs/STACK.md`.
