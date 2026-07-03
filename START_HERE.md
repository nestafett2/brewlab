# BrewLab — START HERE

**Last session: 03 July 2026 (Recipe UI polish, sync fixes, Order Planner overhaul, recurring orders)**
**Read this first. Everything else is reference.**

---

## What BrewLab Is

A brewery management app for **Nomodachi Brewery** in Amagasaki, Japan, owned by Ben.

Three interfaces — desktop, tablet (iPad), mobile (iPhone) — that all sync via Supabase. Covers recipe design, brew day logging, fermentation tracking, packaging, and Japanese tax authority (NTA) compliance.

**Important:** Ben plans to share BrewLab with other breweries. Each brewery brings their own Supabase project. The app is **single-brewery-per-database** — distributed as a shareable app where each user supplies their own Supabase credentials via Settings → Connection.

---

## Where the Project Is At

- **HTML reference apps** (`brewlab-desktop.html`, `brewlab-tablet.html`, `brewlab-mobile.html`) — feature-complete, hosted on GitHub Pages. **The authoritative spec for the rebuild.**
- **React PWA rebuild** — feature-complete on every page. Sync layer rebuilt. Order Planner substantially redesigned beyond the HTML spec. What's left is end-of-port polish and print sheet work.
- **Supabase project** active. URL and anon key in CLAUDE.md.
- **No real brewery data yet** — Ben hasn't started production brewing. Test recipes are rebuild debris and can be deleted any time.

---

## Hosting

- **Live URL:** https://brewlab-red.vercel.app
- **Source repo:** https://github.com/nestafett2/brewlab
- Auto-deploys on every push to `main`.
- Per-user Supabase credentials supplied via Settings → Connection in the live app (not Vercel env vars), preserving the shareable single-brewery-per-DB model.

---

## Tabs Status

| Tab | State | Notes |
|---|---|---|
| Recipe | ✓ working | |
| Brew Day | ✓ working | |
| Fermentation | ✓ working | DH pH prediction live |
| Packaging | ✓ working | |
| Water | ✓ working | |
| Tax / Tax Summary / NTA / Tax Master | ✓ working | |
| Analysis | ✓ working | |
| Batch History | ✓ working | |
| Checklist | ✓ working | |
| Planner | ✓ working | |
| Notes | ✓ working | |
| Libraries | ✓ working | |
| Inventory / Order Planner | ✓ working | Substantially redesigned this session |
| Settings (all sub-tabs) | ✓ working | Order Planner sub-tab added |
| Templates | ✓ working | |
| Tariff Reduction | ✓ working | |

---

## What Got Done Last Session (03 July 2026)

**hopLib AA% wired** — brew day sheet print now shows AA% column for hop additions, looked up from hopLib by name.

**Recipe tab UI polish** — ingredient cards area gets `var(--panel)` background (theme-aware); stat strip gap widened; `rp-stat-val` / `rp-stat-label` font weight reduced to 400; batch L unit fixed to sit flush with the input.

**boilTime / bhEff / whirlpoolTemp sync fixed** — these three fields were hardcoded in `rowToRecipe` and never written by `recipeToRow`. Migration `2026-07-03-recipe-process-fields.sql` adds `bh_eff`, `boil_time`, `whirlpool_temp` columns to `recipes`. Both functions now round-trip them correctly.

**Default bhEff and boilTime moved to equipment profile** — `EquipmentProfile` gains `defaultBhEff` and `defaultBoilTime` optional fields. New recipe creation and BeerXML import now read from the active equipment profile instead of hardcoded defaults. `defaultBhEff` removed from Settings → Advanced (where it was briefly added). Settings → Equipment Profiles panel updated with the new fields.

**BeerXML import now uses your system efficiency** — on import, `bhEff` comes from the active equipment profile (not the XML's `<EFFICIENCY>`), and OG/FG are recalculated from the grain bill at your efficiency rather than imported directly.

**Water chem salts fixed on brew day print** — imported water chemistry ingredients (phosphoric acid, calcium chloride, gypsum etc.) with `use: 'mash'` or `use: 'boil'` were showing in the boil additions table. Fixed by using `WATER_CHEM_KW` name regex directly in the print sheet (bypassing the `isWaterChem` use-field rule which correctly rejects them for tax purposes but wrongly excluded them from the salt sections on print).

**Duplicate recipe bug fixed** — `duplicateRecipe` store action now sets `name: ''` instead of appending `' (copy)'`. The Recipe Name (仕込記号) is the NTA tax identifier and must be blank on a duplicate.

**Order Planner toolbar redesign** — section filter (ALL/MALTS/HOPS/YEAST/ADJUNCTS) collapsed into a single dropdown. Import Library (XML) and Import Stock (CSV) moved to Settings → Order Planner. Toolbar now fits on one line: section dropdown | date range filter | GOOGLE SHEETS | ORDERS | EXPORT XLSX | + NEW ORDER.

**Order creation redesign (AddOrderModal)** — MY ORDER staging area now has checkboxes per item + a bulk-assign bar (Select All, supplier dropdown, delivery date, Apply to Selected). ORDER DETAILS simplified to: Supplier (fills items with no supplier set), Order Date, Notes. Review & Create step removed — CREATE ORDER is always visible. Add Manually simplified to Type + Ingredient + Qty + Supplier only.

**Orders panel redesign** — items grouped by `orderDate`. Group header shows derived status (PENDING / IN PROGRESS / COMPLETE) and delivery date range. Each item row has a checkbox. Bulk action bar at bottom: count + "Mark as" dropdown (pending/ordered/received) + APPLY + deselect. Received items show with strikethrough. Auto-deletes complete order groups 30 days after all items received.

**Forecast table improvements:**
- Alternating column backgrounds + vertical divider (`borderRight`) between each brew column pair
- Date range filter dropdown in toolbar (2 weeks / 1 month / 3 months / All; default 1 month)
- Print button — prints current forecast view via `forecastPrint.ts`
- Fixed column width (120px per brew/delivery column, word-wrap at word boundaries, no mid-word breaks)

**Recurring orders** — new `RecurringOrder` type and store slice (`bl_recurring_orders`, syncs via SETTINGS_KEYS). Define templates in Settings → Order Planner: ingredient (from library dropdown), type, qty, supplier, cadence (weekly/biweekly/monthly), start date, optional end date. `expandRecurringOrders` generates synthetic delivery columns in the forecast within a 90-day window. Shown as delivery columns in the forecast table automatically.

**Per-recipe OEM/Collab field** — noted for future implementation. Per-recipe field with OEM/Collab/Own Brand classification + text field for who it's for. Sortable in recipe browser.

---

## What's Still Broken / Pending

### Housekeeping (do soon)
- Move project out of OneDrive. Current location: `/Users/ben/Library/CloudStorage/OneDrive-株式会社オープンエア/Apps/Brewing App`. OneDrive placeholder files break Git and Node builds; moving to `~/Developer/brewlab` is the real fix.
- Retroactive migration files for `recipes.extra_additions` and `recipes.brewer`. Both columns are live in Supabase but no `.sql` file saved in `migrations/`. Match the `YYYY-MM-DD_description.sql` naming convention.
- Migration `2026-07-03-recipe-process-fields.sql` naming: CC named it `06-recipe-process-fields.sql` then renamed to `2026-07-03-recipe-process-fields.sql` — verify the file exists in the right place.

### Print gaps
- Recurring orders don't show in printed forecast (`forecastPrint.ts` calls `deriveTimeline` without `recurringOrders`). Wire it to match the on-screen forecast.
- Brew Day Sheet layout still needs polish — fit to one page, grid alignment pass pending.
- Sheet 3 — Ferm + Packaging combined daily log. Design + impl pending.
- Sheet 4 — Brew Day filled (auto-archive). Revisit after Ben uses blank sheet in production.
- "Print Full Brew Packet" — after individual sheets stabilise.
- Monthly Report A3 vs A4 — revisit once production data exists.

### Feature gaps
- File menu: Export Selected placeholder (needs design discussion).
- NTA Submitter: dedicated Submitted Recipes view (sortable by date, Print All).
- NTA Submitter: Print Form button should gate on submission status.
- Recipe browser: OEM/Collab/Own Brand field (noted this session, deferred).
- Focus mode: full-screen toggle hiding sidebar and action stack (noted this session, deferred).
- Inventory screen too wide (layout bug, needs investigation).

### Smoke tests pending
- Numeric formatting (integer batch sizes, 1 dp ABV everywhere).
- Toast/undo retrofit (recipe delete confirms, MashProfileModal Reset, WaterTab Clear, FermTab log row delete).
- Beer Buffer Capacity input in Settings → Advanced + Ferm tab residual-acid response.
- Equipment + Mash + Pitch profile locking.
- Templates BJCP filter.
- BeerXML round-trip (export → re-import → verify equivalent).
- Backup round-trip (export → import → reconnect → verify).
- Yeast harvest picker formatted pair display.
- Prep Sheet print — all sections, target chips, fallbacks.
- Brew Day Sheet print — ferm/pitch temps from brewDay fields, sparge tracker, mash grid.
- Brewer field cross-device sync.
- Extra additions field cross-device sync.
- Monthly Report print — NO PACKAGE DATE label, Happoshu highlight.

### Calibration
- `BEER_BUFFER_PH_PER_MEQ_L` (default 0.04) — recalibrate once production data exists.

### Deferred
- BJCP 2025 style guideline import.
- Google Sheets sync (one-way, stubbed).
- Teiban / Gentei / One-off classification.
- HTML/React label divergence.
- Typography pass (after all tabs visible together).

### Future products
- AI-powered recipe analysis tool (claude.ai not API).
- Sales team upcoming-brews app.
- Can count reporting tool.
- Voice-driven Brew Day logging via Claude Project.

---

## Next Session Focus

1. **User manual update** — add Order Planner workflow (recurring orders, creating orders, receiving deliveries).
2. **Brew Day Sheet print polish** — fit to one page.
3. **NTA Submitter improvements** — Submitted Recipes view + print gate.
4. **Recurring orders print gap** — wire `forecastPrint.ts` to include recurring delivery columns.

---

## Working Style

These are Ben's hard rules. Don't violate them.

- **No assumptions.** If something isn't obvious from these handoff docs, ask one specific question. Don't fabricate context.
- **Be honest.** Never claim you've checked, read, or compared something you haven't. If you're guessing, say "I'm guessing." If you don't know, say "I don't know."
- **Read the HTML app source** before building any feature. The HTML is the spec.
- **Show planned changes before writing code** for non-trivial work. Skip the plan step for small obvious fixes (CSS tweaks, single-line bugs, missing alerts).
- **Complete each feature fully** in one pass — UI + calculations + state + Supabase sync.
- **Don't redesign without permission.** Copy layout, spacing, fonts, and behaviour from the HTML app exactly — unless asked to deviate.
- **Tax logic is high-stakes.** Extra care on `snap_*` fields, classification, and ledger entries.
- **Sync bugs are subtle.** Read SYNC.md before touching any data layer. **Verify in Supabase Table Editor directly — and refresh it (Ctrl+Shift+R) — before debugging rendering code.**
- **Be direct.** Ben doesn't need long explanations of basic concepts unless he asks for them.
- **Keep scope tight.** Catch yourself when investigation expands beyond the original goal — flag it, ask whether to continue or defer, don't expand silently.
- **Verify state before fixing.** Before assuming something's broken, check what the React app actually does — bugs in handoff notes are often already resolved.
- **Always flag the caveats** when reporting back from Claude Code. Ben wants those surfaced every time.
- **OneDrive connector is available.** Ben's project files are on OneDrive. Always check it when Ben says files are there — never say the connector doesn't exist. Source `.tsx`/`.ts` files are not readable via the connector (wrong MIME type) but folder structure and `.md`/`.json` files are. Ask Ben to upload source files directly.

---

## Reference Files

| File | What's in it | When to read |
|---|---|---|
| `START_HERE.md` | This file. State of project + next step. | Every session, first. |
| `CLAUDE.md` | Project decisions, architecture, business rules, schema/sync quick refs. | When you need context on a specific decision. |
| `FEATURES.md` | Per-device feature inventory. | When you need to know what each device does. |
| `SESSION_LOG.md` | Per-session history. | When you need the reasoning behind a past decision. |
| `CALCULATIONS.md` | Every formula. | Before implementing any calculation. |
| `SCHEMA.md` | Supabase tables, columns, localStorage key mappings. | Before touching the data layer. |
| `SYNC.md` | localStorage ↔ Supabase sync rules. | Before touching anything that writes to Supabase. |
| `brewlab-desktop.html` | The authoritative spec. ~20,850 lines. | Before building any feature. |
| `brewlab-tablet.html` | Tablet reference. | Before building tablet layout. |
| `brewlab-mobile.html` | Mobile reference. | Before building mobile layout. |

---

## Accounts & Services

| Service | Account | Notes |
|---|---|---|
| Supabase | brewing@nomodachi.com | Project ID: `inxipvdturxgeapsznxb` |
| GitHub | nestafett2 (personal account) | Repo: `github.com/nestafett2/brewlab`. |
| Vercel | Ben's personal account | Deployed at `https://brewlab-red.vercel.app`, auto-deploys on push to `main`. |
| Netlify | — | Abandoned. Hit free-tier bandwidth limit. Do not use. |

**Supabase URL:** `https://inxipvdturxgeapsznxb.supabase.co`
**Supabase Anon Key:** in CLAUDE.md.

---

## How to Run the React App Locally

1. Open Terminal on Mac
2. `cd` to the brewlab folder
3. `npm run dev`
4. Open the printed `localhost:5173` (or 5174) URL in Chrome

---

## End-of-Session Checklist

When wrapping up a session, update **this file** with:
- Date of the session
- What got built (under "What Got Done Last Session" — replace previous content)
- What's still broken (under "What's Still Broken / Pending")
- What the next concrete step is

Keep this file short — under one page worth of "where are we and what's next." Append a new dated entry to **SESSION_LOG.md** if the session was substantial. **CLAUDE.md** changes only when an architectural decision changes. Detailed reference stays in CALCULATIONS / SCHEMA / SYNC / FEATURES.
