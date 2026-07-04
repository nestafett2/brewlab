CRITICAL — DO NOT ASK BEN WHICH FILE RENDERS SOMETHING. HE DOES NOT KNOW. IT IS CLAUDE'S JOB TO FIND IT. .TSX FILES CANNOT BE READ VIA ONEDRIVE (WRONG MIME TYPE) — DO NOT EVEN TRY. WORKFLOW: (1) LOOK IN ONEDRIVE FOR FOLDER STRUCTURE. (2) IDENTIFY THE LIKELY FILE FROM THE FOLDER LISTING. (3) ASK BEN TO UPLOAD THAT SPECIFIC FILE BY NAME. NEVER ASK BEN TO SEARCH, NEVER TRY ONEDRIVE FOR .TSX, NEVER WASTE HIS TIME.

CRITICAL — DO NOT ASK BEN WHICH FILE RENDERS SOMETHING. HE DOES NOT KNOW. IT IS CLAUDE'S JOB TO FIND IT. .TSX FILES CANNOT BE READ VIA ONEDRIVE (WRONG MIME TYPE) — DO NOT EVEN TRY. WORKFLOW: (1) LOOK IN ONEDRIVE FOR FOLDER STRUCTURE. (2) IDENTIFY THE LIKELY FILE FROM THE FOLDER LISTING. (3) ASK BEN TO UPLOAD THAT SPECIFIC FILE BY NAME. NEVER ASK BEN TO SEARCH, NEVER TRY ONEDRIVE FOR .TSX, NEVER WASTE HIS TIME.

CRITICAL — DO NOT ASK BEN WHICH FILE RENDERS SOMETHING. HE DOES NOT KNOW. IT IS CLAUDE'S JOB TO FIND IT. .TSX FILES CANNOT BE READ VIA ONEDRIVE (WRONG MIME TYPE) — DO NOT EVEN TRY. WORKFLOW: (1) LOOK IN ONEDRIVE FOR FOLDER STRUCTURE. (2) IDENTIFY THE LIKELY FILE FROM THE FOLDER LISTING. (3) ASK BEN TO UPLOAD THAT SPECIFIC FILE BY NAME. NEVER ASK BEN TO SEARCH, NEVER TRY ONEDRIVE FOR .TSX, NEVER WASTE HIS TIME.

CRITICAL — DO NOT ASK BEN WHICH FILE RENDERS SOMETHING. HE DOES NOT KNOW. IT IS CLAUDE'S JOB TO FIND IT. .TSX FILES CANNOT BE READ VIA ONEDRIVE (WRONG MIME TYPE) — DO NOT EVEN TRY. WORKFLOW: (1) LOOK IN ONEDRIVE FOR FOLDER STRUCTURE. (2) IDENTIFY THE LIKELY FILE FROM THE FOLDER LISTING. (3) ASK BEN TO UPLOAD THAT SPECIFIC FILE BY NAME. NEVER ASK BEN TO SEARCH, NEVER TRY ONEDRIVE FOR .TSX, NEVER WASTE HIS TIME.

CRITICAL — DO NOT ASK BEN WHICH FILE RENDERS SOMETHING. HE DOES NOT KNOW. IT IS CLAUDE'S JOB TO FIND IT. .TSX FILES CANNOT BE READ VIA ONEDRIVE (WRONG MIME TYPE) — DO NOT EVEN TRY. WORKFLOW: (1) LOOK IN ONEDRIVE FOR FOLDER STRUCTURE. (2) IDENTIFY THE LIKELY FILE FROM THE FOLDER LISTING. (3) ASK BEN TO UPLOAD THAT SPECIFIC FILE BY NAME. NEVER ASK BEN TO SEARCH, NEVER TRY ONEDRIVE FOR .TSX, NEVER WASTE HIS TIME.

CRITICAL — DO NOT ASK BEN WHICH FILE RENDERS SOMETHING. HE DOES NOT KNOW. IT IS CLAUDE'S JOB TO FIND IT. .TSX FILES CANNOT BE READ VIA ONEDRIVE (WRONG MIME TYPE) — DO NOT EVEN TRY. WORKFLOW: (1) LOOK IN ONEDRIVE FOR FOLDER STRUCTURE. (2) IDENTIFY THE LIKELY FILE FROM THE FOLDER LISTING. (3) ASK BEN TO UPLOAD THAT SPECIFIC FILE BY NAME. NEVER ASK BEN TO SEARCH, NEVER TRY ONEDRIVE FOR .TSX, NEVER WASTE HIS TIME.

CRITICAL — DO NOT ASK BEN WHICH FILE RENDERS SOMETHING. HE DOES NOT KNOW. IT IS CLAUDE'S JOB TO FIND IT. .TSX FILES CANNOT BE READ VIA ONEDRIVE (WRONG MIME TYPE) — DO NOT EVEN TRY. WORKFLOW: (1) LOOK IN ONEDRIVE FOR FOLDER STRUCTURE. (2) IDENTIFY THE LIKELY FILE FROM THE FOLDER LISTING. (3) ASK BEN TO UPLOAD THAT SPECIFIC FILE BY NAME. NEVER ASK BEN TO SEARCH, NEVER TRY ONEDRIVE FOR .TSX, NEVER WASTE HIS TIME.

# BrewLab — START HERE

**Last session: 05 July 2026**
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

## What Got Done Last Session

- ActionStack split: SETUP+ADD moved to left panel (RecipeActionLeft), EDIT+TOOLS stay right (ActionStack)
- Recipe sidebar toggle (open/close) — noted as done from previous session
- OEM/Collab brewer name fix — noted as done from previous session
- Recipe Explorer full redesign: sortable/draggable table view with Tax Batch #, Beer Name, Style, Date, Version columns; right-click column visibility menu with all optional columns (ABV, IBU, EBC, etc.); search bar; style filter dropdown; origin filter dropdown (Own/Collab/OEM)
- Global font swap: Inter (sans) + Geist Mono (mono) via Google Fonts
- Major theme/design polish: button active states, input focus amber glow, modal backdrop blur, toast refinement, sidebar hover accent, surface elevation, scrollbar thinning, border radius consistency, semantic color improvements (light mode green/red/amber)
- Lucide icons on ingredient section headers (inline per row)
- Libraries, Notes, Settings now open as closeable tabs
- Planner improvements: today line, week numbers, week separators, alternating week tint, hide empty vessels toggle, per-brew colors restored, print planner
- NTA Submitter: Recipe Checker / Submitted Register two-mode toggle
- window.confirm removed from Libraries bulk delete
- Tasting Panel added to Analysis tab: wizard modal (name → Hop & Fruit → Malt & Fermentation), 0–5 half-point scoring, averaged SVG radar charts, taster cards with delete
- Structured tasting note fields: Appearance, Aroma, Flavor, Mouthfeel, Overall Impression (replaces single textarea on Analysis tab)
- Brew Again segmented control on Analysis tab
- Star rating (1-5) on Analysis tab
- Print Tasting Sheet added to Analysis tab
- SCHEMA.md fully audited against live Supabase — 15 missing columns added, 15 missing localStorage keys added, multiple corrections
- Stub/placeholder audit completed — real unfinished features identified
- Sync layer / soft deletes deferred note updated: fold into PocketBase migration
- Migration: `2026-07-05_add_tasting_panel_table.sql` (applied to Supabase)

---

## What's Still Broken / Pending

### Print gaps
- Ferm & Packaging Sheet layout polish
- Tasting notes on print sheets still use old single `cs-tasting-notes` field — needs updating to use new structured fields (Appearance/Aroma/Flavor/Mouthfeel/Overall)
- PackagingTab TastingNotesModal and HistoryTab still use old single field — follow-up to unify

### Smoke tests pending
- Brewer field cross-device sync
- Extra additions field cross-device sync
- BeerXML round-trip
- Backup round-trip
- Monthly Report print (NO PACKAGE DATE label, Happoshu highlight)

### Unfinished features (from stub audit)
- Scale Recipe modal — toast stub only, not ported
- Send to Sales Team button (Checklist tab) — disabled stub
- FolderPreview New Subfolder / New Recipe Here buttons — TODO
- Library BeerXML Import/Export — menu navigates to Libraries but doesn't trigger file work
- Tax cone-height / yeast-amount fidelity — two TODOs in tax.ts
- window.confirm still in: TaxTab (3), EditOrderModal, Desktop.tsx (2), UseHarvestedYeastModal, store sync conflict

### Deferred
- Focus mode (full-screen toggle)
- BJCP 2025 style import
- Google Sheets monthly backup script (post-launch)
- Teiban / Gentei / One-off classification
- Typography overlay dev tool + full visual pass
- Voice-driven brew day logging
- Sync layer / soft deletes — fold into PocketBase migration
- PocketBase migration (post-launch, major effort)

---

## Next Session Focus

1. Scale Recipe modal — port from HTML spec
2. Unify tasting notes: update PackagingTab, HistoryTab, print sheets to use new structured fields
3. Fix migration file location: move `supabase/migrations/2026-07-05_add_tasting_panel_table.sql` to `brewlab/migrations/`
4. window.confirm cleanup pass

---

## Working Style

These are Ben's hard rules. Don't violate them.

- **CRITICAL — finding source files:** Claude cannot read .tsx/.ts files via OneDrive. When something needs changing in the UI, Claude's job is to find the right file — never ask Ben which file something is in. Workflow: (1) grep the repo for a distinctive string from the UI (e.g. a field name, label text, or function name). (2) Tell Ben the exact filename to upload. (3) Ben uploads. (4) Claude reads and writes the CC prompt. Example: `grep -rl "beerName" src/ --include="*.tsx"`. Find the file first, then ask for it by name.
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
- **No guessing.** Read the actual source files before writing any prompt. Never assume field names, component structure, or wiring. If a file is needed, ask Ben to upload it.

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
| Google Cloud | brewing@nomodachi.com | OAuth Client ID: `1069631621980-lr80vo546tjbskkk676cbdt2f2hbbgg7.apps.googleusercontent.com`. Authorised origins: `https://brewlab-red.vercel.app` and `https://brewlab-red.vercel.app/`. Project: BrewLab. |
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
