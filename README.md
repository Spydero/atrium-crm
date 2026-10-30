# Atrium - Brokerage OS (V1)

Internal CRM for real-estate brokerages: **listings**, **leads** (with Lead Fuse), **calendar / Viewing OS**, **Money Map**, and **client shortlist links**.

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

## V1 features

- Auth (Better Auth email/password)
- Listings CRUD + filters + mock portal publish (Bayut / PF / Dubizzle / Skyloov)
- Leads kanban + notes/activity + **Lead Fuse** + simulate portal lead + Smart Match
- Calendar with viewing complete + feedback
- Money Map (source ROI + at-risk AED)
- Public shortlist page `/s/[token]`

See `docs/PRODUCT.md` and `docs/STACK.md`.
