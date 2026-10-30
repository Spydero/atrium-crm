# Atrium - Integration strategy

What real brokerage products do (and what we do): **own the core, rent the pipes, never scrape.**

---

## How real apps are built

Successful PropTech / brokerage CRMs use a **hybrid**:

| Layer | Own it (build) | Rent it (3rd party) |
|-------|----------------|---------------------|
| Listings, leads, pipeline, roles, Fuse, Money Map, viewings, shortlists | Yes | No |
| File storage / CDN | Optional thin wrapper | Cloudinary, S3 |
| Maps / geocode | UI + our lat/lng fields | Mapbox, Nominatim |
| Email send | Templates + triggers | Resend, SES |
| Calendar sync | Our events are source of truth | Google / Outlook OAuth |
| Portal publish + lead intake | Adapter interface + normalized models | Official portal partner APIs |
| WhatsApp transport | Inbox UI + thread model in our DB | Meta Cloud API (official only) |
| AI | Prompts, audit, product logic | LLM provider (Groq / Gemini / OpenAI) |

Industry pattern: **anti-corruption / adapter layer**. Each vendor maps into *our* schema. Swap Bayut for Magicbricks = new adapter, not a rewrite. Same idea Ruby-class products use for multi-portal.

Sources that describe this hybrid clearly: custom CRM guides stress integrating commodity services behind a normalization layer; MLS/portal work is licensed APIs + workers, not “build MLS from scratch.”

---

## What we will never depend on for the core

| Avoid | Why |
|-------|-----|
| Unofficial WhatsApp scrapers / “WhatsApp Web” bots | Ban risk, breaks, not how serious apps ship |
| Scraping portals for inventory | Legal + brittle; portals are partners, not your DB |
| Making Zillow/Bayut the system of record | You don’t own the data; product dies if they cut you off |
| Building our own maps / email SMTP / CDN | Commodity; no differentiation |
| Hardcoding one country’s portals into the domain model | Blocks multi-market |

**Inventory always lives in Atrium.** Portals get a *copy* (publish) or *send leads* (webhooks). Photos live in our storage (or Cloudinary), referenced by our listing IDs.

---

## Future integrations roadmap (adapter style)

```
Org config
  → enabled portal keys + credentials
  → PortalAdapter.publish / unpublish / ingestLead

MessagingAdapter (WhatsApp later)
CalendarAdapter (Google later)
StorageAdapter (local → Cloudinary)
```

| When | Integration | Approach |
|------|-------------|----------|
| Now | Uploads + `TESTING_ENABLED` stock picker | Own listing fields (city/area). Photos: **upload** always, plus a **local curated catalog** (~48 place-tagged images) for demos - no third-party photo API keys (Unsplash/Pexels/Pixabay are often paused or rate-limited). |
| V1.1 | Maps + geocode | Nominatim search proxy + Leaflet/OSM tiles; store `lat`/`lng`/`placeId` on listing. Manual address always allowed. |
| V1.1 | Brochure PDF | Server-side `pdfkit` from listing + org name |
| Later | Google Calendar | OAuth; our `CalendarEvent` remains canonical |
| Later | Real portals | Official partner APIs only; mock adapters until then |
| Later | WhatsApp | Meta Cloud API only when credentials exist; Conversation/Message tables. **No mock inbox, Slack, or Discord.** |
| Last | AI | Our rules + audit; LLM as a service behind a flag |

Mock adapters today = same UI and org settings as production. Credentials appear in org settings when available; until then simulate.

---

## Rule for any new API

1. Does it touch **how we win** (Fuse, pipeline, ROI, viewings)? → Own the logic.  
2. Is it **transport or commodity** (send email, host image, draw map)? → Use a free/self-serve vendor.  
3. Is it **licensed inventory** (MLS/portal)? → Partner API + adapter, never scrape.  
4. Can the vendor disappear? → Data still in our Postgres; UI still works.
