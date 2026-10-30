# V1.3 Plan: Consultation Programme

Status: **plan only, nothing built yet.** Decisions marked **[confirm]** need your answer before build.

## 1. What we are building

A public booking page where anyone can book a property consultation with the brokerage, choose **video or in person**, and get a confirmation. The booking becomes a lead (Lead Fuse applies) and a calendar event. Agents run the consultation inside the CRM, record a summary, and send the client a formal **summary PDF**. Reports show how consultations turn into viewings and deals.

Your decisions so far: public link for anyone, video or in person, summary PDF, reports.

Not in this version: payments or deposits, email/WhatsApp reminders (needs a provider), Google Calendar or Google Meet sync (needs OAuth), AI summaries, multi-language public page. Each has a hook so it can be added later.

## 2. Client journey (public, no login)

Route: `/book/[orgSlug]` (the org slug already exists, so no new identifier).

1. **Topic and format.** Buy, sell, rent, invest, valuation, other. Video or in person. Duration if the brokerage offers more than one.
2. **Pick a time.** Month view with available days highlighted, then time slots. Times shown in the visitor's timezone, with the brokerage timezone stated.
3. **Details.** Name, phone, email, short message. Optional: budget, bedrooms, areas of interest (these pre-fill the lead so Smart Match works straight away).
4. **Confirmation.** Date, time, host, video link or address with map, "Add to calendar" (ICS file and Google link), and a private manage link.

Manage page `/book/manage/[token]`: view, reschedule, cancel. Works on a phone first (the public page must be fully responsive).

## 3. Agent workflow (in the CRM)

New nav item **Consultations** under Work.

- List with tabs: Upcoming, Needs outcome, Completed, Cancelled. Filters: host, topic, format, date range.
- Detail drawer: client, topic, format, **Join** button or address map, linked lead and its history (prep), notes.
- **Complete consultation** form: outcome (qualified, not a fit, needs follow-up), discussion summary, agreed next steps, recommended listings (picker), and a toggle to create a **shortlist** from them (reuses the existing public shortlist link).
- **Download summary PDF** (formal style, same look as the brochure and report).
- Reschedule, cancel, reassign host.
- Settings tab: on/off, copy public link, topics, durations, buffer, minimum notice, booking window, weekly availability per agent, days off, meeting provider, in-person address (uses the existing place search and map).
- Dashboard tile: consultations this week. Calendar: consultations shown with their own colour. Overdue consultations appear in the existing "Needs attention" list.

## 4. Data model (Prisma)

New enums: `ConsultationTopic`, `ConsultationMode` (VIDEO, IN_PERSON), `ConsultationStatus` (BOOKED, COMPLETED, NO_SHOW, CANCELLED). Add `CONSULTATION` to `CalendarEventType`.

```
Consultation
  id, organizationId, hostId (User), leadId, calendarEventId (unique)
  token (unique, 24 random bytes, base64url)        // public manage link
  topic, mode, status, durationMin
  startsAt, endsAt                                   // stored UTC
  clientName, phone, email, message
  prefBudgetMax, prefBeds, prefCommunities[]
  meetingUrl?, locationText?, lat?, lng?
  summary?, nextSteps?, outcome?, completedAt?, summarySentAt?
  cancelledAt?, cancelReason?
  createdAt, updatedAt
  @@unique([hostId, startsAt])                       // hard stop on double booking
  @@index([organizationId, startsAt])

ConsultationListing   (consultationId, listingId, sortOrder)   // recommended properties

ConsultationSettings  (1:1 with Organization)
  enabled, topics[], durations[], bufferMin, minNoticeHours, maxAdvanceDays,
  cancelWindowHours, meetingProvider (JITSI | FIXED_LINK), inPersonAddress/lat/lng

AvailabilityRule      (organizationId, userId, weekday 0-6, startMinute, endMinute)
AvailabilityException (organizationId, userId?, date, reason)   // days off; userId null = whole office
```

Also needed:

- **Organization.timezone** (IANA name, set in Settings). Today the app has no timezone field and day boundaries use server time. A booking product cannot be correct without it, and it keeps us market-agnostic.
- **CalendarEvent.assignedToId** (optional). Right now events are not tied to an agent, so viewings cannot block an agent's availability. Backfill from the lead's assigned agent.
- **Lead source for consultations [confirm]:** reuse `WEBSITE`, or add `CONSULTATION`. Recommendation: add `CONSULTATION` so Money Map and Reports can show it as its own channel.

## 5. Availability and slot engine

A pure module `api/src/lib/slots.ts` with no database access, so it is fully unit tested (same approach as `leadTools.ts`).

Inputs: rules, exceptions, existing busy intervals (consultations plus assigned calendar events), duration, buffer, minimum notice, window, timezone, now.
Output: free start times per host, merged for "any agent".

- Working hours are interpreted **in the organization timezone**, then converted to UTC, so DST changes are handled. Use `luxon` (small, mature) instead of hand-rolled date maths.
- Host assignment **[confirm]**: default "any available agent" using least bookings that week; the client can optionally pick a person. Recommendation: both.
- Double booking is prevented twice: the slot check, and the `@@unique([hostId, startsAt])` constraint inside a transaction. A losing request gets HTTP 409 with fresh slots.

## 6. API

Public (no auth, resolved only from `slug` or `token`, never an id from the client):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/public/book/:slug` | Brokerage name, topics, durations, formats, address, timezone |
| GET | `/api/public/book/:slug/slots?from&to&duration&mode&hostId?` | Free start times only (no names, no client data) |
| POST | `/api/public/book/:slug` | Create booking |
| GET | `/api/public/manage/:token` | View booking |
| POST | `/api/public/manage/:token/reschedule` and `/cancel` | Change or cancel (respecting the cancel window) |
| GET | `/api/public/manage/:token/calendar.ics` | Calendar file |

Authenticated, org scoped:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/consultations`, `/:id` | List and detail |
| PATCH | `/api/consultations/:id` | Notes, reassign, reschedule, meeting link |
| POST | `/api/consultations/:id/complete` | Outcome, summary, next steps, recommended listings, optional shortlist |
| GET | `/api/consultations/:id/summary.pdf` | Formal summary PDF |
| GET | `/api/consultations/export.csv` | CSV export (same helper as the other exports) |
| GET/PUT | `/api/consultations/settings`, `/availability` | Settings, weekly hours, days off |

Booking flow on the server, in one transaction: validate, find host, create or fuse the lead (using the same phone matching as duplicate detection, so `050...` and `+971 50...` become one lead), create the `Consultation` and its `CalendarEvent`, add `LeadSourceEvent` and activity entries ("Consultation booked", "cancelled", "completed"). Completing a consultation moves the lead to QUALIFIED when the outcome says so.

## 7. Video and in-person

- **Video, default: Jitsi.** Generate an unguessable room URL per booking. No account or API key, which matches the "no paid keys" principle. Option to use a fixed personal link per agent (Zoom, Meet, Teams).
- **Google Meet** with auto-generated links comes later with Google Calendar OAuth (already on the roadmap).
- **In person:** brokerage address with a map on the confirmation page, reusing the Leaflet and place search work from V1.1.

## 8. Summary PDF

Formal style, reusing `pdfTheme.ts`: letterhead, client and host, date, time and format, topic, requirements captured (budget, bedrooms, areas), discussion summary, agreed next steps, recommended properties (cover photo, price, key specs) and a "view online" link to the shortlist. Sent by download and copyable link now; email delivery arrives with an email provider.

## 9. Reports

Added to the Reports page, the Reports PDF and CSV, respecting the date range filter:

- Booked, completed, no-show, cancelled; **show-up rate**; cancellation rate.
- By topic, by format (video or in person), by host.
- **Conversion:** consultation to viewing, consultation to deal won.
- Average lead time from booking to consultation.

## 10. Security and abuse (public endpoints)

- Rate limiting per IP and per phone (`express-rate-limit`), honeypot field, strict zod validation, request size limits. Captcha hook (Cloudflare Turnstile) switched on by an environment flag.
- Slots endpoint exposes free or busy only. Tokens are random and unguessable. Manage links are single-booking scope.
- Org is resolved from the slug on the server, so one brokerage can never book into another.
- Cannot book in the past, inside minimum notice, or beyond the window. Cannot cancel after start or inside the cancel window.
- Limit open bookings per phone to stop slot hoarding.

## 11. Testing plan

- **Unit (slot engine):** weekly hours, buffers, minimum notice, window, days off, overlapping busy time, two hosts merged, DST changes in a DST timezone (for example America/New_York) and a fixed one (Asia/Dubai), midnight boundaries.
- **Integration (API and DB):** book then slot disappears; **two simultaneous bookings for one slot, exactly one wins** (409 for the other); cancel frees the slot; reschedule keeps one record; org isolation by slug; lead fusion across phone formats; calendar event and activity created; completing updates stage; rate limit triggers; PDF returns a valid file with expected page count; CSV content.
- **Browser (Playwright, desktop and phone width):** full public booking, manage and cancel, agent completes a consultation, PDF downloads, screenshots of every step. Regression check that fixed overlays stay in the viewport (the portal fix from V1.2).
- **Accessibility:** keyboard-only booking, focus order, live regions for slot loading and errors, contrast.
- Standing checks: no long dashes in UI, PDFs, CSV or docs; clean database after tests.

## 12. Build phases

| Phase | Scope | Size |
|---|---|---|
| A | Schema, timezone setting, slot engine and its unit tests, settings and availability UI | M |
| B | Public booking page, manage page, ICS, lead and calendar integration, abuse protection | L |
| C | Consultations page, completion form, shortlist creation, summary PDF | M |
| D | Reports (screen, PDF, CSV), dashboard tile, calendar styling, docs, full test and screenshot pass | M |

## 13. Decisions I need from you **[confirm]**

1. Add a `CONSULTATION` lead source (recommended) or reuse `WEBSITE`?
2. Host assignment: any available agent, client can choose, or both (recommended)?
3. Default video provider: auto-generated Jitsi rooms (recommended, no keys) or fixed links only?
4. Default rules: durations 30 and 60 minutes, 15 minute buffer, 4 hours minimum notice, 30 day window, 2 hour cancel window. Acceptable as starting values (all editable in Settings)?
5. Confirmations without email: show on screen plus ICS file now, and add email when we pick a provider. Acceptable for this version?
