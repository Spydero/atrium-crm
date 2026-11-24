# Dashboard / Money Map comparative charts

Plan only. Sources: HubSpot, Pipedrive, Follow Up Boss, Salesforce practices + Atrium code (`api/src/routes/dashboard.ts`, Money Map). Grok + multi-search review 2026-10-31.

## Verdict

**Yes — add one Won vs Lost comparative chart. No — do not overlay Qualified / Offer / Lost on the New leads series.**

Industry splits three questions into different reports:

| Question | Chart | Examples |
|---|---|---|
| Did we get demand? | Intake over time | HubSpot deals created; FUB new leads |
| Did we close? | Won vs Lost (closed only) | [Pipedrive win/loss conversion](https://support.pipedrive.com/en/article/insights-reports-deal-conversion); [HubSpot deals won & lost](https://knowledge.hubspot.com/reports/create-sales-reports-in-the-sales-analytics-suite) |
| Where do we leak? | Funnel / stage conversion | Pipedrive funnel; Salesforce pipeline inspection |

Win rate = **won ÷ (won + lost)** in the period. Never put open leads in the denominator ([Salesforce guidance](https://admin.salesforce.com/blog/2021/how-i-solved-this-empower-a-new-sales-vp-using-reports-with-formulas)).

Follow Up Boss overlays **related** activity (new leads vs calls), not every stage on one axis ([lead source report](https://help.followupboss.com/hc/en-us/articles/9229981219351-Speed-to-Lead-Lead-Source-Report)).

## What Atrium has today

Dashboard tabs (`/app`): **New leads** · **Viewings** · **Deals won** (+ compare previous period).

| Metric | Clock today | Issue |
|---|---|---|
| New leads | `createdAt` | Correct for intake (includes later-Lost) |
| Viewings | calendar `startsAt` | Fine (event outcome, not stage) |
| Deals won | `updatedAt` while stage=WON | Should be `wonAt` |
| Close-rate KPI | All-time WON/(WON+LOST); also `winRateOpen` = WON/(open+WON) | Open-in-denominator is wrong; ignore range |

Money Map is source ROI (cost per viewing / win), not this trend surface.

## Add vs skip

### Phase 0 — shipped 2026-10-31

1. Deals won dated by `wonAt` (fallback `updatedAt` only if null).
2. `Lead.lostAt` with set/clear mirroring `wonAt` (PATCH + bulk).
3. **Outcomes** tab: stacked Won | Lost; **Show: Won + Lost | Won | Lost** focus (with existing Date / Highest / Lowest sort).
4. Win-rate scorecard: `wins ÷ (wins+losses)` in range; "—" if closed &lt; 5.
5. Close-rate KPI = all-time closed-only; open+won hint removed.
6. Deep links: `slice=won|lost|closed` + `wonFrom`/`lostFrom`/`createdFrom` date params on `/app/leads`.

### Add (Phase 0 checklist — done)

1. Fix Deals won → date by `wonAt` (fallback `updatedAt` only if null).
2. Add `Lead.lostAt` (mirror `wonAt` set/clear rules).
3. New tab **Outcomes**: grouped bars **Won | Lost** by day/week/month; compare-to-previous per series.
4. Win-rate scorecard on that tab: `wins ÷ (wins+losses)` in range; show "—" if closed &lt; 5.
5. Relabel or range-scope the close-rate KPI; **remove** open+won hint.
6. Deep links with date params (align with `PLAN_LEADS_LAYOUT` slices):

| Tab | Link |
|---|---|
| New leads | `/app/leads?createdFrom=&createdTo=` (no stage — Lost still listed) |
| Deals won / Outcomes Won | `/app/leads?slice=won&wonFrom=&wonTo=` |
| Outcomes Lost | `/app/leads?slice=lost&lostFrom=&lostTo=` |

### Add (Phase 1 — Money Map)

- Source-chart toggles: lead→viewing %, viewing→win % (rates already partly computed).
- Short cohort funnel: Intake → completed viewing → won (+ still-open / lost as leak counts, not ordered stages).
- Range win rate on totals row. Keep cost-per-viewing as hero.

### Do not add

- Lost / Qualified / Offer as series on **New leads**.
- Six-stage time series or ordered funnel (Atrium skips stages; HubSpot drops skips).
- Win-rate line on the volume axis; same-week wins ÷ same-week new leads labeled “conversion”.
- Loss-reason taxonomy, velocity, waterfall, YoY, rep league — until volume + `lostAt` + history justify it.
- Forcing dashboard New leads count ≡ Money Map source-event count (different grains).

## Definitions to lock

| Metric | Clock |
|---|---|
| New leads | `createdAt` in bucket (1 row / lead) |
| Won | `wonAt` when entering WON; clear if leave WON |
| Lost | `lostAt` when entering LOST; clear if leave LOST |
| Win rate | closed-only, range-scoped |
| Qualified / Offer | stock snapshot only until stage-entered history exists |

## Non-goals

Stage-event history table (gate for “entered Qualified this week”), merging Money Map + dashboard into one control, rewriting pipeline AED inclusion of WON.
