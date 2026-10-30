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
