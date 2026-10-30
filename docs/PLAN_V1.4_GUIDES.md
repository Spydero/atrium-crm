# V1.4 Plan: Downloadable Guides

Status: **built (phases A to D).** Phase E (build guides inside Atrium, email and WhatsApp delivery) is still open. Decisions marked **[confirm]** were answered, see "Answers received".

## 1. What a downloadable guide is

A free, branded guide (for example "Buyer's Guide", "Seller's Guide", "Investor Handbook", "Renter's Checklist") that a visitor can download from a public page. In return the brokerage gets a lead, knows which guide they wanted and where they came from, and can follow up. This is the standard "lead magnet" pattern used by brokerages and CRMs.

## 2. Research: what others do, and what we take from it

| Source | What they do | What we take |
|---|---|---|
| [Engel & Voelkers, Dubai Buyer's Guide](https://www.engelvoelkers.com/ae/en/research/dubai-buyers-guide) | Dedicated landing page: headline, bullet list of what is inside (process, financing, legal, fees, areas), short FAQ ("Is it free?", "Who is it for?"), form for instant access, and an invitation to speak to an advisor afterwards | Copy this page structure. The "speak to someone" line after download is the conversion step into a consultation |
| [Property Finder, Buy in Dubai](https://www.propertyfinder.ae/guides/buy-in-dubai/) | Whole guide readable on the web, plus "Short of time? We can send you a PDF" with a single field ("takes 5 seconds") | Offer a web preview and keep the download form tiny |
| [Betterhomes, 10-step buying guide](https://www.bhomes.com/en/sales/buyer-guide) | Fully ungated web guide, step by step | Ungated web content earns trust, sharing and search traffic. PDF is the gated extra |
| [Strategic Realty, Central Oregon guide](https://www.movetobend.com/buyers/the-ultimate-homebuying-guide/) | Name and email form, instant delivery, "what's inside" checklist | Same model, confirms name plus email is a normal ask |
| [Krista Mashore, buyer guide lead magnet](https://blog.kristamashore.com/articles/buyer-guide-lead-magnet) | 8 to 12 pages, hyperlocal, current market data refreshed quarterly, written for first-timers; promoted on website, ads, social, open houses ("text a keyword"), email signature | Keep guides short and local. **Stale data kills trust**, so the guide should pull live figures from our own inventory. Track the promotion channel |
| [Real estate buyer guide template (FIRSTPDF)](https://content.localfirstbank.com/file/real-estate-buyer-guide-template) | One-field form beats a long survey; every forwarded copy is a referral | Do not ask many questions. Make the PDF safe to forward (our contact details and a booking link inside) |
| [Reallyo, landing pages that convert](https://www.reallyo.com/blog/real-estate-landing-pages) | One audience, one offer, one action per page | One guide per landing page, one form, one button |
| [Prospeo](https://prospeo.io/s/what-is-gated-content), [Octave](https://www.octavehq.com/post/gtm-engineers-guide-to-gated-vs-ungated-content) | Gate only high-intent assets; keep educational content open. 2 to 3 fields; going from 4 fields to 3 can lift conversion by up to 50%; collect more later (progressive profiling) | Default form is 3 fields. Per-guide gated or open toggle |
| [HubSpot, document download tracking](https://community.hubspot.com/t/document-download-tracking-how-to-do-it-right/26832) | A form submission alone does not say which asset was taken or whether it was opened; track the download itself. Email is the primary identifier, repeat submissions are de-duplicated | Log **form submit and actual download separately**, attribute both to the guide, and merge repeat requests into the same lead |
| [OptinPlot, lead magnet delivery](https://optinplot.com/guides/lead-capture-conversion/lead-magnets/lead-magnet-delivery/) | Deliver the file on the thank-you page immediately and also by email; do not withhold it until an email is confirmed; do not expire links on a free guide | Instant download on the confirmation page, email copy once we have an email provider, stable link |
| [Gated download plugins (example)](https://wordpress.org/plugins/coreessentials-email-gated-downloads/) | Files kept in a protected folder (no direct URL), per-submission tokens, download log with CSV export, consent checkbox, rate limiting | Same security shape: private storage, token links, log, consent, rate limit |
| [UAE PDPL, Federal Decree-Law 45 of 2021](https://www.uaelegislation.gov.ae/en/legislations/1972/download) and [DIFC consent guidance](https://assets.difc.com/v1/media/edge/images/dubaiintern0078-difcexperie96c5-production-3253/media/project/difcexperiences/difc/difcwebsite/documents/registrars-and-commissioners/guidance-and-handbooks/lawful-processing/guidance_relating_to_data_subject_consent.pdf) | Collect only what is needed, for a stated purpose; consent must be provable, clear, and easy to withdraw. DIFC guidance (applies inside DIFC, good practice elsewhere): no pre-ticked boxes, separate consent per purpose, marketing consent not bundled | Unticked, separate marketing checkbox; store consent wording, version and time; privacy notice link. Not legal advice, have your counsel review |
| [Dubai Land Department, Brokerage Practice Guide 2024](https://dubailand.gov.ae/media/i31iv1n0/real_estate_brokerage_practice_guide_2024.pdf) | Real estate advertising and marketing material needs a permit (Trakheesi), with the permit number displayed | Optional "permit or licence number" field per guide, printed on the page and PDF. **Please confirm with compliance whether a guide counts as advertising for you** |

### The main lessons

1. **Short, local, current beats long and generic.** 8 to 12 pages, real local content, dated figures.
2. **Keep the form tiny.** Name and email, with phone optional. Every extra field costs sign-ups.
3. **Deliver instantly and by email.** Never hold the file hostage.
4. **Track the download, not just the form.** Know which guide, which channel, which lead.
5. **Hybrid gating works best.** Open web preview for trust and search, gated PDF for the lead.
6. **Consent must be separate and provable** because the aim is to follow up.
7. **The next step matters.** The best pages end with "talk to an advisor", which for us is the V1.3 consultation booking.

## 3. How it fits Atrium (and what makes it better than a plain PDF link)

- **Leads go straight into the CRM.** The request creates or fuses a lead (same phone and email matching as duplicate detection), attaches a source event "Guide: Buyer's Guide", logs activity, and creates a follow-up task for the assigned agent the next business day.
- **The guide is never stale.** Generated guides can include a "Market snapshot" block built from the brokerage's own active listings (counts, price ranges, popular communities, "data as of" date). Nothing is hardcoded to a city.
- **Market agnostic.** Starter templates are neutral outlines (process, costs, checklists) that the brokerage edits. We do not ship legal or tax claims for any country.
- **Same formal look** as the brochure and report PDFs (shared `pdfTheme.ts`).
- **Closes the loop in Reports.** Views, requests, downloads, and how many guide leads reach a viewing, consultation, or deal.

## 4. Client journey (public, no login)

1. Visitor lands on `/guides/[orgSlug]` (library) or `/guides/[orgSlug]/[guideSlug]` (one guide), from a link, QR code, ad, or the website.
2. Page shows: headline, cover image, "what's inside" bullets, page count, last updated date, short FAQ, optional ungated preview of the contents.
3. Short form: name, email, phone (optional, labelled "for WhatsApp follow-up"), unticked box "Send me property news and offers" (separate from delivery), privacy notice link.
4. Confirmation page: **Download now** button, "we also emailed you" (once email exists), and the next step: "Book a free consultation" and "Browse listings".
5. If an ungated guide: one click download, optional "Get updates" form.

## 5. Agent workflow (in the CRM)

New **Guides** page (nav group **Marketing** **[confirm]**, otherwise under Work).

- Library of guides with status (draft, published, archived), views, requests, downloads, conversion rate.
- Create guide: title, audience (buyer, seller, investor, renter, general), summary, "what's inside" bullets, cover, gated or open, owner agent (who gets the leads), permit or licence number, call to action.
- **Content source (two options):**
  - **Upload your own designed PDF** (fastest, works with guides you already have).
  - **Build in Atrium** from a starter template: sections, checklists, key figure tables, optional market snapshot, rendered with the formal PDF style. Phase 2.
- Share panel: public link, QR code, UTM link builder (source, medium, campaign) so each channel is measured.
- Guide detail: request log (who, when, channel, downloaded or not), export CSV.
- Lead page shows "Downloaded: Buyer's Guide" in sources and activity.

## 6. Data model (Prisma)

New enums: `GuideAudience`, `GuideStatus` (DRAFT, PUBLISHED, ARCHIVED). Add `GUIDE` to `LeadSource` **[confirm]** (recommended so Reports and Money Map show it as its own channel; the alternative is reusing `WEBSITE`).

```
Guide
  id, organizationId, slug (unique per org), title, subtitle, audience, summary
  benefits[]                         // "what's inside" bullets
  coverUrl?, pageCount?
  status, gated (bool), ownerId (User)       // owner receives the leads
  filePath?                          // private storage key for uploaded PDF
  contentJson?                       // phase 2: sections for generated guides
  includeMarketSnapshot (bool)       // phase 2
  permitNumber?, ctaConsultation (bool)
  version, publishedAt, createdAt, updatedAt
  @@unique([organizationId, slug])

GuideRequest                          // one row per form submission
  id, guideId, leadId, token (unique, random)   // personal download link
  name, email, phone                  // snapshot at time of request
  consentMarketing (bool), consentText, consentVersion, consentAt
  utmSource, utmMedium, utmCampaign, referrer
  ipHash                              // hashed, for abuse control only
  downloadCount, firstDownloadedAt?, lastDownloadedAt?, createdAt

GuideDailyStat                        // privacy friendly view counts, no personal data
  guideId, date, views
  @@id([guideId, date])
```

`Lead.phone` is currently required. A guide visitor may give only an email. Options in section 11. Also add an org-level privacy notice URL and licence number to Settings.

## 7. API

Public (no auth, org resolved from slug, never from client ids):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/public/guides/:orgSlug` | Published guides for the library page |
| GET | `/api/public/guides/:orgSlug/:guideSlug` | One guide page data; counts a view |
| POST | `/api/public/guides/:orgSlug/:guideSlug/request` | Submit form; returns personal download token |
| GET | `/api/public/guides/download/:token` | Streams the PDF; increments download count |

Authenticated, org scoped:

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH | `/api/guides`, `/api/guides/:id` | List, create, edit |
| POST | `/api/guides/:id/file` | Upload PDF (PDF only, size limit, header check) |
| POST | `/api/guides/:id/publish` and `/archive` | Status changes |
| GET | `/api/guides/:id/requests`, `/export.csv` | Request log and CSV |
| GET | `/api/guides/:id/preview.pdf` | Phase 2: generated guide preview |
| GET | `/api/guides/stats` | Funnel numbers for Reports |

Request flow on the server, in one transaction: validate, rate limit, find or create the lead (fused by phone or email), add source event and activity, create the `GuideRequest` and token, create the follow-up calendar task for the owner, return the token.

## 8. Security and privacy

- Uploaded PDFs live in **private storage, not a public static folder**. Check the `%PDF` header and a size cap, store under a random key, serve only through the token route with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
- Tokens are long random values. A token is tied to one request, so downloads are attributable. Links do not expire (per the research) but an owner can revoke a guide by archiving it.
- Rate limit per IP and per phone or email, honeypot field, strict validation, optional Turnstile hook behind an environment flag.
- Only name, email and phone are collected, for the stated purpose. Marketing consent is separate, unticked, stored with wording and time. Privacy notice link shown at the form. IP is stored only as a hash.
- No tracking cookies. Views are counted as daily totals.

## 9. Reports

Added to the Reports page, PDF and CSV (respecting the date range):

- Per guide: views, requests, downloads, request rate, download rate.
- By channel (UTM source and medium).
- Guide leads that reached a viewing, a consultation, or a deal, and the share of all new leads that came from guides.

## 10. Testing plan

- **Unit:** consent text versioning, UTM parsing, token generation, PDF upload validation (rejects non-PDF, oversize, wrong header), stat bucketing.
- **Integration (API and DB):** request creates lead, source event, activity, follow-up task; same person twice is fused and counted once as a lead with two requests; same phone in different formats fuses; draft or archived guide is not public; token downloads the exact bytes; unknown token 404; rate limit triggers; org isolation by slug; CSV content.
- **Browser (Playwright, desktop and phone width):** public library and guide page, form validation, consent box defaults to unticked, download from the confirmation page, agent creates, uploads, publishes, copies UTM link, sees the request in the log and on the lead; screenshots of every step.
- **PDF:** generated guide renders and passes the formal style checks (phase 2).
- **Accessibility:** keyboard-only form, labels, error announcements, contrast.
- Standing checks: no long dashes in UI, PDFs, CSV or docs; clean database after tests.

## 11. Decisions I need from you **[confirm]**

1. **Content source for v1:** upload your own PDF only, or also build guides inside Atrium?
2. **Form fields:** name plus email (phone optional), or name plus phone (WhatsApp first, email optional)? This decides whether `Lead.phone` stays required.
3. **Gating default:** gated PDF with open web preview (recommended), or open download?
4. **Lead source:** add `GUIDE` as its own source (recommended) or reuse `WEBSITE`?
5. **Nav:** new **Marketing** group for Guides (recommended) or under Work?
6. **Compliance:** do your guides need a permit number printed (Trakheesi or equivalent)? We will add the optional field either way.

### Answers received

1. Content source for v1: **upload your own PDF only**. Building inside Atrium moves to phase E.
2. Form: **name and email required, phone optional.** Because `Lead.phone` is required today, an email-only lead needs a small schema change (make phone optional, dedupe by email when phone is missing). To be handled in phase A with tests so Lead Fuse and duplicate detection still work.
3. Gating: **open web preview, gated PDF**, switchable per guide.
4. Lead source: **new `GUIDE` source.**
5. Nav group and permit number: still open. Defaults: new **Marketing** group, and an optional permit field.

## 12. Build phases

| Phase | Scope | Size |
|---|---|---|
| A | Schema, upload and private storage, Guides admin page, publish flow | M |
| B | Public library and guide pages, form, consent, token download, lead and follow-up integration, abuse protection | L |
| C | Share panel (link, QR, UTM), request log, CSV, lead page display | S |
| D | Reports (screen, PDF, CSV), docs, full test and screenshot pass | M |
| E (later) | Build guides in Atrium from templates with live market snapshot; email delivery once a provider exists; WhatsApp delivery via Meta | L |

## 13. Out of scope for now

Email and WhatsApp sending (needs providers), A/B test engine (we log enough to compare gated and open later), paid or paywalled guides, multi-language guides, interactive flipbooks.
