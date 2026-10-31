# Platform admin + real accounts

Control plane = Ops (`admin/` :3001). Application plane = CRM (`web/` :3000). Same Postgres + Express API. Brokers never use Ops.

Informed by WorkOS invite-only signup, Auth0 org invitations, AWS control-plane vs application-plane, and [Grok provisioning plan](d7f0a214-d079-4619-9f62-a1f87cc5ec36).

## Roles

| Layer | Roles | App |
|---|---|---|
| Platform | `operator` (`super` optional later) | Ops only |
| Brokerage | `owner` > `admin` > `broker` | CRM only |

Platform invites **owner** (and optionally **admin**). Brokers are invited from the CRM by owner/admin (team Settings - not shipped yet).

## Shipped

- Migration `20261031124641_platform_admin`: `platformRole`, `disabledAt`, org `status`/`suspendedAt`, `Invitation`, `AccessRequest` (table only, unused UI)
- `disableSignUp: true`, bootstrap org closed
- `/api/platform/*` (overview, orgs, invites owner/admin only), `/api/invites/*` accept on CRM
- Admin app on :3001 (AuthGate requires `platformRole`)
- CRM `/invite/[token]`, register page closed
- Seed: `platform@atrium.demo` + demo CRM users (still wipe seed - see Next)
- Settings channel writes require org admin+

## Next (priority)

1. **CRM Team settings** - owner/admin invite/resend/revoke brokers (and admins; only owner can mint owners)
2. **Suspend for real** - wipe brokerage sessions on suspend; block CRM + public guides/shortlists when `SUSPENDED`
3. **Invite token hygiene** - store hash only; return accept URL once on create/resend; drop raw token from list APIs
4. **Seed split** - `db:seed` no wipe / empty product path; `db:seed:demo` behind `ALLOW_DEMO_SEED`; `npm run platform:operator` for first real operator
5. **PlatformAudit** - append-only create/suspend/invite/revoke
6. **Broader role gates** - spend writes, full CRM routers, suspend-aware `requireBrokerage`
7. **AccessRequest** - leave unwired until there is a real sales intake process (do not build approval UI yet)

## Explicit non-goals (Ops)

- Leads, Money Map, listings, calendar, guide files, impersonation
- Inviting brokers from Ops
- Better Auth organization/admin plugins (would clash with `User.role` as brokerage role)

## Local run

```bash
# API :4000, CRM :3000, Ops :3001
# Ops: platform@atrium.demo / demo1234
# CRM: owner@ / manager@ / agent@ atrium.demo / demo1234
```

**Shared session cookie:** CRM and Ops both talk to Better Auth on `:4000`, so one browser profile = one session. Signing into Ops as `platform@` knocks out the brokerage CRM session (operators have `organizationId: null`). Use a separate browser profile / incognito for Ops, or sign back into CRM after Ops work. Proper fix later: separate cookie prefix or auth host for the control plane.

## Auth hardening (done / partial)

- `requireAuth` rehydrates `organizationId` / role / `platformRole` from Postgres each request (invite/provision must not depend on a stale session snapshot)
- Listing/lead detail routes reject missing org before querying (never `organizationId ?? undefined`, which dropped the tenant filter)
- CRM `/app` layout blocks operator-only and org-less sessions with an explicit message
