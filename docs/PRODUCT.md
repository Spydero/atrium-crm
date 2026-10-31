# Atrium - Product goal

**Product name: Atrium**  
Showcase / portfolio demo of a **market-agnostic** brokerage OS.  
Inspiration only: products like Ruby CRM. **Not a Dubai clone.** Location, currency, portals, and labels come from org config, not from the product’s DNA.  
Integration stance: own the core, rent the pipes (see `docs/INTEGRATIONS.md`).

---

## Market stance: dynamic, not Dubai-only

Atrium is a **brokerage operating system**. A brokerage in Dubai, Bangalore, London, or anywhere else should run the same app with different settings:

| Configurable per org | Not hardcoded into the product |
|----------------------|--------------------------------|
| Currency + money format | `AED` / Bayut / Dubai Marina |
| Default city / regions | UAE portal names in enums |
| Portal list (labels + adapters) | “Simulate Bayut” as a product feature |
| Lead sources | WhatsApp-only as the only channel story |
| Pipeline stage labels (optional) | Copy that assumes one country |

**Demo seed** may use one sample market (e.g. UAE or India pack) so screens look real. That is **data**, not product scope. Swap the seed pack; the app stays the same.

---

## The problem

Brokerages lose deals because **work is split across tools**, everywhere:

| Pain | What happens |
|------|----------------|
| **Leads scattered** | Portal enquiries, ads, chat, walk-ins land in different places |
| **Listings duplicated** | Same property re-published per portal; status drifts |
| **Follow-ups die** | Viewings live in personal calendars or chat memory |
| **No single pipeline** | Managers can’t see what’s new, lagging, or about to close |
| **Chat ≠ CRM** | Real conversations happen outside the system of record |

We build one place for **listings, leads, calendar of next actions, and source ROI**. Signature features (Lead Fuse, Money Map, Viewing OS + shortlists) are market-independent.

---

## Why we’re building this

1. Real product loop (inventory → lead → viewing → close), not a CRUD toy.  
2. Stronger UI than typical RE CRM demos.  
3. Architecture that is **config-driven** (portals/currency/regions), so we never paint ourselves into one city.  
4. AI last: only after the CRM loop and fuse/ROI features exist.

---

## Who it’s for

| Who | Job to be done |
|-----|----------------|
| **Agent** | Leads, viewings, listings for their desk |
| **Manager / admin** | Pipeline, assignment, portal publish, Money Map |
| **Brokerage** | Configure market (currency, portals, regions) once |
| **You (builder)** | Demo the loop with any seed pack |

Not for: becoming a consumer property portal. Not for: locking the brand to one geography.

**Listing discovery**  
- Agents: full inventory search/filters (price, beds, area, status, portal).  
- Buyers: curated shortlist link for *this brokerage’s* picks, not city-wide browse.

---

## What “done” means (north star)

> An agent logs in, publishes a listing to the org’s configured portals, gets a lead on that listing, moves it through the pipeline, and keeps the next viewing on the in-app calendar. Currency and portal names come from org settings.

AI, Google login, calendar sync, and real messaging APIs are amplifiers later.

---

## What we do that others don’t (signature)

Generic CRMs and even Ruby-class tools still leave money on the table in the same places. We don’t win by “more AI buttons.” We win by **features that protect revenue and reputation**.

### Industry gaps (why businesses care)

| Gap | Business cost |
|-----|----------------|
| Same buyer from 2 portals = 2 leads, 2 agents calling | Looks unprofessional; burn trust; wrecked conversion stats |
| Teams celebrate “leads” not **completed viewings / deals** | Portal spend continues on junk sources |
| Slow first reply (nights/weekends) | Hot leads go to whoever answers first - often a competitor |
| Viewings happen; feedback evaporates | Wrong shortlist repeats; landlords get no update |
| Client shortlist lives in WhatsApp chaos | No branded experience; no “they opened the link” signal |

Ruby leans hard on **AI + WhatsApp + portal glue**. We still need that story later - but our **sharp edges** are ops/money features many products mention and few make central.

### Three signature features (lock these)

#### 1. Lead Fuse - cross-source identity
**One person = one lead**, even if they enquire on Bayut Monday and PropertyFinder Wednesday (match on phone/email).  
Second enquiry attaches as an **event + source**, same owner agent - no double-calling.  
*Business value:* professionalism + clean ROI numbers.  
*V1:* fuse on simulate/manual create by phone. *Later:* every real portal webhook.

#### 2. Money Map - source ROI on outcomes, not vanity leads
Dashboard: per portal/source → leads, **completed viewings**, wins, estimated cost (mock wallet) → **cost per viewing / per deal**.  
Surface “at risk AED” = overdue follow-ups × deal value.  
*Business value:* stop renewing the portal that only sends tyre-kickers.  
*V1.5:* date range, conversion rates, cost per viewing / win vs previous period, decision cues (Scale / Cut / Review), chart, editable entered spend per source (carry-forward by month), Guide included, at-risk deduped by lead. *Later:* live Google / Meta spend sync.

#### 3. Viewing OS + Client Shortlist Link
Calendar isn’t a sticky note: **schedule → edit → notes → mark completed / no-show / cancelled (with reason) → or delete mistakes**. Every event type (viewing, call, follow-up, task) can be closed out. Month pills show Cancelled / No-show / Done / Overdue clearly.  
Plus **Share Shortlist**: branded public link of 3-8 properties; track opens.  
*Business value:* cleaner day planning, show-up and cancel rates, landlord-ready updates.  
*V1.5:* full edit/delete/notes/cancel reasons + filters. *Later:* Google Calendar sync, SMS/WhatsApp share polish.

### Supporting differentiators (strong, not signature)

| Feature | Why it helps business |
|---------|------------------------|
| **Reply SLA** | First-response timer; escalate to manager if breached |
| **Smart Match** | Lead budget/beds/area → ranked listings (rules first, AI later) |
| **Portal truth** | Per-listing Live/Pending/Rejected + wallet mock in one publish panel |
| **AI (last)** | Auto-status / extract intent *on top of* Fuse + Money Map + Viewing OS - not instead of them |

### Positioning line

> **Atrium doesn’t just collect leads. It keeps one buyer as one relationship, shows which portals pay for viewings, and runs viewings + shortlists like an operating system.**

If we only ship “kanban + listings + calendar” with no Fuse / Money Map / Viewing+Shortlist, we look like every other CRM demo.

---

## Features by the end (full product vision)

Shipped in phases. **V1.0** = first shippable demo of the core loop.

### A. Foundation
| Feature | End state | Phase |
|---------|-----------|-------|
| Email/password auth (Better Auth) | Sign up, sign in, session, logout | **V1** |
| Organizations / roles | Brokerage + admin / manager / agent | **V1** |
| Cove app shell | Sidebar, protected routes | **V1** |
| Google login | Optional OAuth | Later |
| Seed / demo brokerage data | One-click believable UAE dataset | **V1** |

### B. Listings (mandatory)
| Feature | End state | Phase |
|---------|-----------|-------|
| Listing CRUD | Title, type, price, beds/baths, area, location, description, status | **V1** |
| Photos | Upload / gallery | **V1** |
| **Inventory filters (agents)** | Search + filter by price, beds, area, type, status, portal | **V1** |
| Mock multi-portal publish | Toggle Bayut / PF / Dubizzle / Skyloov; Live / Pending / Rejected + wallet mock | **V1** |
| Listing detail | Single page used by leads & calendar | **V1** |
| **Smart Match on lead** | From lead prefs → filtered ranked listings inside CRM | **V1** (rules) |
| **Public shortlist / light catalogue** | Buyer opens link; simple filters on *this brokerage’s* shared set | **V1** (shortlist); catalogue optional soon after |
| Approval workflow / version history | Nice-to-have | Later |
| Real portal APIs | Replace mock adapters | Later |
| City-wide consumer portal | Out of scope - that’s Bayut/PF | Never (as Atrium) |

### C. Leads & pipeline
| Feature | End state | Phase |
|---------|-----------|-------|
| Lead kanban | New → Qualified → Viewing → Offer → Won/Lost | **V1** |
| Lead ↔ listing | Every lead can attach a property | **V1** |
| Sources | Manual, portal mock, CSV later | **V1** (manual + simulate portal) |
| Assignment | Assign to agent | **V1** |
| Notes + activity log | Manual timeline on lead | **V1** |
| KPI strip | Open leads, pipeline AED, viewings count | **V1** |
| Simulate inbound portal lead | Button / stub webhook for demo | **V1** |
| Lead scoring / SLA timers | Signal-style polish | Later |
| Duplicate merge, bulk ops | Select mode + bulk stage/assign; duplicate review and merge | **V1.2** |
| Guide leads | Downloadable guides capture leads with source and campaign | **V1.4** |

### D. Calendar & follow-ups
| Feature | End state | Phase |
|---------|-----------|-------|
| In-app calendar | Month/week: viewings, calls, tasks | **V1** |
| Follow-ups linked to leads | Create from lead → shows on calendar | **V1** |
| Due / overdue list | Simple “today / overdue” | **V1** |
| Google Calendar sync | Two-way OAuth | Later |
| Reminders / email digests | Later | Later |

### E. Messaging (showcase depth - after V1)
| Feature | End state | Phase |
|---------|-----------|-------|
| WhatsApp-style inbox UI | Threads next to lead (mock) | After V1 |
| Templates / media in UI | Demo-only | After V1 |
| Real Meta WhatsApp Cloud API | Optional when credentials exist | Later |

### F. Documents & analytics
| Feature | End state | Phase |
|---------|-----------|-------|
| Brochure PDF from listing | **V1.1** |
| Dashboards (portal/agent performance) | **V1.1** (Reports) |
| Off-plan catalog (seeded) | Optional later |

### G. AI (last)
| Feature | End state | Phase |
|---------|-----------|-------|
| Auto-status + reason | Last |
| Interest extraction | Last |
| Translation / voice / call summary | Last |
| Daily AI digest + audit trail | Last |

---

## V1.0 scope (build this first)

**Core loop**
1. Auth + org + roles + Cove shell  
2. Listings + photos + mock portals  
3. Leads kanban + notes/activity + link to listing  
4. In-app calendar + follow-ups  
5. Seeded demo data + “simulate portal lead”

**Signature (must appear in V1, even if thin)**
6. **Lead Fuse** - same phone from second portal merges into one lead  
7. **Money Map** - source ROI with date range, conversion rates, decision cues and editable spend  
8. **Viewing OS + Shortlist link** - complete viewing + feedback; shareable shortlist URL  

**Out of V1.0**
- Google login / Google Calendar  
- Real portal / WhatsApp / Meta APIs  
- AI  
- Native mobile  

---

## V1.1 scope (Docs, Analytics, places + maps)

**Organize**
1. Grouped sidebar: Work / Inventory / Insights / Admin  
2. Org **Settings**: currency label, default city hint, enabled portals (not hardcoded product DNA)

**Places + maps (no paid keys)**
3. Listing `lat` / `lng` / `placeId`  
4. Nominatim place search proxy + manual community/city always allowed  
5. Leaflet + OSM map on listing detail, inventory Map page, and public shortlist when coords exist (no Mapbox/Google key required)  
6. Community filters from **inventory**, not a fixed city list  

**Docs + analytics**
7. Listing brochure PDF download  
8. Reports page: leads by stage/source, wins by source, listing/portal stats, agent load, plus **Viewing health** (held / cancel / no-show rates, cancel reasons, notice lag, breakdowns, cancel CSV)  
 

**Explicitly deferred**
- Messaging: Meta Cloud API only later - **no mock WhatsApp inbox**, no Slack, no Discord  
- Google login / Calendar sync  
- AI  

Copy rule: never use em/en dashes in product or docs; ASCII `-` only.

---

## V1.2 scope (Lead tools: bulk actions + duplicate merge)

1. Select mode on the Leads board with a bulk bar: move to stage, assign to a teammate, unassign
2. Bulk actions are idempotent, org scoped, and write an activity entry per lead that changed
3. Duplicate detection: shared phone (last 9 digits, so "+971 50..." and "050..." match) or shared email, grouped transitively
4. Review dialog lists each group, flags the suggested lead to keep (furthest stage, then most history, then oldest)
5. Merge dialog compares leads side by side; you choose the lead to keep
6. Merge moves sources, notes, activity and calendar events to the kept lead, fills blank fields, unions communities, keeps the earliest created date, and records the other lead's phone and email in a note
7. Not included: bulk delete, "not a duplicate" dismissal, fuzzy name matching

Lead Fuse still fuses exact same-phone enquiries on arrival; merge handles what slips through (different formats, same email, manual entries).

---

## V1.4 scope (Downloadable guides)

1. Agents create a guide, upload a PDF, write a summary and "what is inside" points, choose form-first or open download, pick the owner who receives the leads, then publish
2. Public page per guide and a library page per brokerage, no login. Form: name and email required, phone optional, and a separate unticked marketing opt-in with the exact wording stored
3. After the form the visitor lands on a personal page with the download button. The link does not expire, so the guide can be downloaded again later
4. Every request creates a lead with source Guide, or joins an existing lead (same email, or same phone in any format), assigns the guide owner, and adds a follow-up for the next business day
5. Share panel builds links with source, medium and campaign tags, and a QR code, so each channel can be measured
6. Reports (screen, PDF page 3, CSV) show views, requests, downloads, request rate, leads, how many reached a viewing or were won, and requests by channel
7. Guides can be archived (public page and personal links stop working) and restored. Guides with requests cannot be deleted
8. The Guides page is explorable like the dashboard: search, filter by status, audience and form-first or open, sort by status, newest, page views, requests, downloads, conversion, leads or title (either direction), and a trend chart (page views, requests, downloads by day, week or month, with compare to the previous period). Cards, chart and channel list all follow the same filters and date range, and every card shows its change against the previous period
9. Metric definitions: request rate = requests / views of form-first guides. Download rate = downloads / views of open guides. Downloads = people who opened a guide for the first time (plus every download of an open guide). Channels show share, how many downloaded, leads, and how many reached a viewing
10. Not included yet: building guides inside Atrium, email or WhatsApp delivery, A/B testing, multiple languages

---

## V1.5 scope (Interactive dashboard trends)

1. The dashboard chart switches between New leads, Viewings and Deals won
2. Group by day, week or month; the buttons are never greyed out, choosing one that does not fit the range moves the date filter to a range that does (week: 90d, month: 1y, day: 30d)
2b. Sort by date (default), highest or lowest first; the previous period line is hidden while ranking
3. Date presets 7d, 14d, 30d, 90d, 6m, 1y and a custom range
4. Compare to the previous period of the same length: change, percentage and a comparison line
5. Hover for exact dates, share of the period, running total, change vs previous, and the source (or viewing outcome) mix; click a bar to pin the details
6. Deals won are counted on the date the won lead was last updated (there is no separate closing date yet)

---

## V1.6 scope (Viewing health)

1. Reports `#viewings` is the home for viewing outcomes: booked, held rate, no-show rate, cancel rate, unlogged count, stacked outcome trend, cancel reasons by party, notice-before-cancel buckets, logging speed, agent/listing/source breakdown, and recent cancellations
2. Dashboard shows a Viewing health card (rates vs previous period) that links to Reports; the viewings trend stacks outcomes and can hide cancelled so it matches the KPI (excl. cancelled)
3. Duplicate cancellations are excluded from booked totals and every rate; legacy null reasons show as Not recorded; lag metrics only use `outcomeAt` after calendar V1.5 shipped
4. Exports: summary CSV sections for viewing health / cancel reasons / parties / notice / by agent; row-level `viewings.csv` and cancellations filter; PDF gains a Viewing health page and a corrected summary sentence
5. Not included: top-level Cancellations nav, money on no-shows, call/follow-up outcome stats, heatmaps, predictions

---

## Success criteria for V1 demo

Someone unfamiliar can, in ~5 minutes:

1. Log in as seeded agent  
2. Publish a listing to two mock portals  
3. Simulate Bayut lead, then PF lead with **same phone** → **one fused lead**, two sources  
4. Schedule viewing → mark completed + feedback  
5. Open Money Map and see which source produced the viewing  
6. Open a shared shortlist link as the “client”

If that story works, we are not “another CRM” - we are a brokerage ops product.
