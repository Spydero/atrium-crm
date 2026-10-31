# Atrium Ops (admin)

Platform operator console only. Separate Next.js app from `web/` (the brokerage CRM).

Brokers, org owners, and org admins never use this app - they work in `web/`. Ops provisions
organizations and invites the first owner (or org admin).

```bash
cd admin
npm install
npm run dev        # http://localhost:3001
```

Env (`.env.local`, see `.env.example`):

- `NEXT_PUBLIC_API_URL` – API base, default `http://localhost:4000`
- `NEXT_PUBLIC_WEB_URL` – brokerage web app, used to build invite links
  (`{WEB}/invite/{token}`), default `http://localhost:3000`

The API must allow CORS with credentials from `http://localhost:3001`
(add it to the trusted origins for better-auth too).

## Auth

Uses the better-auth client against the API. After sign-in the session user
must carry `platformRole` (any non-empty value). Otherwise the app shows
"Not a platform operator" and offers sign-out.

## Expected API endpoints

All require a platform-operator session (401 unauthenticated, 403 otherwise).
The client is tolerant of `{ items }` / bare-array style list responses.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/platform/overview` | `{ organizations: number, pendingInvites: number, members?: number }` |
| GET | `/api/platform/organizations` | `{ organizations: [{ id, name, slug, currencyCode, defaultCity, createdAt, memberCount }] }` |
| POST | `/api/platform/organizations` | body `{ name, slug?, currencyCode, defaultCity, owner: { name, email, role: "owner" } }` → `{ organization: { id, ... }, invite? }` |
| GET | `/api/platform/organizations/:id` | org fields + `members: [{ id, name, email, role, createdAt }]` + `invites: [{ id, email, name, role, token, status, expiresAt, createdAt }]` |
| POST | `/api/platform/organizations/:id/invites` | body `{ email, name?, role: "owner" \| "admin" }` only (brokers invited from CRM) |
| GET | `/api/platform/invites` | `{ invites: [{ id, email, name, role, token, status, expiresAt, createdAt, organizationId, organizationName }] }` – pending only |

The accept URL is built client-side as `${NEXT_PUBLIC_WEB_URL}/invite/${token}`
(falls back to `acceptUrl` from the API when no token is returned).
