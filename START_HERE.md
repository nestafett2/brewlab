# BrewLab — START HERE

**Last session: 03 July 2026 (Inventory polish, Export Selected, Record Usage resolver, Overview reminders)**
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
| Inventory / Order Planner | ✓ working | |
| Settings (all sub-tabs) | ✓ working | |
| Templates | ✓ working | |
| Tariff Reduction | ✓ working | |

---

## What Got Done Last Session (03 July 2026)

**Inventory toolbar condensed** — MALTS/HOPS/YEAST/ADJUNCTS/HARVESTED buttons collapsed into a single dropdown. TAX LEDGER is now a standalone toggle; the redundant CURRENT button removed.

**Inventory layout fixed** — page constrained to 1024px centered. INGREDIENT column capped at 260px with ellipsis truncation and full-name tooltip on hover.

**Recurring orders print gap fixed** — `forecastPrint.ts` now passes `recurringOrders` to `deriveTimeline`, so printed forecasts match the on-screen forecast.

**Export Selected** — File menu → Export Selected now exports all highlighted sidebar recipes as a zip file, one BeerXML per recipe. Compatible with BeerSmith and other apps. Uses jszip (statically imported, ~95KB bundle addition).

**File menu stay-open bug fixed** — menu items no longer re-open the dropdown after being clicked.

**Record Usage — "not in library" resolver** — ingredients that don't match a library entry now show "⚠ not in library — click to fix". Clicking opens an inline panel to either search and link to an existing library entry, or add the ingredient as a new library entry. Link is saved permanently via `libId` on the recipe ingredient.

**Record Usage — checkbox reset bug fixed** — stable UIDs (`section_name` instead of counter) plus brewId-aware reseed logic. Resolving a "not in library" row no longer wipes the user's checkbox selections.

**Overview recording reminders** — each reminder row now has a clickable brew name (opens the recipe) and a Dismiss button (permanently hides that reminder via `bl_dismissed_rec_reminders` in localStorage).

---

## What's Still Broken / Pending

### Housekeeping (do soon)
- Move project out of OneDrive. Current location: `/Users/ben/Library/CloudStorage/OneDrive-株式会社オープンエア/Apps/Brewing App`. OneDrive placeholder files break Git and Node builds; moving to `~/Developer/brewlab` is the real fix.
- Retroactive migration files for `recipes.extra_additions` and `recipes.brewer`. Both columns are live in Supabase but no `.sql` file saved in `migrations/`.
- Verify `2026-07-03-recipe-process-fields.sql` exists in the right place in `migrations/`.

### Print gaps
- Brew Day Sheet layout — fit to one page, grid alignment pass pending.
- Sheet 3 — Ferm + Packaging combined daily log. Design + impl pending.
- Sheet 4 — Brew Day filled (auto-archive). Revisit after Ben uses blank sheet in production.
- "Print Full Brew Packet" — after individual sheets stabilise.
- Monthly Report A3 vs A4 — revisit once production data exists.

### Feature gaps
- NTA Submitter: dedicated Submitted Recipes view (sortable by date, Print All).
- NTA Submitter: Print Form button should gate on submission status.
- Recipe browser: OEM/Collab/Own Brand field (noted, deferred).
- Focus mode: full-screen toggle hiding sidebar and action stack (noted, deferred).

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

1. **Brew Day Sheet print polish** — fit to one page.
2. **NTA Submitter improvements** — Submitted Recipes view + print gate.
3. **Smoke tests** — work through the pending list above.

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
- **Update WORKFLOWS.md** when any user-facing workflow changes or a new one is added. This is part of the session wrap-up, not optional. CC updates `docs/WORKFLOWS.md` directly — it's a Markdown file in the repo.

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
| `docs/WORKFLOWS.md` | Step-by-step workflow guide for all major tasks. | When updating the user manual or writing CC prompts that affect user-facing workflows. |

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
