# Atrium - Stack & V1 decisions

Working product name: **Atrium** (rename anytime).  
UI: dark shell + gulf accent (evolving). Signal-style lead drawer later (no AI yet).  
**Market: dynamic / org-configured. Not Dubai-only.** UAE names in seed are demo data only.

---

## Confirmed stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | **Next.js 15** (App Router) + TypeScript | Your stack; SSR/marketing + app shell |
| UI | **Tailwind CSS** + CSS variables (Cove tokens) | Fast, controllable; no heavy UI kit |
| Icons | **lucide-react** | Clean outline icons |
| Charts (KPI strip) | **recharts** | Lightweight for V1 metrics |
| Backend API | **Express** + TypeScript | Your stack; clear separation from Next |
| ORM | **Prisma** | Your stack |
| Database | **PostgreSQL** | Prisma target |
| Auth | **Better Auth** + Prisma adapter | Your preference; sessions in Postgres |
| Auth plugins | `emailAndPassword`, **organization** | Brokerage + member roles |
| Validation | **Zod** | Shared request/body schemas |
| File uploads | **Multer** → local `/uploads` (dev); S3-compatible later | Listings photos for showcase |
| PDF brochures | Later (jsPDF / @react-pdf) | Not V1.0 day one |
| Monorepo layout | **Two folders**: `apps/web` (Next), `apps/api` (Express) | Clear boundaries; or `web/` + `api/` at root |

Optional later: Redis, queues, S3, Resend/email, **Google OAuth login**, **Google Calendar OAuth**, Better Auth social providers.

---

## What we are **not** using in V1

| Thing | Reason |
|-------|--------|
| AI / LLM / transcription / translation agent | Explicitly last phase |
| Real Bayut / PF / WhatsApp / Meta APIs | Mock adapters only |
| Hand-rolled JWT / Clerk / Auth0 / NextAuth | Better Auth replaces these |
| Social login (Google etc.) | Email + password first; add later |
| Native mobile apps | Responsive web / PWA later |
| GraphQL | REST is enough |
| Shadcn/Radix as a hard dependency | Can add pieces later; Cove is custom |
| Dark mode | Cove is light-first |

---

## Auth model (V1) - Better Auth

**Where it lives:** on **Express** (`toNodeHandler(auth)` at `/api/auth/*`), sharing the same Prisma + Postgres as the CRM API. Next is the client only.

| Piece | Choice |
|-------|--------|
| Library | `better-auth` |
| Adapter | Prisma → PostgreSQL |
| Methods | Email + password (**Google login later**) |
| Orgs | `organization()` plugin = brokerage |
| Roles | Org member roles: `owner` / `admin` / `member` mapped as **ADMIN / MANAGER / AGENT** (or custom roles via org plugin) |
| Client | `better-auth/react` in Next, `baseURL` → Express |
| Protect CRM routes | Express middleware: `auth.api.getSession({ headers })` |
| Cookies | Cross-origin: Express CORS `credentials: true` + `trustedOrigins` including `http://localhost:3000` |

**Flow**
1. Sign up / sign in from Next → Better Auth on Express  
2. Session cookie set (httpOnly)  
3. Next app shell checks session (client or server via `authClient.getSession`)  
4. CRM calls (`/api/listings`, `/api/leads`) send cookies; Express rejects if no session  

**Schema:** Better Auth CLI (`npx auth generate`) adds `User`, `Session`, `Account`, `Verification`, plus Organization tables - then we add CRM models (`Listing`, `Lead`, …) in the same Prisma schema.

Docs: [Better Auth](https://www.better-auth.com/) · [Prisma adapter](https://www.better-auth.com/docs/adapters/prisma) · [Organization](https://www.better-auth.com/docs/plugins/organization)

---

## Domain modules - when

### Market config (direction)
- Per-org settings: currency, default city/regions, portal catalog, lead sources  
- Portals as data/adapters, not hardwired product features  
- Seed packs (e.g. `demo-uae.json`, `demo-india.json`) optional for demos  

### V1.0 - Must ship (agreed)
1. Auth (Better Auth: email + password; **Google login later**)
2. App shell
3. **Listings** - mandatory: CRUD, photos, status, beds/baths/price/area
4. Mock portal publish (org-configured portal list; seed may show sample portals)
5. **Leads** kanban linked to listings
6. **Calendar** - in-app follow-ups / viewings / calls. **Google Calendar sync later**

### Build order
1. Scaffold `web` + `api`
2. Prisma + Better Auth
3. Login / register + protected shell
4. Listings CRUD + images
5. Leads pipeline
6. In-app calendar
7. Seed demo data

### V1.1 - Docs, analytics, places + maps
1. Grouped AppShell nav (Work / Inventory / Insights / Admin)
2. Org settings (currency, default city, enabled portals)
3. Nominatim places search + listing lat/lng; Leaflet maps
4. Reports aggregates API + `/app/reports`
5. Listing brochure PDF (`pdfkit`)

### V1.2 - Bulk actions + duplicate merge
1. `GET /api/leads/agents`, `GET /api/leads/duplicates`, `GET /api/leads/compare?ids=`
2. `POST /api/leads/bulk` (stage, assign, unassign) and `POST /api/leads/merge`, all before `/:id` routes
3. Pure rules in `api/src/lib/leadTools.ts` (unit tested); merge runs in one Prisma transaction
4. UI: `LeadDuplicates.tsx` dialogs (portaled to body), Select mode on `/app/leads`
5. Tests: `npm test` in `api` (unit + integration, needs the API running and seeded); browser test `web/scripts/bulk-merge-ui-test.mjs`

### V1.4 - Downloadable guides
1. Prisma: `Guide`, `GuideRequest` (personal token, consent record, campaign tags), `GuideDailyStat` (views and open downloads, no personal data); `Lead.phone` is now optional; `LeadSource.GUIDE`; org `privacyUrl`, `licenseLabel`, `licenseNumber`
2. Private storage: PDFs live in `api/storage/guides` (git ignored, never served statically). Only `GET /api/public/guide-files/:token` and `GET /api/public/guides/:org/:guide/file` (open guides) stream them
3. Public API (`/api/public`, no auth, org from the URL slug): guide library, guide page, view counter, request form, thank-you data, downloads
4. Admin API (`/api/guides`): list with funnel stats, create, edit, status, PDF and cover upload, request log, CSV
5. `recordGuideRequest` (`guideService.ts`): one transaction that finds or creates the lead, logs source and activity, stores the request and consent, and schedules a next business day follow-up
6. Pure helpers in `guideTools.ts` (slugs, tokens, PDF and image checks, rate limiter, channel names); funnel maths in `guideStats.ts`, reused by Reports
7. Web: `/app/guides`, `/app/guides/[id]`, public `/guides/[org]`, `/guides/[org]/[guide]`, personal link `/g/[token]`
8. Tests: `api/tests/guideTools.test.ts` (unit), `api/tests/guides.test.ts` (integration), browser test `web/scripts/guides-ui-test.mjs`

### V1.5 - Interactive dashboard trends
1. `GET /api/dashboard/trend?range|from|to&metric=leads|viewings|won&group=day|week|month&compare=1` returns buckets (label, tooltip title, count, value, previous period count, running total, current marker, breakdown) plus totals (change, average, peak, active periods)
2. Bucketing rules in `api/src/lib/trendBuckets.ts` (unit tested): day only up to 120 days, week from 14 days, month from 45 days; unavailable groupings fall back to the automatic one
3. Date presets now include 6m (180d) and 1y (365d); custom ranges are capped at 400 days
4. UI: `web/src/components/TrendChart.tsx` on the dashboard
5. Tests: `api/tests/dashboardTrend.test.ts`, browser test `web/scripts/trend-ui-test.mjs`

### Later (after V1.5)
- Google login, Google Calendar OAuth
- WhatsApp via Meta Cloud API only (no mock inbox)
- AI agent (last)

---

## Suggested Prisma models (V1 foundation → core)

```
# Better Auth (generated)
User, Session, Account, Verification
Organization, Member, Invitation   # org plugin

# CRM (ours)
Listing
ListingPortalStatus (portal, status, externalId?)
Lead (stage, source, listingId?, assignedToId?)
LeadNote
ActivityEvent (type, body, actorId, leadId)
FollowUp (dueAt, leadId, done)
Conversation / Message   - Phase 3 (mock WhatsApp)
```

---

## Env vars (planned)

```
# api
DATABASE_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:4000
CLIENT_ORIGIN=http://localhost:3000
PORT=4000

# web
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## Local run (target)

```
api  →  http://localhost:4000   # Better Auth + CRM REST
web  →  http://localhost:3000
```

Postgres via Docker or local install.

---

## Immediate next task

Scaffold `api` + `web`, Prisma + **Better Auth**, Cove login shell - **no AI, no portals yet**.
