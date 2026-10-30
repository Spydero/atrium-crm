# Atrium — Product goal

Working name: **Atrium** (rename anytime).  
Audience for *this build*: showcase / portfolio / demo of a brokerage CRM.  
Market skin: UAE-style (AED, Bayut/PF/Dubizzle/Skyloov names, WhatsApp-heavy workflow) — architecture works for other markets later.

---

## The problem

Dubai (and similar) real-estate agents don’t lose deals because they lack listings. They lose them because **work is split across tools**:

| Pain | What happens today |
|------|--------------------|
| **Leads scattered** | Inquiries land on Bayut, PropertyFinder, Dubizzle, Skyloov, Meta ads, WhatsApp — different inboxes, different people |
| **Listings duplicated** | Same property re-entered / re-published per portal; status drifts (“live on PF, dead on Bayut”) |
| **Follow-ups die** | Viewings and callbacks live in personal calendars or chat memory; nothing owns the next step |
| **No single pipeline** | Manager can’t see: what’s new, who’s lagging, what’s about to close |
| **Chat ≠ CRM** | The real conversation is on WhatsApp; the CRM (if any) is a graveyard of notes nobody updates |

Ruby CRM sells the “all-in-one” answer to that. We are building a **credible version of that product story** — without paid portal/WhatsApp production APIs — so the demo proves: *one place for listings, leads, and the calendar of next actions*.

---

## Why we’re building this

1. **Show a real product**, not a CRUD toy — pipeline + listings + calendar is the brokerage daily loop.  
2. **Compete on clarity/UI** — Cove shell; Ruby’s marketing is strong, UI is not the bar.  
3. **Prove architecture** — mock portal adapters today → real APIs later without rewrite.  
4. **AI last on purpose** — AI only matters if the CRM underneath already holds leads, listings, and follow-ups.

---

## Who it’s for

| Who | Job to be done |
|-----|----------------|
| **Agent** | See my leads, update stage, know next viewing/call, manage my listings |
| **Manager / admin** | See team pipeline, assign leads, control listing publish state |
| **You (builder)** | Demo end-to-end: listing → lead → follow-up → closed |

Not for: becoming a public mega-portal like Bayut/PropertyFinder. Not for: enterprise SSO / multi-country compliance in V1.

**Listing discovery (important split)**  
- **Agents / managers — yes, full inventory search.** Filters (price, beds, area, type, status, portal live/not) are core CRM work: find stock, match a buyer, pick for a viewing.  
- **Buyers — curated, not a marketplace.** They don’t log into Atrium to “browse the city.” They get a **shared shortlist** (and optionally a light **public brokerage catalogue** of *this agency’s* live listings with simple filters). We sell the brokerage’s stock + service, not portal scale.

---

## What “done” means (north star)

> An agent logs in, publishes a listing to mock portals, receives a lead on that listing, moves it through a pipeline, and never misses the next viewing because it’s on the in-app calendar — all in one product.

AI, Google login, Google Calendar sync, and real WhatsApp are **amplifiers** on top of that loop — not the loop itself.

---

## What we do that others don’t (signature)

Generic CRMs and even Ruby-class tools still leave money on the table in the same places. We don’t win by “more AI buttons.” We win by **features that protect revenue and reputation**.

### Industry gaps (why businesses care)

| Gap | Business cost |
|-----|----------------|
| Same buyer from 2 portals = 2 leads, 2 agents calling | Looks unprofessional; burn trust; wrecked conversion stats |
| Teams celebrate “leads” not **completed viewings / deals** | Portal spend continues on junk sources |
| Slow first reply (nights/weekends) | Hot leads go to whoever answers first — often a competitor |
| Viewings happen; feedback evaporates | Wrong shortlist repeats; landlords get no update |
| Client shortlist lives in WhatsApp chaos | No branded experience; no “they opened the link” signal |

Ruby leans hard on **AI + WhatsApp + portal glue**. We still need that story later — but our **sharp edges** are ops/money features many products mention and few make central.

### Three signature features (lock these)

#### 1. Lead Fuse — cross-source identity
**One person = one lead**, even if they enquire on Bayut Monday and PropertyFinder Wednesday (match on phone/email).  
Second enquiry attaches as an **event + source**, same owner agent — no double-calling.  
*Business value:* professionalism + clean ROI numbers.  
*V1:* fuse on simulate/manual create by phone. *Later:* every real portal webhook.

#### 2. Money Map — source ROI on outcomes, not vanity leads
Dashboard: per portal/source → leads, **completed viewings**, wins, estimated cost (mock wallet) → **cost per viewing / per deal**.  
Surface “at risk AED” = overdue follow-ups × deal value.  
*Business value:* stop renewing the portal that only sends tyre-kickers.  
*V1:* basic Money Map from seed + mock costs. *Later:* real spend inputs.

#### 3. Viewing OS + Client Shortlist Link
Calendar isn’t a sticky note: **schedule viewing → mark completed/no-show → structured feedback** (fit / budget / area / next step). Feedback can auto-suggest alternate listings (rules).  
Plus **Share Shortlist**: branded public link of 3–8 properties; track opens.  
*Business value:* faster shortlists, landlord-ready updates, client feels premium.  
*V1:* viewing events + completed/feedback fields; shortlist link MVP. *Later:* SMS/WhatsApp share polish.

### Supporting differentiators (strong, not signature)

| Feature | Why it helps business |
|---------|------------------------|
| **Reply SLA** | First-response timer; escalate to manager if breached |
| **Smart Match** | Lead budget/beds/area → ranked listings (rules first, AI later) |
| **Portal truth** | Per-listing Live/Pending/Rejected + wallet mock in one publish panel |
| **AI (last)** | Auto-status / extract intent *on top of* Fuse + Money Map + Viewing OS — not instead of them |

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
| City-wide consumer portal | Out of scope — that’s Bayut/PF | Never (as Atrium) |

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
| Duplicate merge, bulk ops | Later | Later |

### D. Calendar & follow-ups
| Feature | End state | Phase |
|---------|-----------|-------|
| In-app calendar | Month/week: viewings, calls, tasks | **V1** |
| Follow-ups linked to leads | Create from lead → shows on calendar | **V1** |
| Due / overdue list | Simple “today / overdue” | **V1** |
| Google Calendar sync | Two-way OAuth | Later |
| Reminders / email digests | Later | Later |

### E. Messaging (showcase depth — after V1)
| Feature | End state | Phase |
|---------|-----------|-------|
| WhatsApp-style inbox UI | Threads next to lead (mock) | After V1 |
| Templates / media in UI | Demo-only | After V1 |
| Real Meta WhatsApp Cloud API | Optional when credentials exist | Later |

### F. Documents & analytics
| Feature | End state | Phase |
|---------|-----------|-------|
| Brochure PDF from listing | After V1 |
| Dashboards (portal/agent performance) | After V1 |
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
6. **Lead Fuse** — same phone from second portal merges into one lead  
7. **Money Map** — simple source → viewings/wins (+ mock cost) panel  
8. **Viewing OS + Shortlist link** — complete viewing + feedback; shareable shortlist URL  

**Out of V1**
- Google login / Google Calendar  
- Real portal / WhatsApp / Meta APIs  
- AI  
- Native mobile, brochure PDF, deep analytics  

---

## Success criteria for V1 demo

Someone unfamiliar can, in ~5 minutes:

1. Log in as seeded agent  
2. Publish a listing to two mock portals  
3. Simulate Bayut lead, then PF lead with **same phone** → **one fused lead**, two sources  
4. Schedule viewing → mark completed + feedback  
5. Open Money Map and see which source produced the viewing  
6. Open a shared shortlist link as the “client”

If that story works, we are not “another CRM” — we are a brokerage ops product.
