# Migration apply log

Append-only record of every `npm run db:deploy` run: when, who, which commit, which database, what was applied, and the result.
Written by `scripts/db-tools.ts`. Do not edit old entries.

## 2026-10-31 02:18:05 +05:30 - BASELINE (marked applied, no SQL run)
- Database: atrium @ localhost:5432 (schema public)
- Run by: jyothiranands (manual, `prisma migrate resolve --applied`)
- Code version: 15abc83 on main
- Why: until this point the schema was kept in sync with `prisma db push`, which leaves no record. The three migrations below were rebuilt from the schema in git history (72a5d78, cfb1f33, 471f97f). The database already had exactly this structure, so they were recorded as applied instead of being run again.
- Marked applied: 20261030132624_v1_init, 20261030193456_v1_1_org_market_and_places, 20261030203714_v1_4_guides
- Checks before baselining:
  - Replayed all three migrations on an empty scratch database with `prisma migrate deploy`: all applied.
  - `prisma migrate diff` of that scratch database against `schema.prisma`: no difference.
  - `prisma migrate diff` of the real database against `schema.prisma`: no difference.
  - After baselining, `prisma migrate status`: "Database schema is up to date".
- Data impact: none. No data was read, changed or removed.

## 2026-10-31 02:25 +05:30 - RENAME of baseline migration folders (no SQL run)
- Database: atrium @ localhost:5432 (schema public)
- Run by: jyothiranands (manual)
- Why: the baseline folders were first named with local time. Prisma names new migrations in UTC, so a new migration would have sorted before the baseline ones. The folders now use the UTC time of the commit each one was rebuilt from, and the matching `migration_name` rows in `_prisma_migrations` were updated.
- Old to new: 20261030185624_v1_init to 20261030132624_v1_init; 20261031010456_v1_1_org_market_and_places to 20261030193456_v1_1_org_market_and_places; 20261031020714_v1_4_guides to 20261030203714_v1_4_guides
- File contents and checksums are unchanged. Nothing had been shared or applied elsewhere under the old names.
- Check afterwards: `npm run db:status` reports 3 applied, 0 pending, no drift.

## 2026-10-31 16:05:05 +05:30 - deploy - SUCCESS
- Database: atrium @ localhost:5432 (schema public)
- Run by: jyothiranands@Jyothiranands-MacBook-Pro.local
- Code version: b92682a on main, uncommitted prisma changes: yes (uncommitted prisma changes)
- Pending before: 20261031103435_money_map_source_spend
- Applied: 20261031103435_money_map_source_spend
- Backup: backups/2026-10-31-16-05-04-p05-30-before-20261031103435_money_map_source_spend.sql (299 KB)
- Duration: 1.2s

```
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "atrium", schema "public" at "localhost:5432"

4 migrations found in prisma/migrations

Applying migration `20261031103435_money_map_source_spend`

The following migration(s) have been applied:

migrations/
  └─ 20261031103435_money_map_source_spend/
    └─ migration.sql
      
All migrations have been successfully applied.
┌─────────────────────────────────────────────────────────┐
│  Update available 6.19.0 -> 8.0.0-rc.29                 │
│                                                         │
│  This is a major update - please follow the guide at    │
│  https://pris.ly/d/major-version-upgrade                │
│                                                         │
│  Run the following to update                            │
│    npm i --save-dev prisma@latest                       │
│    npm i @prisma/client@latest                          │
└─────────────────────────────────────────────────────────┘
```

## 2026-10-31 16:28:11 +05:30 - deploy - SUCCESS
- Database: atrium @ localhost:5432 (schema public)
- Run by: jyothiranands@Jyothiranands-MacBook-Pro.local
- Code version: 6070fb8 on main, uncommitted prisma changes: yes (uncommitted prisma changes)
- Pending before: 20261031105716_calendar_outcomes_notes
- Applied: 20261031105716_calendar_outcomes_notes
- Backup: backups/2026-10-31-16-28-10-p05-30-before-20261031105716_calendar_outcomes_notes.sql (316 KB)
- Duration: 1.0s

```
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "atrium", schema "public" at "localhost:5432"

5 migrations found in prisma/migrations

Applying migration `20261031105716_calendar_outcomes_notes`

The following migration(s) have been applied:

migrations/
  └─ 20261031105716_calendar_outcomes_notes/
    └─ migration.sql
      
All migrations have been successfully applied.
```

## 2026-10-31 17:24:41 +05:30 - deploy - SUCCESS
- Database: atrium @ localhost:5432 (schema public)
- Run by: jyothiranands@Jyothiranands-MacBook-Pro.local
- Code version: b893f2a on main, uncommitted prisma changes: yes (uncommitted prisma changes)
- Pending before: 20261031115409_org_channels
- Applied: 20261031115409_org_channels
- Backup: backups/2026-10-31-17-24-40-p05-30-before-20261031115409_org_channels.sql (330 KB)
- Duration: 1.2s

```
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "atrium", schema "public" at "localhost:5432"

6 migrations found in prisma/migrations

Applying migration `20261031115409_org_channels`

The following migration(s) have been applied:

migrations/
  └─ 20261031115409_org_channels/
    └─ migration.sql
      
All migrations have been successfully applied.
```

## 2026-10-31 18:17:30 +05:30 - deploy - SUCCESS
- Database: atrium @ localhost:5432 (schema public)
- Run by: jyothiranands@Jyothiranands-MacBook-Pro.local
- Code version: b893f2a on main, uncommitted prisma changes: yes (uncommitted prisma changes)
- Pending before: 20261031124641_platform_admin
- Applied: 20261031124641_platform_admin
- Backup: backups/2026-10-31-18-17-29-p05-30-before-20261031124641_platform_admin.sql (225 KB)
- Duration: 1.1s

```
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "atrium", schema "public" at "localhost:5432"

7 migrations found in prisma/migrations

Applying migration `20261031124641_platform_admin`

The following migration(s) have been applied:

migrations/
  └─ 20261031124641_platform_admin/
    └─ migration.sql
      
All migrations have been successfully applied.
```

## 2026-10-31 ~21:15 +05:30 - deploy - SUCCESS (manual `prisma migrate deploy`)
- Database: atrium @ localhost:5432 (schema public)
- Run by: jyothiranands (agent session; not via `npm run db:deploy`, so no backup row)
- Pending before: 20261031154500_lead_lost_at
- Applied: 20261031154500_lead_lost_at
- Result: `prisma migrate status` → Database schema is up to date (8 migrations)
- Data impact: LOST/WON clock backfill in migration SQL

## 2026-11-24 16:33:24 +05:30 - deploy - SUCCESS
- Database: atrium @ localhost:5432 (schema public)
- Run by: jyothiranands@Jyothiranands-MacBook-Pro.local
- Code version: e7b5c63 on main, uncommitted prisma changes: yes (uncommitted prisma changes)
- Pending before: 20261124100000_messaging
- Applied: 20261124100000_messaging
- Backup: backups/2026-11-24-16-33-23-p05-30-before-20261124100000_messaging.sql (76 KB)
- Duration: 1.6s

```
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "atrium", schema "public" at "localhost:5432"

9 migrations found in prisma/migrations

Applying migration `20261124100000_messaging`

The following migration(s) have been applied:

migrations/
  └─ 20261124100000_messaging/
    └─ migration.sql

All migrations have been successfully applied.
```

## 2026-11-24 16:58:11 +05:30 - deploy - SUCCESS
- Database: atrium @ localhost:5432 (schema public)
- Run by: jyothiranands@Jyothiranands-MacBook-Pro.local
- Code version: e7b5c63 on main, uncommitted prisma changes: yes (uncommitted prisma changes)
- Pending before: 20261124110000_shareable_chat_links
- Applied: 20261124110000_shareable_chat_links
- Backup: backups/2026-11-24-16-58-10-p05-30-before-20261124110000_shareable_chat_links.sql (89 KB)
- Duration: 1.3s

```
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "atrium", schema "public" at "localhost:5432"

10 migrations found in prisma/migrations

Applying migration `20261124110000_shareable_chat_links`

The following migration(s) have been applied:

migrations/
  └─ 20261124110000_shareable_chat_links/
    └─ migration.sql

All migrations have been successfully applied.
```

## 2026-11-24 17:02:12 +05:30 - deploy - SUCCESS
- Database: atrium @ localhost:5432 (schema public)
- Run by: jyothiranands@Jyothiranands-MacBook-Pro.local
- Code version: e7b5c63 on main, uncommitted prisma changes: yes (uncommitted prisma changes)
- Pending before: 20261124120000_chat_link_expiry
- Applied: 20261124120000_chat_link_expiry
- Backup: backups/2026-11-24-17-02-11-p05-30-before-20261124120000_chat_link_expiry.sql (90 KB)
- Duration: 1.5s

```
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "atrium", schema "public" at "localhost:5432"

11 migrations found in prisma/migrations

Applying migration `20261124120000_chat_link_expiry`

The following migration(s) have been applied:

migrations/
  └─ 20261124120000_chat_link_expiry/
    └─ migration.sql

All migrations have been successfully applied.
```

## 2026-11-24 17:16:40 +05:30 - deploy - SUCCESS
- Database: atrium @ localhost:5432 (schema public)
- Run by: jyothiranands@Jyothiranands-MacBook-Pro.local
- Code version: e7b5c63 on main, uncommitted prisma changes: yes (uncommitted prisma changes)
- Pending before: 20261124130000_client_chat_pin
- Applied: 20261124130000_client_chat_pin
- Backup: backups/2026-11-24-17-16-39-p05-30-before-20261124130000_client_chat_pin.sql (92 KB)
- Duration: 1.2s

```
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "atrium", schema "public" at "localhost:5432"

12 migrations found in prisma/migrations

Applying migration `20261124130000_client_chat_pin`

The following migration(s) have been applied:

migrations/
  └─ 20261124130000_client_chat_pin/
    └─ migration.sql

All migrations have been successfully applied.
```

## 2026-11-24 17:24:47 +05:30 - deploy - SUCCESS
- Database: atrium @ localhost:5432 (schema public)
- Run by: jyothiranands@Jyothiranands-MacBook-Pro.local
- Code version: e7b5c63 on main, uncommitted prisma changes: yes (uncommitted prisma changes)
- Pending before: 20261124140000_chat_attachments
- Applied: 20261124140000_chat_attachments
- Backup: backups/2026-11-24-17-24-46-p05-30-before-20261124140000_chat_attachments.sql (94 KB)
- Duration: 1.4s

```
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "atrium", schema "public" at "localhost:5432"

13 migrations found in prisma/migrations

Applying migration `20261124140000_chat_attachments`

The following migration(s) have been applied:

migrations/
  └─ 20261124140000_chat_attachments/
    └─ migration.sql

All migrations have been successfully applied.
```
