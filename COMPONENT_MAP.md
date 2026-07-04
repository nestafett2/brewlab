# BrewLab Component Map

Last updated: 2026-07-04

## src/pages/
- `Desktop.tsx` — main layout shell. Contains: recipe meta bar (beerName, name/仕込記号, taxBatch, brewDate, version, brewNumber, beer glass), top tab bar, file menu, sub-tab bar, all page routing.
- `Mobile.tsx` — mobile layout
- `Tablet.tsx` — tablet layout

## src/components/recipe/
- `RecipeTab.tsx` — Ingredients tab. Contains: metric strip (batch/grain/hops/IBU/ABV), brewer row, ingredient cards (grains/hops/yeast/water chem/misc), extra additions, bottom panels (Style/Totals/Process).
- `BrewDayTab.tsx` — Brew Day tab
- `FermTab.tsx` — Fermentation tab
- `PackagingTab.tsx` — Packaging tab
- `WaterTab.tsx` — Water tab
- `AnalysisTab.tsx` — Analysis tab
- `HistoryTab.tsx` — Batch History tab
- `ChecklistTab.tsx` — Checklist tab
- `ChecklistStrip.tsx` — checklist strip component
- `FolderTree.tsx` — left sidebar. Contains: folder tree, recipe rows (with OEM/Collab badge), drag/drop, context menus.
- `RecipeExplorerPanel.tsx` — Recipe Explorer panel (By Date/Folder/Style/Name/Tax# views)
- `RecipePreview.tsx` — recipe preview card
- `RecipePreviewPopover.tsx` — popover wrapper for recipe preview
- `BreweryOverviewPanel.tsx` — brewery overview dashboard (default view when no recipe open)
- `ActionStack.tsx` — right-side action buttons on Ingredients tab
- `IngredientCard.tsx` — ingredient section card (grains/hops/yeast/misc)
- `StyleSummaryPanel.tsx` — style summary panel (bottom-left of Ingredients tab)
- `StylePickerDropdown.tsx` — style picker dropdown
- `StyleGuideModal.tsx` — BJCP style guide modal
- `AddIngredientModal.tsx` — add ingredient modal
- `EditIngredientModal.tsx` — edit ingredient modal
- `GrainPctModal.tsx` — grain percentage modal
- `HopIbuModal.tsx` — hop IBU modal
- `DhSplitModal.tsx` — dry hop split modal
- `DryHopModal.tsx` — dry hop modal
- `MashProfileModal.tsx` — mash profile modal
- `NewRecipeModal.tsx` — new recipe modal
- `NewBrewModal.tsx` — new brew modal
- `SaveTemplateModal.tsx` — save as template modal
- `TastingNotesModal.tsx` — tasting notes modal
- `BeerGlassIcon.tsx` — beer glass SVG icon (EBC colour fill)
- `prepSheetPrint.ts` — Prep Sheet print logic
- `brewDaySheetPrint.ts` — Brew Day Sheet print logic
- `fermPackagingSheetPrint.ts` — Ferm & Packaging Sheet print logic
- `analysisSheetPrint.ts` — Analysis Sheet print logic
- `recipeImport.ts` — BeerXML import logic

## src/components/inventory/
- `InventoryPage.tsx` — inventory page shell
- `CurrentStockTable.tsx` — current stock table
- `LedgerView.tsx` — ledger view
- `LedgerEntryModal.tsx` — ledger entry modal
- `LedgerExportModal.tsx` — ledger export modal
- `InventoryCorrectionModal.tsx` — inventory correction modal
- `HarvestedYeastView.tsx` — harvested yeast view
- `HarvestYeastModal.tsx` — harvest yeast modal
- `UseHarvestedYeastModal.tsx` — use harvested yeast modal
- `RecordUsageModal.tsx` — record usage modal
- `StockImportButton.tsx` — stock import button
- `inventoryShared.ts` — shared inventory logic

## src/components/libraries/
- `LibrariesPage.tsx` — libraries page shell
- `LibraryEntryModal.tsx` — library entry modal
- `LibraryBulkEditModal.tsx` — bulk edit modal
- `libraryFieldInput.tsx` — library field input component
- `libraryExport.ts` — library export logic
- `libraryImport.ts` — library import logic
- `libraryShared.ts` — shared library logic

## src/components/orders/
- `OrderPlannerPage.tsx` — order planner page shell
- `OrdersPanel.tsx` — orders panel
- `ForecastTable.tsx` — forecast table
- `AddOrderModal.tsx` — add order modal
- `EditOrderModal.tsx` — edit order modal
- `forecastPrint.ts` — forecast print logic
- `orderForecast.ts` — order forecast calculations
- `orderLedgerSync.ts` — order ledger sync
- `orderXlsx.ts` — order XLSX export
- `StockImportButton.tsx` — stock import button

## src/components/planner/
- `PlannerPage.tsx` — planner page shell
- `PlannerGrid.tsx` — planner calendar grid
- `PlannerUpcoming.tsx` — upcoming brews panel
- `AddBrewModal.tsx` — add brew to planner modal
- `CalendarPopup.tsx` — calendar popup
- `FvConflictModal.tsx` — fermenter conflict modal
- `RecipePickerModal.tsx` — recipe picker modal
- `YearlyModal.tsx` — yearly view modal
- `plannerShared.ts` — shared planner logic

## src/components/tax/
- `NtaPage.tsx` — NTA Submitter page
- `TaxTab.tsx` — Tax tab (per-recipe)
- `TaxSummaryTab.tsx` — Tax Summary tab (per-recipe)
- `TaxMasterPage.tsx` — Tax Master page
- `TaxClassificationSelect.tsx` — tax classification select component

## src/components/settings/
- `SettingsPanel.tsx` — settings page shell
- `ConnectionPanel.tsx` — Supabase connection panel
- `EquipmentProfilesPanel.tsx` — equipment profiles
- `MashProfilesPanel.tsx` — mash profiles
- `PitchProfilesPanel.tsx` — pitch profiles
- `WaterProfilesPanel.tsx` — water profiles
- `StylesPanel.tsx` — styles panel
- `SuppliersPanel.tsx` — suppliers panel
- `TanksPanel.tsx` — tanks panel
- `AdvancedPanel.tsx` — advanced settings
- `BitternessPanel.tsx` — bitterness settings
- `UnitsPanel.tsx` — units settings
- `OrderPlannerSettingsPanel.tsx` — order planner settings
- `GoogleSheetsSettings.tsx` — Google Sheets OAuth settings

## src/components/notes/
- (files TBD)

## src/components/shared/
- (files TBD)

## src/components/tariff/
- (files TBD)

## src/components/submitter/
- (files TBD)
