# Database changelog

The human readable record of every database change. The SQL lives in `prisma/migrations/<timestamp>_<name>/migration.sql`.
What actually ran on a database is in `prisma/apply-log.md` (written by `npm run db:deploy`) and in the database table `_prisma_migrations` (`npm run db:history`).

## How to change the database (always the same steps)

1. Edit `prisma/schema.prisma`.
2. `npm run db:new -- short_snake_case_name` creates the migration folder and SQL without running it.
3. Open the generated `migration.sql`. Read it. Add a comment header: what, why, version, data impact. For anything that can lose or rewrite data (drop column, change type, make a column required) write the data step by hand and say how to undo it.
4. Add an entry at the top of the list below (copy the template).
5. `npm run db:deploy` takes a backup (`api/backups/`, not committed), applies the migration, and appends to `apply-log.md`.
6. `npm run db:status` must say "No drift". Run `npm test` in `api`.
7. Commit the schema, the migration folder, this file and `apply-log.md` together.

Never use `prisma db push` (the script is disabled) and never edit a migration that has been applied anywhere. To fix a mistake, add a new migration.

Useful commands (in `api`):

| Command | What it does |
|---------|--------------|
| `npm run db:status` | Applied vs pending migrations and a drift check against `schema.prisma` |
| `npm run db:history` | Every migration the database recorded: start, finish, steps, logs, checksum |
| `npm run db:deploy` | Backup, apply pending migrations, write the audit entry |
| `npm run db:new -- name` | Create a migration without applying it |

Rolling back: Prisma has no automatic down migrations. Restore the backup taken by `db:deploy` (`psql <db> < backups/<file>.sql` into a fresh database), or write a new forward migration that reverses the change. Each entry below says what a reversal would involve.

Folder names use UTC time (Prisma does this for new migrations). The three baseline folders use the UTC time of the commit they were rebuilt from.

## Entry template

```
### <timestamp>_<name>  (app version, commit)
- Date applied: 
- Purpose: 
- Changes: tables / columns / enums / indexes
- Data impact: none | backfilled | destructive (explain)
- Risk: low | medium | high, and why
- Reversal: 
- Code that depends on it: 
```

## Migrations (newest first)

### 20261031105716_calendar_outcomes_notes  (Calendar V1.5)
- Date applied: 2026-10-31 (see apply-log.md)
- Purpose: calendar depth - notes, cancel reasons, outcome timestamps, creator; every event type can be completed or cancelled; delete and full edit become possible.
- Changes:
  - New enum `CancelReason` (CLIENT, AGENT, LANDLORD, LISTING_UNAVAILABLE, RESCHEDULED, DUPLICATE, OTHER).
  - `CalendarEvent` gains `notes`, `cancelReason`, `outcomeAt`, `createdById` (FK to User, set null).
  - `CalendarEvent.outcome` becomes required (NOT NULL), default SCHEDULED.
  - Index `(organizationId, startsAt)`.
- Data impact: null outcomes set to SCHEDULED; `outcomeAt` backfilled from `updatedAt` for non-SCHEDULED rows (approximate).
- Risk: low. Additive columns plus a non-destructive backfill before NOT NULL.
- Reversal: drop the four columns and the enum; make `outcome` nullable again.
- Code that depends on it: `src/routes/calendar.ts`, `src/lib/eventOutcome.ts`, calendar UI, guide follow-up creation, dashboard upcoming viewings filter.

### 20261031103435_money_map_source_spend  (Money Map V1.5)
- Date applied: 2026-10-31 (see apply-log.md)
- Purpose: Money Map needs a reliable win date and monthly entered spend for every lead source (including GUIDE, META, WhatsApp), not only the four portals.
- Changes:
  - `Lead.wonAt` (nullable timestamp) + index `(organizationId, wonAt)`.
  - New table `SourceSpend` (`organizationId`, `source` LeadSource, `month` date, `amount`, optional `updatedById`), unique on `(organizationId, source, month)`.
- Data impact:
  - Backfills `wonAt` for existing WON leads from the latest stage activity mentioning WON, else `updatedAt`.
  - Copies `PortalBudget` rows with `monthlySpendAed > 0` into `SourceSpend` for the current calendar month. Zero budget rows are not copied (they meant "not entered").
  - `PortalBudget` is left in place but unused by Money Map going forward.
- Risk: low. Additive columns/table plus a non-destructive copy. Portal enum values already exist as LeadSource values.
- Reversal: drop `SourceSpend`, drop `Lead.wonAt`. Money Map code can temporarily read `PortalBudget` again if needed.
- Code that depends on it: `src/lib/moneyStats.ts`, `src/routes/money.ts`, Money Map and Settings spend UI, lead stage updates that set/clear `wonAt`.

### 20261030203714_v1_4_guides  (V1.4, commit 471f97f)
- Date applied: 2026-10-31 (recorded on the main database on 2026-10-31 02:18 +05:30, see apply-log.md)
- Purpose: downloadable guides with gated PDFs, lead capture and daily stats.
- Changes:
  - New enums `GuideAudience` (BUYER, SELLER, INVESTOR, RENTER, GENERAL) and `GuideStatus` (DRAFT, PUBLISHED, ARCHIVED).
  - `LeadSource` enum gains `GUIDE`.
  - New tables `Guide`, `GuideRequest` (personal download token, consent record, campaign tags), `GuideDailyStat` (views and downloads per day).
  - `Organization` gains `privacyUrl`, `licenseLabel` (default "Licence no."), `licenseNumber`.
  - `Lead.phone` is now optional (guide leads can have an email only).
  - Indexes: `Guide(organizationId, status)`, unique `Guide(organizationId, slug)`, unique `GuideRequest(token)`, `GuideRequest(guideId, createdAt)`, `GuideRequest(leadId)`.
  - Foreign keys: Guide to Organization (cascade) and User (set null); GuideRequest to Guide (cascade) and Lead (set null); GuideDailyStat to Guide (cascade).
- Data impact: none. Additive, plus one relaxed constraint (`Lead.phone` allows NULL).
- Risk: low. PostgreSQL cannot use a newly added enum value in the same transaction, nothing in this migration does.
- Reversal: drop the three Guide tables and the two enums, set `Lead.phone` NOT NULL only after confirming no row has a NULL phone. The `GUIDE` enum value cannot be removed in PostgreSQL without recreating the type.
- Code that depends on it: `src/routes/guides.ts`, `src/routes/publicGuides.ts`, `src/lib/guideService.ts`, guide pages in `web`.

### 20261030193456_v1_1_org_market_and_places  (V1.1, commit cfb1f33)
- Date applied: 2026-10-31 (recorded on 2026-10-31 02:18 +05:30)
- Purpose: market settings that were hardcoded, and map coordinates for listings.
- Changes: `Organization` gains `currencyCode` (default AED), `currencyLabel` (default AED), `defaultCity` (default empty), `enabledPortals` (text array, default the four portals). `Listing` gains `lat`, `lng`, `placeId`; `Listing.city` default is now an empty string.
- Data impact: none. New columns are filled by their defaults.
- Risk: low.
- Reversal: drop the added columns (this loses saved coordinates and market settings).
- Code that depends on it: settings page, places search, listing maps, reports.

### 20261030132624_v1_init  (V1, commit 72a5d78)
- Date applied: 2026-10-30 (recorded on 2026-10-31 02:18 +05:30 as a baseline, see apply-log.md)
- Purpose: the original schema.
- Changes: auth tables (`User`, `Session`, `Account`, `Verification`), `Organization`, `Listing`, `ListingPortalStatus`, `Lead`, `LeadSourceEvent`, `LeadNote`, `ActivityEvent`, `CalendarEvent`, `Shortlist`, `ShortlistItem`, `PortalBudget`, and their enums and indexes.
- Data impact: none (initial schema). The first database was created with `prisma db push`, so this migration was rebuilt from git history and recorded as already applied.
- Risk: none.
- Reversal: drop everything (only for a throwaway database).
- Code that depends on it: all of it.

## Notes on versions that had no database change

V1.2 (bulk actions and duplicate merge), V1.3 (consultation plan only) and V1.5 (dashboard trends) changed no tables or columns. V1.5 only added `prisma` reads and a seed script (`scripts/seed-history.ts`, demo data).
