# Leads layout plan (Kanban vs alternatives)

Plan only. Source: industry patterns (Follow Up Boss, kvCORE, HubSpot, Salesforce, Pipedrive, Linear) applied to Atrium. No implementation in this doc.

## Verdict: hybrid

**Keep the stage board. Stop using it as the Leads home.**

Kanban is right for deals in play (VIEWING / OFFER). It is wrong as the daily desk once volume hits hundreds of enquiries. Serious brokerage CRMs already split this: queue/inbox for speed-to-lead and assign; board for pipeline picture.

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
- **Secondary: Board** (NEW / QUALIFIED / VIEWING / OFFER only; WON/LOST via Closed slice)
- Shared URL filters: `source`, `stage`, `assignee`, `q`, `view`, `slice`, `lead`
- Slices: My desk, Unassigned, Viewings, Offers, All open, Closed
- Money Map deep links stay valid

## What stays

Fuse, six stages, bulk stage/assign/merge, duplicates, CSV, Smart Match, notes, activity, schedule viewing, org channel labels.

## What changes

Home = queue; board = toggle; detail = side pane (not under the card wall); WON off default board; always-on checkboxes in queue; horizontal board scroll (no wrapped columns); richer row/card signals (assignee, next viewing, age, unassigned).

## Phases

### Phase 0 - honest board
Side pane, horizontal columns, open stages only + Closed control, column counts/values, client search, single-stage URL filter, unassigned + age on cards.

### Phase 1 - hybrid desk
Queue default, board toggle, slices by role, shared filters/pane, bulk on queue, Money Map WON lands on Closed.

### Phase 2 - manager lenses
Group-by agent/source, stale badges, next viewing from calendar, density, remember last view.

## Non-goals

Second seller pipeline, custom stages, messaging inbox, routing/ponds, AI scores, source board as Money Map replacement, Gantt, bulk delete, drag on table, native mobile app, complex saved-filter builders.

## Open decisions

1. Agent lands on My desk vs manager All open / board for the pitch login?
2. WON off the daily board, or collapsed column for demos?
3. Can every agent see the whole office, or mostly own leads?
4. Stale thresholds (proposal: NEW 1d, QUALIFIED 7d, VIEWING with no upcoming viewing)?
