# Atrium — Stack & V1 decisions

Working product name: **Atrium** (rename anytime).  
UI direction: **Cove** shell; Signal-style lead drawer later (no AI yet).

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

## Auth model (V1) — Better Auth

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

**Schema:** Better Auth CLI (`npx auth generate`) adds `User`, `Session`, `Account`, `Verification`, plus Organization tables — then we add CRM models (`Listing`, `Lead`, …) in the same Prisma schema.

Docs: [Better Auth](https://www.better-auth.com/) · [Prisma adapter](https://www.better-auth.com/docs/adapters/prisma) · [Organization](https://www.better-auth.com/docs/plugins/organization)

---

## Domain modules — when

### V1.0 — Must ship (agreed)
1. Auth (Better Auth: email + password; **Google login later**)
2. App shell (Cove sidebar)
3. **Listings** — mandatory: CRUD, photos, status, beds/baths/price/area
4. Mock portal publish toggles (Bayut / PF / Dubizzle / Skyloov — fake statuses)
5. **Leads** kanban linked to listings
6. **Calendar** — in-app follow-ups / viewings / calls. **Google Calendar sync later**

### Build order
1. Scaffold `web` + `api`
2. Prisma + Better Auth
3. Login / register + protected shell
4. Listings CRUD + images
5. Leads pipeline
6. In-app calendar
7. Seed demo data

### Later (not V1.0)
- Google login, Google Calendar OAuth
- WhatsApp inbox UI, brochure PDF, deep analytics
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
Conversation / Message   — Phase 3 (mock WhatsApp)
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

Scaffold `api` + `web`, Prisma + **Better Auth**, Cove login shell — **no AI, no portals yet**.
