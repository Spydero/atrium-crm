# Jojo walkthrough: test order + leftover backlog

Condensed from the 2026-11-01 deep audit. Full detail lived in that chat; this is the working checklist.

**Do not** run `npm run db:seed` / `db:seed:demo` on the Jojo database — seed wipes every org. Keep `TESTING_ENABLED` off for Jojo. Use a separate browser profile for Ops (`:3001`).

**DB:** `Lead.lostAt` migration `20261031154500_lead_lost_at` is applied locally (schema up to date).

## Test one-by-one (owner, `:3000`)

Target data by end: ~8 listings, ~15 leads (≤5 closed in last 7d), 4 viewings, 1 guide you made, 1 shortlist, spend on 2 channels optional.

1. Auth — login as Jojo; `/register` closed
2. Settings — currency/channels; note AED still on some money UIs if you set INR
3. Listings + Map — place pin; brochure PDF
4. Add lead → fuse same phone → stages → Lost toolbar → Select/bulk → Merge
5. Calendar — complete / no-show / cancel
6. Dashboard — Outcomes (Won+Lost / Won / Lost); deep links `slice=`
7. Money Map — spend + table rates (chart rates = Phase 1, not a bug)
8. Guides — you create 1 (upload PDF) → public form → lead
9. Shortlists + Reports smoke

Guide click path and paste outline: see earlier chat / `PLAN_V1.4_GUIDES.md` (upload PDF; in-app builder = Phase E).

## Backlog (priority)

### P0 for demo
- Keep migration + Outcomes/Add-lead/Lost code with the walkthrough
- Hand-build small book; do not dump 250 history leads onto Jojo
- Ops in another browser profile

### P1 next
- Leads layout Phase 0: Open|Won|Lost URL scopes, WON off open board, horizontal cols, card caps, search (`PLAN_LEADS_LAYOUT.md`)
- Money Map Phase 1: rate chart toggles + short funnel (`PLAN_DASHBOARD_OUTCOMES.md`)
- Currency: replace remaining `formatAed` with org `currencyLabel`
- CRM team invites; Settings read-only for brokers; tighter Money spend roles

### P2 / defer
- Leads queue + pagination; Guides Phase E; Consultations V1.3; seed that doesn’t wipe; platform hygiene from `PLAN_PLATFORM_ADMIN.md`

### Non-goals (still)
Lost on New leads chart; six-stage “conversion”; Demo tools as real data; guide chapters built in CRM; broker invite from Ops.
