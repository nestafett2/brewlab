# BrewLab — Key Workflows

*July 2026 — This is the BrewLab user manual.*

---

## Workflow 1: Creating a Recipe

**1. Open the Recipes tab**
Click RECIPES in the top tab bar.

**2. Create a new recipe**
Click + New in the top-left of the recipe browser. A modal opens with two options:
- **Blank Recipe** — start from scratch. Enter a beer name and click Create.
- **From Template** — choose a saved template. Use the style filter dropdown or search box to find one.

**3. Fill in the recipe details**
In the header bar, enter:
- **Beer Name** — the brand/label name your customers will see.
- **Recipe Name (仕込記号)** — the internal tax identifier used in NTA filings.
- Style, Brew Date, Fermentation Vessel (FV), Brewer.

**4. Add ingredients**
Use the right sidebar buttons to add fermentables, hops, yeast, and misc ingredients. Click each ingredient row to select it, then use Edit in the sidebar to adjust amounts, use, and timing.

> The stat bar at the top updates live — OG, FG, IBU, ABV, and EBC calculate automatically.

**5. Set up profiles**
In the right sidebar under SETUP, assign:
- **Classification** — Beer or Happoshu (auto-set based on malt percentage, but you can override).
- **Equipment Profile** — your brewhouse specs (batch size, boil-off rate, default efficiency, default boil time).
- **Mash Profile** — your mash step program.

**6. Set up water chemistry (optional)**
Click the Water tab in the recipe sub-tab bar. Enter your target ions and the mineral solver calculates your salt additions for mash and sparge.

**7. Save as a template (optional)**
File menu → Save as Template.

> Once your brew date is set, use Tools → Add to Planner in the right sidebar to schedule the brew on the Production Planner.

---

## Workflow 2: Planning and Placing an Order

The Order Planner connects your upcoming brews to your ingredient stock levels so you can see exactly what you need to order and when.

### Step 1 — Schedule your upcoming brews

**1. Set a brew date on each recipe**
Open a recipe → set the Brew Date in the header bar.

**2. Add the brew to the Planner**
In the recipe's right sidebar, click Tools → Add to Planner. Adjust the brew date and vessel if needed, then confirm.

**3. Repeat for all upcoming brews**
Do this for every brew you're planning in the next few weeks.

### Step 2 — Check the forecast

**4. Open the Order Planner tab**
Click ORDER PLANNER in the top tab bar.

**5. Set the date range**
Use the date range dropdown in the toolbar to choose how far ahead to show (2 weeks / 1 month / 3 months / All). Default is 1 month.

**6. Read the forecast table**
The table shows your upcoming brews as columns, with ingredients as rows. Each brew column shows how much of that ingredient is needed and the running balance after that brew.

| Status | Meaning |
|--------|---------|
| **OK** | You have enough stock. |
| **LOW** | Stock is getting low — consider ordering soon. |
| **SHORT** | Not enough stock — you need to order before this brew. |
| **DONE** | This brew is already recorded. |

> Delivery columns appear between brew columns when you have pending orders or recurring orders. They show incoming stock in green and update the running balance automatically.

**7. Print the forecast (optional)**
Click 🖨 PRINT in the toolbar to print the current forecast view.

### Step 3 — Place an order

**8. Click + NEW ORDER**
The order modal opens with three columns.

**9. Left column — For These Brews**
Tick the checkboxes for the brews you want to order ingredients for. Checking or unchecking a brew instantly refreshes the suggested list in the middle column.

**10. Middle column — Suggested**
BrewLab calculates what you're short on based on your selected brews and current stock. Ingredients are grouped by supplier. Check the ones you want to include. Use Add Manually at the bottom for items not in the suggested list.

**11. Right column — My Order**
Your staged order appears here. Use the checkboxes to select multiple items, then use the bulk assign bar to set their supplier and expected delivery date in one step:
- Tick the items you want to assign
- Choose a supplier from the dropdown
- Pick an expected delivery date
- Click **Apply to Selected**

Repeat for different suppliers or delivery dates.

**12. Fill in Order Details**
At the bottom, set:
- **Supplier** — fills in any items that don't have a supplier yet
- **Order Date** — defaults to today
- **Notes** — optional order-level notes

**13. Click ✓ Create Order**
The order is logged. All items start as **pending**. The order appears in the Orders panel (click 📦 ORDERS in the toolbar).

> You can print a copy of your order from the order modal before creating.

### Step 4 — Track and receive the delivery

**14. Open the Orders panel**
Click 📦 ORDERS in the toolbar. Orders are grouped by order date. Expand a group to see its items.

**15. Mark items as ordered (when you send the email/fax)**
Tick the checkboxes next to the items you've sent the order for. In the bulk action bar at the bottom, select **ordered** from the dropdown and click **Apply**. The group status updates to IN PROGRESS.

**16. Mark items as received (when delivery arrives)**
As items arrive, tick their checkboxes. Select **received** from the dropdown and click **Apply**. Received items show with a strikethrough.

**17. Inventory updates automatically**
When an item is marked received, BrewLab writes the quantity into your inventory ledger immediately. Stock levels update and the forecast recalculates.

> When all items in an order are received, the group shows as COMPLETE in green. Completed orders are automatically removed after 30 days.

> ⚠ Inventory only updates when status is set to Received. This is intentional — NTA compliance requires that you only log stock you have physically received.

### Setting up recurring orders

If you receive the same ingredient on a regular schedule (e.g. 200 kg of pilsner malt every month), set up a recurring order template so it appears in the forecast automatically.

**1. Go to Settings → Order Planner → Recurring Orders**
**2. Click + New**
**3. Fill in:** Type, Ingredient (from your library), Qty, Supplier, Cadence (weekly / every 2 weeks / monthly), Start Date, and optional End Date.
**4. Click Save**

The recurring delivery will now appear as a delivery column in the forecast within the next 90 days.

---

## Workflow 3: Managing Inventory

Inventory tracks how much of each library ingredient (malts, hops, yeast, adjuncts) you have on hand. Every number on screen is driven by the tax ledger — the same record of IN (received) and OUT (used) movements that feeds NTA filings, so inventory and tax stay in sync automatically.

### Viewing current stock

**1. Open the Inventory tab**
Click INVENTORY in the top tab bar.

**2. Choose a section**
Use the dropdown in the toolbar: MALTS / HOPS / YEAST / ADJUNCTS / 🧫 HARVESTED.

**3. Read the stock table**
Each row is a library entry. ON HAND shows the current ledger balance — red when at or below zero, amber when below 15% of the opening balance.

> Click a column header to sort. Right-click the header row to show/hide columns. Drag a column header to reorder it.

**4. Filter to items in stock**
Click IN STOCK ONLY to hide anything with zero or negative balance.

**5. Edit a library entry or set an opening balance**
Double-click a row to edit it in the Library entry modal. Or type directly into the OPENING BAL. column to set the pre-ledger starting amount for that ingredient.

### Recording a manual ledger entry

**6. Click TAX LEDGER**
Toggles the table to a per-ingredient ledger view.

**7. Pick an ingredient**
Use the dropdown at the top of the ledger view.

**8. Add or edit an entry**
Click ＋ ADD ENTRY to log a new IN (received) or OUT (used) movement with date, quantity, and supplier/beer. Click an existing row to edit it.

> The Current Balance shown updates live as you switch between ingredients.

### Correcting inventory after a stock take

**9. Click ⚖ CORRECTION**
Shows every ingredient in the active section with its current digital balance and a Physical count field.

**10. Enter what you physically counted**
Any ingredient where the physical count differs from the digital balance automatically writes a correction ledger entry (IN if you have more than expected, OUT if less) when you confirm.

> Correction entries are flagged with a note in the Tax Ledger so you can tell them apart from normal receiving/usage movements.

### Recording ingredient usage from a brew

**11. Click 📝 Record Usage**
Available from the Order Planner forecast (right-click a brew column) or the Brew Day tab.

**12. Check off ingredients and confirm**
Review the pre-checked list, adjust quantities if needed, then click RECORD USAGE. This deducts every checked ingredient from inventory.

> If an ingredient can't be matched to your library, its row shows "⚠ not in library — click to fix". Click it to search your library and link the ingredient, or add it as a brand-new library entry on the spot — either way it's tracked in inventory from then on.

### Exporting inventory

**13. Click ⬇ EXPORT ▾**
Choose Export Tax Ledger XLSX (full ledger history for the section) or Export Current Page XLSX (just the visible stock table, matching your column and filter settings).

### Tracking harvested yeast

**14. Switch to 🧫 HARVESTED**
Shows every strain you've harvested, with current volume on hand and generation number.

**15. Log a harvest or a use**
Click + Log Harvest to record a new harvest for a strain, or − Log Use to record pitching harvested yeast into a brew.

> Generation numbers increment automatically each time you log a new harvest for a strain.

---

## Workflow 4: Brew Day

### Before brew day — print the prep sheet

**1. Open the recipe**
Go to Recipes → click the recipe you're brewing.

**2. Print the Prep Sheet**
Click Print ▾ on the right end of the recipe sub-tab bar → select Prep Sheet. Print or save as PDF. This sheet shows fermentables (mill first), water targets and salt additions, hops schedule, and yeast.

### On brew day — print the brew day sheet

**3. Print the Brew Day Sheet**
Click Print ▾ → Brew Day Sheet. Fill it in as you brew — mash readings, lauter flowmeter, boil additions (tick each one as you add it), knockout, pitch.

### After brewing — log the data

**4. Open the Brew Day tab**
In the recipe, click the Brew Day sub-tab.

**5. Enter your measured values**
Fill in: Measured OG, post-boil volume, volume into FV (CM reading — converts to litres automatically), pitch temp, ferm temp target, pitch pH, O₂ LPM and time, brew day notes.

**6. Record ingredient usage**
Click 📝 Record Usage at the bottom of the Brew Day tab. This deducts the ingredients from your inventory stock levels.

> Inventory only updates when you click Record Usage. It does not update automatically when you save brew day data.

---

## Workflow 5: Fermentation Tracking

**1. Open the Fermentation tab**
In the recipe, click the Fermentation sub-tab.

**2. Add fermentation readings**
Click the + button to add a reading. Enter gravity (°Plato), pH, and temperature. The fermentation chart updates automatically.

**3. Log dry hop additions**
Use the DH1 / DH2 / DH3 cards to record dry hop strain, date, and amount.

**4. Log yeast harvest (if applicable)**
In the Yeast Harvest section, log how many litres you harvested. Generation numbers track automatically.

> On tablet and mobile, use the blue FAB button to quickly add a fermentation reading.

---

## Workflow 6: Packaging

**1. Open the Packaging tab**
In the recipe, click the Packaging sub-tab.

**2. Enter packaging data**
Fill in: Transfer date, bright tank vessel, keg rows (size + count), can rows (size + count), flowmeter reading, carbonation (planned and actual). Total packaged volume, waste, and actual ABV calculate automatically.

**3. Add tasting and process notes**
Fill in the notes sections at the bottom.

---

## Workflow 7: NTA Tax Filing

> ⚠ Tax records are legally binding. Once you click "Record to Tax Master," figures are permanently frozen. Read this workflow carefully before proceeding.

**1. Open the Tax tab**
In the recipe, click the Tax sub-tab.

**2. Verify the tax data**
Check: brew date and brew number, classification (Beer or Happoshu), malt kg, fermentation dates, conditioning dates, total packaged volume.

> Water chemistry ingredients (gypsum, CaCl₂, acids, etc.) are automatically excluded from tax totals.

**3. Click "Record to Tax Master"**
This permanently snapshots all tax figures. Editing recipe or packaging data after this point will NOT change the filed figures.

**4. Open Tax Master**
Click TAX MASTER in the top tab bar. Filter by date range and classification, print individual sub-tabs, or export the full three-tab Excel workbook.

**5. Generate NTA submission form (if required)**
Click SUBMITTER in the top tab bar. Select the beer name. The app normalises all ingredients to per-1000L quantities and generates the CC1-5610-6 form. Click Print.

---

## Workflow 8: Syncing Across Devices

BrewLab syncs automatically between desktop, tablet, and mobile via Supabase.

- **Desktop** — full access. Design recipes, manage tax, place orders, configure settings.
- **Tablet** — brew-floor companion. Log brew day readings, fermentation, packaging.
- **Mobile** — lighter brew-floor companion. Same brew-floor logging as tablet.

### Manual sync

If data doesn't appear after changes on another device:

**1. Go to Settings → Connection**
**2. Click Pull** to pull the latest data from Supabase to this device.
**3. Click Push** to push this device's data up to Supabase.

> The app works in local-only mode if Supabase credentials are not configured. Data saves locally but won't sync until credentials are entered in Settings → Connection.

### What syncs where

- **Desktop only writes:** recipes, ingredients, settings, tax records.
- **Tablet and mobile write:** brew day data, fermentation log, packaging data, brewery notes.
- **Tax records:** desktop only.

---

*This document is maintained in the BrewLab repo at `docs/WORKFLOWS.md`. To export as Word or PDF, open in any Markdown editor and export, or run `pandoc docs/WORKFLOWS.md -o BrewLab_Workflows.docx`.*
