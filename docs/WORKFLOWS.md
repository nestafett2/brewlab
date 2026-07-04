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
- **Origin (Own Brand / Collab / OEM)** — click to toggle. If the recipe is a Collab or OEM, a partner name field appears below.

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

### Saving a Recipe as a Template

Templates let you reuse a recipe's structure as the starting point for new brews.

**1. Open the recipe you want to save as a template**
Select it in the recipe browser so it's the active recipe.

**2. Click File in the menu bar**

**3. Click "Save as Template"**

**4. The recipe is now saved as a template**
It's available whenever you create a new recipe.

**5. To use the template**
Click + New in the recipe browser sidebar → select the **From Template** tab → choose your template.

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

Your ingredient stock is tracked automatically as you brew and receive deliveries. This workflow explains how to set it up and keep it accurate.

### Setting your opening balances

Before BrewLab can track stock accurately, it needs to know how much of each ingredient you currently have on hand.

**1. Open the Inventory tab**
Click INVENTORY in the top tab bar.

**2. Select a section**
Use the dropdown in the toolbar to switch between MALTS, HOPS, YEAST, ADJUNCTS, and HARVESTED YEAST.

**3. Enter opening balances**
Each ingredient row has an Opening Bal. column with an editable number field. Enter the amount you currently have on hand. This is your starting point — the ledger tracks all movements from here.

> Opening balances are in kg for malts and hops, litres for yeast, and kg for adjuncts.

### Recording ingredient usage after a brew

After each brew, record what you used so your stock levels stay accurate.

**1. Go to Order Planner → find the brew**
Click ORDER PLANNER in the top tab bar. Find the brew in the forecast table.

**2. Click Record Usage**
A checklist appears showing every ingredient in that recipe with the recipe amounts pre-filled.

**3. Check the ingredients you used**
All ingredients are pre-checked by default. Uncheck any you don't want to record. Adjust amounts if you used more or less than the recipe called for.

**4. If an ingredient says "⚠ not in library — click to fix"**
This means the recipe ingredient name doesn't match any entry in your library, so BrewLab can't deduct it from stock. Click the warning to open the resolver:
- **Search your library** — type to filter. Click a match to link this ingredient to that library entry. The link is saved permanently.
- **+ Add to library** — if the ingredient isn't in your library at all, click this to create a new entry from the recipe ingredient name. It's linked automatically.

Once linked, the ingredient will match correctly on all future brews.

**5. Set the brew date and click RECORD USAGE**
Stock levels update immediately. The ingredient is marked as recorded for this brew.

> You can also access Record Usage from the Brew Day tab — click 📝 Record Usage at the bottom of that tab.

### Logging incoming deliveries

When a delivery arrives, mark it received in the Orders panel. Stock updates automatically — see Workflow 2 (Planning and Placing an Order) for the full orders workflow.

### Reading the inventory table

- **ON HAND** — current stock, calculated from your opening balance plus all incoming deliveries minus all recorded usage.
- **Red** — stock is at zero or negative. Order immediately.
- **Amber** — stock is below 15% of your opening balance. Running low.
- **Normal** — stock is healthy.

Use **IN STOCK ONLY** in the toolbar to filter the table to only ingredients you currently have.

Use **TAX LEDGER** to view the full movement history for each ingredient — every IN (delivery) and OUT (usage) entry with dates and brew names.

### Overview reminders

If a brew ended more than a day ago and its ingredients haven't been recorded to inventory, a reminder appears on the Brewery Overview screen.

- **Click the brew name** to open that recipe directly.
- **Click Dismiss** to permanently hide that reminder if you've already recorded the usage another way or don't need to track it.

### Exporting recipes to share with other apps

To export one or more recipes as BeerXML (compatible with BeerSmith, Brewfather, and other brewing software):

**1. Select recipes in the sidebar**
Click a recipe to select it. To select multiple, shift-click a range or click additional recipes while holding Ctrl/Cmd.

**2. File → Export Selected**
BrewLab downloads a zip file containing one BeerXML file per recipe. Each file can be imported individually into BeerSmith or any other BeerXML-compatible app.

> To export a single currently-open recipe, use File → Export Recipe (BeerXML) instead.

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

**To print all three sheets at once:**
Click Print ▾ → Print Full Packet. This prints the Prep Sheet, Brew Day Sheet, and Ferm & Packaging Sheet in one go.

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
Click SUBMITTER in the top tab bar. Select the beer name. The app normalises all ingredients to per-1000L quantities and checks it against your submission register.

- Click **🔍 Check** to run the comparison. If a match is found, the recipe is already on file and no new submission is needed.
- If no match is found, click **✓ Mark as Submitted** to add it to your register.
- Click **🖨 Print Form** to print selected recipes in the official CC1-5610-6 horizontal layout (4 per A4 page). This button only appears after a Check has confirmed a match.
- Click **🖨 Print All** in the Submitted Recipes Register to print your full submission history as a compact summary table (~50 recipes per A4 page). Use this when the tax office asks for a complete record.

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

## Workflow 9: Google Sheets Ledger Sync

BrewLab automatically pushes your ingredient tax ledger to Google Sheets as a live running log. This gives you a permanent record outside the app — useful as a backup and for sharing with your accountant or the tax office.

Three separate Google Sheets workbooks are used:
- **Malts** — one tab per malt
- **Hops** — one tab per hop variety
- **Yeast & Misc** — one tab per yeast strain and misc ingredient

Each tab is an append-only log. New entries are added automatically — nothing is ever overwritten or deleted.

### One-time setup

**1. Create three Google Sheets in your Google Drive**
Name them something recognisable (e.g. BrewLab Malts, BrewLab Hops, BrewLab Yeast & Misc).

**2. Copy each Sheet ID**
Open each Sheet in your browser. The ID is the long string in the URL between `/d/` and `/edit`:
`https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`

**3. Open BrewLab Settings → Google Sheets**
Enter your OAuth Client ID and the three Sheet IDs. Click Save.

**4. Click Connect**
A Google sign-in popup appears. Sign in and approve access. BrewLab stores the token locally — it never leaves your device or syncs to Supabase.

> You need to connect separately on each device (desktop, tablet, mobile) since the token is stored locally per device. Google tokens expire after one hour — click Connect again in Settings → Google Sheets if a push fails.

### How entries are pushed

Once connected, BrewLab pushes ledger rows automatically:

- **Record Usage after a brew** — one OUT row per ingredient appended to the correct tab
- **Add Entry manually** — one row appended immediately on save
- **Edit an entry** — one CORRECTION row appended showing the delta (e.g. `Corrected: 100 → 75 kg`)
- **Delete an entry** — one CORRECTION row appended with the negative quantity (e.g. `-100 kg`)

Nothing is ever overwritten. Corrections appear as additional rows so the full history is always preserved — this is intentional for tax audit purposes.

### Column structure

Each row has these columns in order: Date · Type (IN / OUT / CORRECTION) · Qty (kg) · Beer / Note · Received Date · Used Date · Balance · Supplier

OUT rows from Record Usage show the tax batch number and beer name in the Beer / Note column (e.g. `453 Sansho Lager — Solar Storm`).

### Exporting the ledger as XLSX

The Google Sheets sync and the XLSX export are independent. To download a formatted Excel file with running balances:

**1. Open the Inventory tab → TAX LEDGER**
**2. Click EXPORT ▾ → Export Tax Ledger XLSX**
**3. Set a date range and select a section (Malts / Hops / Yeast / Adjuncts)**
**4. Click EXPORT**

The downloaded file has one sheet per ingredient with correct running balances carried over from before the date range.

---

*This document is maintained in the BrewLab repo at `docs/WORKFLOWS.md`. To export as Word or PDF, open in any Markdown editor and export, or run `pandoc docs/WORKFLOWS.md -o BrewLab_Workflows.docx`.*
