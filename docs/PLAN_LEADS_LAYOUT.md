# Leads layout plan (Kanban vs alternatives)

Plan only. Source: industry patterns (Follow Up Boss, kvCORE, HubSpot, Salesforce, Pipedrive, Linear) applied to Atrium. Refined 2026-10-31 after Lost-discoverability + volume review.

## Verdict: hybrid

**Keep the stage board. Stop using it as the Leads home.**

Kanban is right for deals in play (VIEWING / OFFER). It is wrong as the daily desk once volume hits hundreds of enquiries. Serious brokerage CRMs already split this: queue/inbox for speed-to-lead and assign; board for pipeline picture. Salesforce caps Kanban around ~200 records; Pipedrive/HubSpot treat list as the scale surface and board as a view toggle.

## Ranked alternatives

| Rank | Layout | Role |
|---|---|---|
| 1 | Split list + detail | Daily agent desk |
| 2 | Table + filters | Manager ops / Money Map slices |
| 3 | Stage board (open stages only) | Standup / demo / stuck deals |
| 4 | Density modes on the queue | Scan vs work |
| 5 | Board by agent | Occasional load check |
| 6 | Board by source | Rare (Money Map already answers this) |
| 7 | Page-level timeline | Do not build as Leads home |

## Target IA

- One route: `/app/leads`
- **Default: Queue** (table + side detail pane)
- **Secondary: Board** (NEW / QUALIFIED / VIEWING / OFFER only)
- Persistent scope: **Open | Won | Lost** (or Open | Closed with Won/Lost secondary), URL-backed (`slice=`), always counted — never a buried text link or below-the-fold column
- Shared URL filters: `source`, `stage`, `assignee`, `q`, `view`, `slice`, `lead`
- Slices: My desk, Unassigned, Viewings, Offers, All open, Won, Lost (Closed = Won+Lost)
- Money Map deep links stay valid (`slice=closed&stage=WON`)

## What stays

Fuse, six stages, bulk stage/assign/merge, duplicates, CSV, Smart Match, notes, activity, schedule viewing, org channel labels.

## What changes

Home = queue; board = toggle; detail = side pane (not under the card wall); WON/LOST off the open board; always-on checkboxes in queue; horizontal board scroll (no wrapped columns); richer row/card signals (assignee, next viewing, age, unassigned); bounded cards per column with true counts + “View all”.

## Scale reality (current board loads all leads client-side)

| Volume | Board as home | Direction |
|---|---|---|
| ≤50 | OK once open-only + horizontal + Lost/Won scopes | Phase 0 |
| ~200 | NEW column becomes a wall; wrap + detail far away | Cap columns; queue preferred |
| 1000+ | Payload + DOM + DnD break | Server pagination + queue default (Phase 1 gate) |

## Phases

### Shipped interim (2026-10-31)
Toolbar **Lost N** button + capped Lost strip above the board + empty-state banner. Pipeline count excludes LOST. Not the final Closed IA — still local `showLost`, not URL `slice`.

### Phase 0 - honest board (next)
1. Replace Lost-only toggle with persistent **Open N | Won N | Lost N** (URL `slice=`). Selecting Lost/Won **replaces** the board contents — no second strip below the fold.
2. Open board = NEW / QUALIFIED / VIEWING / OFFER only (WON off daily board).
3. Horizontal scroll columns (fixed ~280px width); no wrap grid.
4. Cap ~20–25 cards per column; header true count; footer “Showing n of N · View all” → filtered queue/list.
5. Client search (name/phone/listing); unassigned + age on cards.
6. Explicit “Select all shown” when capped; toast on move-to-Lost with “View Lost”.
7. Side pane can wait for Phase 1 if scope is tight — density + scopes land first.

### Phase 1 - hybrid desk
Queue default, board toggle, role slices, shared filters/pane, bulk on queue, Money Map WON → Closed. **API:** `GET /api/leads` gains `limit`/`cursor`, `slice`/`stage`/`q`/`assignee`, plus counts meta (`open`, `won`, `lost`, `byStage`). Patch local state after stage moves — do not refetch entire org list. Gate for any claim past ~300 leads.

### Phase 2 - manager lenses
Group-by agent/source, stale badges, next viewing from calendar, queue density modes, remember last view. Age-based archive for very old closed records (load on demand), not soft-delete.

## Non-goals

Second seller pipeline, custom stages, messaging inbox, routing/ponds, AI scores, source board as Money Map replacement, Gantt, bulk delete, drag on table, native mobile app, complex saved-filter builders, virtualized infinite kanban (cap + link to queue instead), Lost as a permanent 6th open column, client-memo tricks sold as “scale.”

## Open decisions

1. Agent lands on My desk vs manager All open / board for the pitch login?
2. Closed default: show Won+Lost together, or Won vs Lost as peer tabs? (Research lean: peer Open | Won | Lost.)
3. Can every agent see the whole office, or mostly own leads?
4. Stale thresholds (proposal: NEW 1d, QUALIFIED 7d, VIEWING with no upcoming viewing)?
5. Demo org size target: 50 / 200 / 1000+? Sets urgency of Phase 1 API pagination.
