import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import JSZip from 'jszip';
import { useStore, type RecipeDeleteSnapshot } from '../store';
import RecipeTab from '../components/recipe/RecipeTab';
import BrewDayTab from '../components/recipe/BrewDayTab';
import FermTab from '../components/recipe/FermTab';
import PackagingTab from '../components/recipe/PackagingTab';
import WaterTab from '../components/recipe/WaterTab';
import HistoryTab from '../components/recipe/HistoryTab';
import ChecklistTab from '../components/recipe/ChecklistTab';
import SettingsPanel from '../components/settings/SettingsPanel';
import LibrariesPage from '../components/libraries/LibrariesPage';
import NotesPage from '../components/notes/NotesPage';
import PlannerPage from '../components/planner/PlannerPage';
import InventoryPage from '../components/inventory/InventoryPage';
import OrderPlannerPage from '../components/orders/OrderPlannerPage';
import TaxTab from '../components/tax/TaxTab';
import TaxSummaryTab from '../components/tax/TaxSummaryTab';
import NtaPage from '../components/tax/NtaPage';
import TaxMasterPage from '../components/tax/TaxMasterPage';
import AnalysisTab from '../components/recipe/AnalysisTab';
import NewRecipeModal from '../components/recipe/NewRecipeModal';
import SaveTemplateModal from '../components/recipe/SaveTemplateModal';
import TariffReductionPage from '../components/tariff/TariffReductionPage';
import BreweryOverviewPanel from '../components/recipe/BreweryOverviewPanel';
import RecipeExplorerPanel from '../components/recipe/RecipeExplorerPanel';
import RecipePreview from '../components/recipe/RecipePreview';
import RecipePreviewPopover from '../components/recipe/RecipePreviewPopover';
import FolderPreview from '../components/recipe/FolderPreview';
import FolderTree from '../components/recipe/FolderTree';
import BeerGlassIcon from '../components/recipe/BeerGlassIcon';
import { ebcToHex } from '../lib/ebcColor';
import {
  exportAllData,
  parseBackupFile,
  restoreBackup,
  countCurrentBrewLabKeys,
  readCurrentSupabaseUrl,
  readBackupSupabaseUrl,
  BackupParseError,
  type BackupFile,
} from '../lib/dataBackup';
import UndoButton from '../components/shared/UndoButton';
import type { Folder, Ingredient, Recipe, RecipeOrigin } from '../types';
import { parseRecipeXML, type ParsedRecipe } from '../components/recipe/recipeImport';
import {
  recipeToBeerXML,
  wrapRecipesDocument,
  buildExportFilename,
  downloadXmlFile,
} from '../lib/recipeExport';
import { newRecipeId, today } from '../lib/utils';
import { fmtNum } from '../lib/format';
import { lsSet } from '../lib/storage';
import { isWaterChem } from '../lib/waterChem';
import { computeRecipeStats, calcBrewDayTargets, DEFAULT_MASH_PROFILE } from '../lib/calculations';
import { printPrepSheet } from '../components/recipe/prepSheetPrint';
import { printBrewDaySheet } from '../components/recipe/brewDaySheetPrint';
import { printFermPackagingSheet } from '../components/recipe/fermPackagingSheetPrint';

export type RecipeSubTab = 'ingredients' | 'brewday' | 'ferm' | 'cold' | 'tax'
  | 'taxsummary' | 'analysis' | 'water' | 'history' | 'checklist';

export default function Desktop() {
  const {
    activeTab, tabVisibility, setActiveTab,
    recipes, selectedRecipeId, selectRecipe, updateRecipe,
    setTabVisibility, setSettingsSection,
    setLibrariesSection,
  } = useStore();
  void selectedRecipeId; // referenced indirectly via activeTab; keep destructure stable
  // Recipe browser context-menu wiring — pulls actions + folder list +
  // planner cascade target. Mirrors HTML rbCtxMenu (brewlab-desktop.html:3958).
  const folders         = useStore(s => s.folders);
  const plannerBrews    = useStore(s => s.plannerBrews);
  const setPlannerBrews = useStore(s => s.setPlannerBrews);
  // Single deletion path (2026-05-07): hardDeleteRecipe removes the recipe
  // row + all per-recipe child rows from Supabase and localStorage.
  // tax_records / tax_master are preserved (NTA compliance). Toast undo
  // snapshots full per-recipe state via captureRecipeSnapshot before the
  // delete and restores via restoreFromDeleteSnapshots.
  const hardDeleteRecipe = useStore(s => s.hardDeleteRecipe);
  const captureRecipeSnapshot = useStore(s => s.captureRecipeSnapshot);
  const restoreFromDeleteSnapshots = useStore(s => s.restoreFromDeleteSnapshots);
  const harvestedYeast = useStore(s => s.harvestedYeast);
  const duplicateRecipe = useStore(s => s.duplicateRecipe);
  const setRecipes      = useStore(s => s.setRecipes);
  const setFolders      = useStore(s => s.setFolders);
  const pushToast       = useStore(s => s.pushToast);
  const addRecipe       = useStore(s => s.addRecipe);
  const setIngredients  = useStore(s => s.setIngredients);
  const getIngredients  = useStore(s => s.getIngredients);
  const getMash         = useStore(s => s.getMash);
  // (effectiveTrubLossL + its store subscriptions moved into RecipeTab
  // when the equipment-derived pill strip moved out of the meta bar.)
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Out-channel for FolderTree's current multi-selection — read at
  // File → Export Selected... click time. See FolderTree's selectionRef prop.
  const folderSelectionRef = useRef<() => string[]>(() => []);

  // ── Print dropdown (recipe sub-tab bar) ──────────────────────────────
  // Prep Sheet + Brew Day Sheet used to be owned by RecipeTab/BrewDayTab
  // respectively, each reading its own live component state. The dropdown
  // lives on the persistent sub-tab bar instead, visible regardless of
  // which sub-tab is mounted — so both handlers read fresh from the store
  // at click time (same getter pattern the old handlers already used for
  // waterChem/brewDay) rather than depending on a specific tab being open.
  const ingredientsByRecipe    = useStore(s => s.ingredientsByRecipe);
  const maltLib                = useStore(s => s.maltLib);
  const hopLib                 = useStore(s => s.hopLib);
  const yeastLib                = useStore(s => s.yeastLib);
  const miscLib                 = useStore(s => s.miscLib);
  const settings                 = useStore(s => s.settings);
  const equipProfiles           = useStore(s => s.equipProfiles);
  const mashProfiles            = useStore(s => s.mashProfiles);
  const recipeProfilesByRecipe  = useStore(s => s.recipeProfilesByRecipe);
  const tankCalib                = useStore(s => s.tankCalib);
  const getWaterChem             = useStore(s => s.getWaterChem);
  const getBrewDay               = useStore(s => s.getBrewDay);
  const getFermMeta              = useStore(s => s.getFermMeta);
  const getColdSide              = useStore(s => s.getColdSide);
  const [printMenuOpen, setPrintMenuOpen] = useState(false);
  const printMenuRef = useRef<HTMLDivElement>(null);

  // Close the Print dropdown on any click outside it, and on Escape.
  // Deferred mousedown listener so the click that opens the menu doesn't
  // immediately close it — same pattern as RecipeTab's ingredient ctx-menu.
  useEffect(() => {
    if (!printMenuOpen) return;
    const close = () => setPrintMenuOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const id = setTimeout(() => document.addEventListener('mousedown', close), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [printMenuOpen]);

  // ── Floating recipe-preview popover (sidebar single-click) ─────────
  // Stays on the current tab; doesn't update `preview` (which still
  // drives the embedded folder-preview pane on the Recipes tab).
  // Anchored to the right edge of the recipe-browser sidebar, measured
  // at open time via [data-recipe-sidebar].
  const [popoverRecipeId, setPopoverRecipeId] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!popoverRecipeId) { setPopoverPos(null); return; }
    const el = document.querySelector('[data-recipe-sidebar]');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPopoverPos({ left: rect.right + 12, top: rect.top });
  }, [popoverRecipeId]);

  // Outside-mousedown / Escape close. Sidebar clicks are exempt — the
  // sidebar's setPreview wrapper handles toggle/replace explicitly.
  // Deferred attach matches the recipeCtxMenu pattern below.
  useEffect(() => {
    if (!popoverRecipeId) return;
    const onMouse = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('[data-recipe-popover]')) return;
      if (t.closest('[data-recipe-sidebar]')) return;
      setPopoverRecipeId(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPopoverRecipeId(null); };
    const id = setTimeout(() => document.addEventListener('mousedown', onMouse), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [popoverRecipeId]);

  // Clear popover if the underlying recipe is deleted while open.
  useEffect(() => {
    if (popoverRecipeId && !recipes.some(r => r.id === popoverRecipeId)) {
      setPopoverRecipeId(null);
    }
  }, [popoverRecipeId, recipes]);

  // ── Recipe XML import (File menu → Import Recipe (BeerXML)) ─────────
  // Hidden file input triggered by the menu item; on change, parse and
  // pop the preview modal so the user can confirm before any state
  // changes. Mirrors HTML brewlab-desktop.html:17232 (handleRecipeXML)
  // + 17323 (confirmRecipeImport), with the BSMX path intentionally
  // omitted (HTML's importBSMX is library-only — see recipeImport.ts).
  const recipeImportInputRef = useRef<HTMLInputElement>(null);
  const [pendingImports, setPendingImports] = useState<ParsedRecipe[] | null>(null);

  // ── Backup import (File menu → Import Backup) ───────────────────────
  // Hidden file input triggered by the menu item; on change, parse via
  // dataBackup.parseBackupFile and pop the BackupImportConfirm modal.
  // Restore is gated by a two-stage button confirm inside the modal —
  // commit calls restoreBackup + reloads. See lib/dataBackup.ts header
  // for the disconnect-on-restore rationale.
  const backupImportInputRef = useRef<HTMLInputElement>(null);
  const [pendingBackup, setPendingBackup] = useState<BackupFile | null>(null);

  // Track which recipes have open tabs (like the HTML app's recipe-tabs-container)
  const [openRecipeTabs, setOpenRecipeTabs] = useState<string[]>([]);
  // Sidebar tab toggle — drives which right-pane mode the Recipes page
  // shows. Two values:
  //   'overview' — preview takes precedence; otherwise BreweryOverviewPanel.
  //   'explorer' — RecipeExplorerPanel always; preview state still updates
  //                on sidebar single-click but isn't visually rendered
  //                until the user switches back to Overview.
  // Persisted via localStorage so the choice survives reloads.
  const [sidebarTab, setSidebarTab] = useState<'overview' | 'explorer'>(() => {
    try {
      const raw = localStorage.getItem('bl_sidebar_tab');
      if (raw === 'explorer' || raw === 'overview') return raw;
    } catch { /* ignore */ }
    return 'overview';
  });
  useEffect(() => {
    try { localStorage.setItem('bl_sidebar_tab', sidebarTab); } catch { /* ignore */ }
  }, [sidebarTab]);
  // Right-pane preview selection — recipe or folder, or null. When
  // null, the right pane shows the BreweryOverviewPanel as the default
  // dashboard (no empty-state placeholder). Independent of
  // `selectedRecipeId` (which drives the recipe-meta-bar when a recipe
  // tab is active). Single-click on a sidebar row sets this;
  // double-click opens the recipe and clears it; the Overview sub-tab
  // button clears it.
  const [preview, setPreview] = useState<{ kind: 'recipe' | 'folder'; id: string } | null>(null);
  // Clear a stale preview when the underlying recipe/folder gets deleted
  // (e.g. via the right-click menu) so we don't render against a missing id.
  useEffect(() => {
    if (!preview) return;
    if (preview.kind === 'recipe' && !recipes.some(r => r.id === preview.id)) setPreview(null);
    if (preview.kind === 'folder' && !folders.some(f => f.id === preview.id)) setPreview(null);
  }, [preview, recipes, folders]);
  // Sub-tab per recipe — preserved across recipe-tab switches. New recipes
  // default to 'ingredients' (no entry in the map).
  const [subTabByRecipe, setSubTabByRecipe] = useState<Record<string, RecipeSubTab>>({});

  // Close menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleMenu = (menu: string) => {
    setOpenMenu(openMenu === menu ? null : menu);
  };
  const closeMenus = () => setOpenMenu(null);

  // ── Recipe XML file → preview ────────────────────────────────────────
  // Mirrors HTML brewlab-desktop.html:17232. Reads the file, parses,
  // shows the preview modal. BSMX files are rejected with an explanatory
  // toast — that's a separate task once a sample .bsmx recipe file exists.
  const handleRecipeImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so picking the same file twice still fires onChange.
    e.target.value = '';
    if (file.name.toLowerCase().endsWith('.bsmx')) {
      pushToast({
        message: 'BSMX recipe import not yet supported. Please use BeerXML (.xml/.beerxml).',
        variant: 'error',
      });
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      pushToast({ message: 'Could not read file: ' + (err as Error).message, variant: 'error' });
      return;
    }
    try {
      const parsed = parseRecipeXML(text);
      if (parsed.length === 0) {
        pushToast({ message: 'No <RECIPE> found in this file.', variant: 'error' });
        return;
      }
      setPendingImports(parsed);
    } catch (err) {
      pushToast({ message: 'Error parsing XML: ' + (err as Error).message, variant: 'error' });
    }
  };

  // ── Confirm import → materialize through store ───────────────────────
  // Mirrors HTML confirmRecipeImport (17323). Allocates IDs in-loop
  // (each iteration's allocation feeds the next), creates the Recipe
  // row, writes ingredients with `${recipeId}_${idx}` IDs, persists the
  // mash blob via lsSet so it picks up the bl_mash_<id> sync prefix
  // (supabase.ts:185–195). Opens the FIRST imported recipe per spec.
  const confirmRecipeImport = () => {
    if (!pendingImports || pendingImports.length === 0) {
      setPendingImports(null);
      return;
    }
    const allocatedIds: string[] = [];
    let firstId: string | null = null;
    const defaultFolder = folders[0]?.id || '';

    for (const p of pendingImports) {
      const newId = newRecipeId([...recipes.map(r => r.id), ...allocatedIds]);
      allocatedIds.push(newId);
      if (!firstId) firstId = newId;

      // Assign per-CLAUDE.md ingredient ID rule — `${recipeId}_${idx}`
      // (NOT sequential integers — would collide on Supabase PK). Built
      // before `rec` so computeRecipeStats below has real ingredient ids.
      const ings: Ingredient[] = p.ingredients.map((ing, idx) => ({
        ...ing,
        id: `${newId}_${idx}`,
      }));

      const rec: Recipe = {
        id: newId,
        lineageId: newId,
        name: '',                                   // tax serial — brewer fills in
        beerName: p.name,
        style: p.styleName,
        styleKey: p.styleKey,
        folder: defaultFolder,
        batchL: p.batchL,
        classification: 'Beer',
        brewDate: today(),
        taxBatch: '',
        brewNumber: 1,
        version: '1.0',
        versionNote: '',
        locked: false,
        rating: 0,
        brewAgain: null,
        cost: 0,
        abv: 0,
        ibu: 0,
        ebc: 0,
        ogPlato: p.ogPlato,
        fgPlato: p.fgPlato,
        // BeerXML no longer supplies EFFICIENCY — the source software's
        // own efficiency assumption doesn't carry over meaningfully, so
        // new imports use the active equipment profile's default instead.
        // boilTime is kept as parsed from the file — unlike efficiency,
        // BOIL_TIME is a real per-recipe process value worth trusting.
        bhEff: (equipProfiles[0]?.defaultBhEff) ?? 72,
        boilTime: p.boilTime,
        whirlpoolTemp: 85,
        bdFv: '',
        notes: p.notes,
        extraAdditions: '',
        brewer: '',
        archivedAt: null,
      };

      // Recompute OG/FG from the imported grain bill at the new default
      // BH efficiency, rather than trusting the BeerXML's raw OG/FG
      // (computed under the source software's own, now-discarded,
      // efficiency assumption).
      const stats = computeRecipeStats({ recipe: rec, ingredients: ings, maltLib, hopLib, yeastLib, miscLib, settings });
      rec.ogPlato = stats.ogPlato;
      rec.fgPlato = stats.fgPlato;

      addRecipe(rec);
      setIngredients(newId, ings);

      // Mash profile blob — only persist if the BeerXML had MASH steps.
      // lsSet routes through the bl_mash_<id> Supabase prefix.
      if (p.mashProfile) {
        lsSet(`bl_mash_${newId}`, p.mashProfile);
      }
    }

    const count = pendingImports.length;
    pushToast({
      message: count === 1 ? `Imported "${pendingImports[0].name}"` : `Imported ${count} recipes`,
      variant: 'success',
    });
    setPendingImports(null);
    if (firstId) openRecipe(firstId);
  };

  // ── Recipe XML export (File menu → Export Recipe (BeerXML)) ──────────
  // Symmetric to the import path above. Resolves the active recipe +
  // its ingredients + per-recipe mash profile, serialises to BeerXML
  // 1.0, triggers a browser download. Mirrors HTML
  // brewlab-desktop.html:5245 (`exportCurrentRecipe`) but uses SI units
  // and writes MASH/FG so a round-trip through the React importer
  // preserves the mash schedule and final-gravity target.
  const handleExportCurrentRecipe = () => {
    if (!activeRecipeId) {
      pushToast({ message: 'No recipe open.', variant: 'error' });
      return;
    }
    const recipe = recipes.find(r => r.id === activeRecipeId);
    if (!recipe) {
      pushToast({ message: 'No recipe open.', variant: 'error' });
      return;
    }
    try {
      const ings = getIngredients(activeRecipeId);
      const mash = getMash(activeRecipeId);
      const xml = wrapRecipesDocument([recipeToBeerXML(recipe, ings, mash)]);
      downloadXmlFile(xml, buildExportFilename(recipe));
      pushToast({
        message: `Exported "${recipe.beerName || recipe.name || 'recipe'}"`,
        variant: 'success',
      });
    } catch (err) {
      pushToast({
        message: 'Error exporting recipe: ' + (err as Error).message,
        variant: 'error',
      });
    }
  };

  // ── Export Selected (File menu) ──────────────────────────────────────
  // Exports every recipe currently multi-selected in the sidebar
  // (FolderTree's checkbox-style selection, read via folderSelectionRef)
  // as a single BeerXML file — one <RECIPES> document wrapping one
  // <RECIPE> block per selected recipe. Same serialisation path as
  // handleExportCurrentRecipe, just fed multiple recipes at once.
  const handleExportSelected = async () => {
    const ids = folderSelectionRef.current();
    if (!ids.length) {
      pushToast({ message: 'No recipes selected. Click recipes in the sidebar to select them.', variant: 'info' });
      return;
    }
    try {
      const zip = new JSZip();
      let count = 0;
      for (const id of ids) {
        const recipe = recipes.find(r => r.id === id);
        if (!recipe) continue;
        const ings = getIngredients(id);
        const mash = getMash(id);
        const xml = wrapRecipesDocument([recipeToBeerXML(recipe, ings, mash)]);
        const filename = buildExportFilename(recipe);
        zip.file(filename, xml);
        count++;
      }
      if (!count) return;
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = count === 1
        ? buildExportFilename(recipes.find(r => r.id === ids[0])!).replace('.xml', '.zip')
        : `brewlab-recipes-${count}-${date}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      pushToast({ message: `Exported ${count} recipe${count > 1 ? 's' : ''} as zip.`, variant: 'success' });
    } catch (err) {
      pushToast({ message: 'Export failed: ' + (err as Error).message, variant: 'error' });
    }
  };

  // ── Backup file → preview ───────────────────────────────────────────
  const handleBackupImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!file.name.toLowerCase().endsWith('.json')) {
      pushToast({
        message: 'Backup files must be .json (created by Export All Data).',
        variant: 'error',
      });
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      pushToast({ message: 'Could not read file: ' + (err as Error).message, variant: 'error' });
      return;
    }
    try {
      const backup = parseBackupFile(text);
      setPendingBackup(backup);
    } catch (err) {
      // BackupParseError carries a code; surface its message verbatim.
      // Other errors are unexpected — same message path.
      const msg = err instanceof BackupParseError
        ? err.message
        : 'Could not parse backup: ' + (err as Error).message;
      pushToast({ message: msg, variant: 'error' });
    }
  };

  // ── Confirm backup restore — wipe + write + reload ──────────────────
  // Reload mirrors the existing Reset All Data path
  // (ConnectionPanel.tsx:52). Defer ~250ms so the success toast renders
  // before the page tears down.
  const confirmBackupRestore = () => {
    if (!pendingBackup) return;
    try {
      const summary = restoreBackup(pendingBackup);
      pushToast({
        message: `Restored ${summary.written} keys (cleared ${summary.cleared}). ` +
                 (summary.credentialsCleared
                   ? 'Supabase disconnected — reconnect in Settings → Connection.'
                   : 'Reloading…'),
        variant: 'success',
        duration: 6000,
      });
      setPendingBackup(null);
      setTimeout(() => location.reload(), 250);
    } catch (err) {
      pushToast({
        message: 'Restore failed: ' + (err as Error).message,
        variant: 'error',
      });
    }
  };

  // Modal state for New Recipe + Save as Template flows.
  // Modal state carries the optional folder context: null = closed,
  // { folderId: null } = open from "+ New" with no folder, { folderId: 'fX' } =
  // open from FolderPreview's "+ New Recipe Here" pre-targeting that folder.
  const [newRecipeModalCtx, setNewRecipeModalCtx] = useState<{ folderId: string | null } | null>(null);
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);

  // Recipe-browser right-click context menu state. Null when closed;
  // otherwise carries cursor position and the right-clicked recipe id.
  const [recipeCtxMenu, setRecipeCtxMenu] = useState<{ x: number; y: number; recipeId: string } | null>(null);
  const [folderCtxMenu, setFolderCtxMenu] = useState<{ x: number; y: number; folderId: string } | null>(null);
  const [bulkCtxMenu, setBulkCtxMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null);
  // Blank-area right-click — sidebar tree + Recipe Explorer's By Folder
  // view both fire this. Single-item menu: "+ New Folder".
  const [blankCtxMenu, setBlankCtxMenu] = useState<{ x: number; y: number } | null>(null);

  // Open a recipe: add tab if not already open, switch to it
  const openRecipe = (recipeId: string) => {
    if (!openRecipeTabs.includes(recipeId)) {
      setOpenRecipeTabs([...openRecipeTabs, recipeId]);
    }
    selectRecipe(recipeId);
    setActiveTab('recipe:' + recipeId);
  };

  // Programmatic recipe-tab close — used by the rbCtx Delete handler
  // (which has no MouseEvent) and the X-button click handler below.
  const closeRecipeTabById = (recipeId: string) => {
    const remaining = openRecipeTabs.filter(id => id !== recipeId);
    setOpenRecipeTabs(remaining);
    if (activeTab === 'recipe:' + recipeId) {
      if (remaining.length > 0) {
        const lastId = remaining[remaining.length - 1];
        selectRecipe(lastId);
        setActiveTab('recipe:' + lastId);
      } else {
        selectRecipe(null);
        setActiveTab('recipes');
      }
    }
  };

  // Close a recipe tab (X-button click handler)
  const closeRecipeTab = (e: React.MouseEvent, recipeId: string) => {
    e.stopPropagation();
    closeRecipeTabById(recipeId);
  };

  // ── Recipe-browser context menu handlers ─────────────────────────
  // Mirror HTML rbCtxRename / rbCtxDuplicate / rbCtxMove / rbCtxDelete
  // (brewlab-desktop.html:4866–4911). Native prompt/confirm — toast/undo
  // retrofit on the end-of-port queue can replace them later.

  const handleRecipeContext = (e: React.MouseEvent, recipeId: string) => {
    e.preventDefault();
    setFolderCtxMenu(null); setBulkCtxMenu(null);
    setRecipeCtxMenu({ x: e.pageX, y: e.pageY, recipeId });
  };

  const handleFolderContext = (e: React.MouseEvent, folderId: string) => {
    e.preventDefault();
    setRecipeCtxMenu(null); setBulkCtxMenu(null);
    setFolderCtxMenu({ x: e.pageX, y: e.pageY, folderId });
  };

  const handleBulkContext = (e: React.MouseEvent, ids: string[]) => {
    e.preventDefault();
    setRecipeCtxMenu(null); setFolderCtxMenu(null);
    setBulkCtxMenu({ x: e.pageX, y: e.pageY, ids });
  };

  // Right-click on blank space in either the sidebar tree or the
  // explorer's By Folder view — single-item "+ New Folder" menu.
  const handleBlankContext = (e: React.MouseEvent) => {
    setRecipeCtxMenu(null); setFolderCtxMenu(null); setBulkCtxMenu(null);
    setBlankCtxMenu({ x: e.pageX, y: e.pageY });
  };

  // Close on outside-mousedown / Escape, matching the ingredient-row
  // pattern in RecipeTab.tsx. One effect covers all three menus.
  useEffect(() => {
    if (!recipeCtxMenu && !folderCtxMenu && !bulkCtxMenu && !blankCtxMenu) return;
    const close = () => {
      setRecipeCtxMenu(null); setFolderCtxMenu(null);
      setBulkCtxMenu(null);   setBlankCtxMenu(null);
    };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') close(); };
    // Defer the mousedown listener so the right-click that opened the
    // menu doesn't immediately close it.
    const id = setTimeout(() => document.addEventListener('mousedown', close), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [recipeCtxMenu, folderCtxMenu, bulkCtxMenu, blankCtxMenu]);

  /** Lowest free `f<n>` id — picks the smallest integer not already in
   *  use by an existing folder. Avoids collisions with synced folders
   *  from other devices (HTML's `nextFolderId++` counter is unsafe in
   *  a multi-device setup). Shared by handleNewFolder and
   *  handleNewSubfolder. */
  const nextFolderIdNum = (): string => {
    const used = new Set(
      folders.map(f => f.id.match(/^f(\d+)$/)?.[1])
        .filter((s): s is string => !!s)
        .map(s => parseInt(s, 10)),
    );
    let n = 1;
    while (used.has(n)) n++;
    return `f${n}`;
  };

  // Create a new top-level folder. Mirrors HTML newFolder
  // (brewlab-desktop.html:4914): prompt for name, generate `f<n>` id,
  // append at root, default to open. Wired to both the sidebar header's
  // "📁 Folder" button and the bottom "+ New Folder" link.
  const handleNewFolder = () => {
    const raw = window.prompt('Folder name:');
    if (raw === null) return;
    const name = raw.trim();
    if (!name) return;
    const folder: Folder = { id: nextFolderIdNum(), name, parentId: null, open: true };
    setFolders([...folders, folder]);
    setPreview({ kind: 'folder', id: folder.id });
  };

  // Create a subfolder under the given parent. Mirrors HTML
  // newSubfolder (brewlab-desktop.html:4920). Same id-collision-safe
  // strategy as handleNewFolder. The parent stays previewed (per HTML)
  // — the new subfolder appears nested in the tree but doesn't steal
  // the right-pane preview.
  const handleNewSubfolder = (parentId: string) => {
    const raw = window.prompt('Subfolder name:');
    if (raw === null) return;
    const name = raw.trim();
    if (!name) return;
    // Force the parent open so the new subfolder is visible in the tree.
    const updated = folders.map(f => f.id === parentId ? { ...f, open: true } : f);
    const folder: Folder = { id: nextFolderIdNum(), name, parentId, open: true };
    setFolders([...updated, folder]);
  };

  // Create a recipe pre-targeted to a folder. Mirrors HTML
  // newRecipeInFolder (brewlab-desktop.html:5024) which delegates to
  // openNewRecipeModal(folderId). The modal opens with defaultFolderId
  // set; confirm-blank/confirm-tpl pass it through to the new recipe.
  const handleNewRecipeInFolder = (folderId: string) => {
    setNewRecipeModalCtx({ folderId });
  };

  // ── Folder context menu handlers (PART 3) ────────────────────────────
  // Mirror HTML folderCtxRename / folderCtxNewSub / folderCtxDelete
  // (brewlab-desktop.html:18350–18371).

  const folderCtxRename = (folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    const next = window.prompt('Rename folder:', folder.name);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    setFolders(folders.map(f => f.id === folderId ? { ...f, name: trimmed } : f));
  };

  // ── Bulk recipe operations (PART 4) ──────────────────────────────────

  const handleBulkMove = (ids: string[]) => {
    if (folders.length === 0) {
      pushToast({ message: 'No folders defined yet.', variant: 'info' });
      return;
    }
    const list = folders.map((f, i) => `${i + 1}: ${f.name}`).join('\n');
    const raw = window.prompt(`Move ${ids.length} recipes to folder:\n` + list);
    if (raw === null) return;
    const n = parseInt(raw, 10);
    if (!n || !folders[n - 1]) return;
    const targetId = folders[n - 1].id;
    const idSet = new Set(ids);
    const before = recipes;
    setRecipes(recipes.map(r => idSet.has(r.id) ? { ...r, folder: targetId } : r));
    pushToast({
      message: `Moved ${ids.length} recipes`,
      undo: () => setRecipes(before),
    });
  };

  // Bulk delete. Snapshots the full per-recipe state for every selected
  // recipe BEFORE the Supabase DELETEs fire, plus a single global snapshot
  // of harvestedYeast and plannerBrews. The toast undo replays everything
  // through restoreFromDeleteSnapshots in FK-safe order.
  // 8000ms toast window (vs the 4500ms default) — delete is irreversible
  // outside the undo, so the brewer needs more time to react.
  const handleBulkDelete = (ids: string[]) => {
    if (!window.confirm(
      `Delete ${ids.length} recipes?\n\nTax records preserved; brew data ` +
      `permanently removed. Planner entries for these recipes will also be removed.`,
    )) return;

    // Snapshot first — captures pre-delete state of each recipe and the
    // global slices touched by the cascade. The harvestedYeast snapshot
    // is one global dict (the dispatch path is delete-all+reinsert anyway).
    const snapshots = ids
      .map(id => captureRecipeSnapshot(id))
      .filter((s): s is RecipeDeleteSnapshot => s !== null);
    const beforePlannerBrews = plannerBrews;
    const beforeYeast = harvestedYeast;

    const idSet = new Set(ids);
    const filteredPlanner = plannerBrews.filter(b => !idSet.has(b.recipeId ?? ''));
    if (filteredPlanner.length !== plannerBrews.length) {
      setPlannerBrews(filteredPlanner);
    }
    for (const id of ids) {
      if (openRecipeTabs.includes(id)) closeRecipeTabById(id);
    }
    void Promise.all(ids.map(id => hardDeleteRecipe(id))).then(() => {
      pushToast({
        message: `Deleted ${ids.length} recipes`,
        duration: 8000,
        undo: () => {
          void restoreFromDeleteSnapshots(snapshots, beforeYeast, beforePlannerBrews);
        },
      });
    });
  };

  const folderCtxDelete = (folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    // Snapshot for undo — restores folders + recipes (cascade reversal).
    const beforeFolders = folders;
    const beforeRecipes = recipes;
    // Cascade — verbatim from HTML 18366–18368:
    //   • Subfolders: parentId set to deleted folder's parentId (promote).
    //   • Direct recipes: folder cleared (lands in Unfiled).
    //   • Folder itself removed.
    //   • NEVER deletes recipes.
    const updatedFolders = folders
      .map(f => f.parentId === folderId ? { ...f, parentId: folder.parentId } : f)
      .filter(f => f.id !== folderId);
    const updatedRecipes = recipes
      .map(r => r.folder === folderId ? { ...r, folder: '' } : r);
    setFolders(updatedFolders);
    setRecipes(updatedRecipes);
    if (preview?.kind === 'folder' && preview.id === folderId) setPreview(null);
    pushToast({
      message: `Deleted folder "${folder.name}"`,
      undo: () => {
        setFolders(beforeFolders);
        setRecipes(beforeRecipes);
      },
    });
  };

  const rbCtxRename = (recipeId: string) => {
    const r = recipes.find(x => x.id === recipeId);
    if (!r) return;
    // HTML edits `name` (the tax identifier 仕込記号), not beerName.
    const next = window.prompt('Rename recipe:', r.name);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    updateRecipe(recipeId, { name: trimmed });
  };

  const rbCtxDuplicate = (recipeId: string) => {
    const newId = duplicateRecipe(recipeId);
    if (newId) openRecipe(newId);
  };

  const rbCtxMove = (recipeId: string) => {
    if (folders.length === 0) {
      pushToast({ message: 'No folders defined yet.', variant: 'info' });
      return;
    }
    const list = folders.map((f, i) => `${i + 1}: ${f.name}`).join('\n');
    const raw = window.prompt('Move to folder:\n' + list);
    if (raw === null) return;
    const n = parseInt(raw, 10);
    if (!n || !folders[n - 1]) return;
    updateRecipe(recipeId, { folder: folders[n - 1].id });
  };

  // Single-recipe delete. Hard-removes the recipe row and all per-recipe
  // child data from Supabase + localStorage; tax_records and tax_master
  // are preserved (NTA compliance — sbHardDeleteRecipe excludes them).
  // Planner entries cascade-remove. Toast undo (8s window) snapshots the
  // full pre-delete state and restores via restoreFromDeleteSnapshots.
  const rbCtxDelete = (recipeId: string) => {
    const r = recipes.find(x => x.id === recipeId);
    if (!r) return;
    const label = r.beerName || r.name || 'this recipe';
    if (!window.confirm(
      `Delete recipe "${label}"?\n\nTax records will be preserved but all ` +
      `brew data (measurements, ferm log, packaging) will be permanently removed.`,
    )) return;

    const snapshot = captureRecipeSnapshot(recipeId);
    if (!snapshot) return;
    const beforePlannerBrews = plannerBrews;
    const beforeYeast = harvestedYeast;

    const filtered = plannerBrews.filter(b => b.recipeId !== recipeId);
    if (filtered.length !== plannerBrews.length) setPlannerBrews(filtered);
    if (openRecipeTabs.includes(recipeId)) closeRecipeTabById(recipeId);

    void hardDeleteRecipe(recipeId).then(() => {
      pushToast({
        message: `Deleted "${label}"`,
        duration: 8000,
        undo: () => {
          void restoreFromDeleteSnapshots([snapshot], beforeYeast, beforePlannerBrews);
        },
      });
    });
  };

  // Is the current view showing a recipe?
  const isRecipeOpen = activeTab.startsWith('recipe:');
  const activeRecipeId = isRecipeOpen ? activeTab.slice(7) : null;
  const selectedRecipeForMeta = activeRecipeId ? recipes.find(r => r.id === activeRecipeId) : null;

  // Derived: current sub-tab for the active recipe (default 'ingredients').
  const recipeSubTab: RecipeSubTab = activeRecipeId
    ? (subTabByRecipe[activeRecipeId] ?? 'ingredients')
    : 'ingredients';
  const setRecipeSubTab = (t: RecipeSubTab) => {
    if (!activeRecipeId) return;
    setSubTabByRecipe(prev => ({ ...prev, [activeRecipeId]: t }));
  };

  // Print Prep Sheet — A4 portrait artifact for the brewer's workstation.
  // Moved here (from RecipeTab) so the Print dropdown works from any
  // sub-tab. Mirrors RecipeTab's former handlePrintPrepSheet exactly:
  // same activeEquip/activeMash resolution chain, same targets calc.
  const handlePrintPrepSheet = () => {
    const recipe = activeRecipeId ? recipes.find(r => r.id === activeRecipeId) : null;
    if (!recipe) { pushToast({ message: 'Open a recipe first.', variant: 'info' }); return; }
    const ingredients = ingredientsByRecipe[recipe.id] ?? [];
    const stats = computeRecipeStats({ recipe, ingredients, maltLib, hopLib, yeastLib, miscLib, settings });
    const recipeProfiles = recipeProfilesByRecipe[recipe.id];
    const equipId = recipeProfiles?.equip;
    const activeEquip = (equipId ? equipProfiles.find(p => p.id === equipId) : null) ?? equipProfiles[0] ?? null;
    const mashId = recipeProfiles?.mash;
    const activeMash = mashId ? mashProfiles.find(p => p.id === mashId) ?? null : null;
    const waterChem = getWaterChem(recipe.id);
    const brewDay   = getBrewDay(recipe.id);
    const targets   = calcBrewDayTargets({
      recipe, ingredients, maltLib, hopLib, yeastLib,
      equip: activeEquip, mashProfile: activeMash,
      grainAbsorbLkg: settings.grainAbsorb,
      grainTempC: settings.defaultGrainTemp,
      coolingShrinkagePct: settings.coolingShrinkage,
    });
    const tankName = recipe.bdFv ? (tankCalib[recipe.bdFv]?.name ?? recipe.bdFv) : '';
    const firstStep = activeMash?.steps?.[0];
    printPrepSheet({
      recipe, ingredients, stats,
      waterChem, brewDay, targets,
      mashStepTempC: typeof firstStep?.temp === 'number' ? firstStep.temp : undefined,
      mashStepDurationMin: typeof firstStep?.time === 'number' ? firstStep.time : undefined,
      tankName,
      // Per-recipe brewer wins; falls back to brewery-wide setting; print
      // builder turns empty into "—".
      brewerName: (recipe.brewer || '').trim() || settings.breweryName || '',
      maltLib, hopLib, yeastLib,
      harvestedYeast,
    });
  };

  // Print Brew Day Sheet — A4 handwriting sheet. Moved here (from
  // BrewDayTab) so the Print dropdown works from any sub-tab. Reads the
  // per-recipe MASH blob via getMash (BrewDayTab's `mashProfile`, distinct
  // from the named-library `activeMash` the Prep Sheet handler above uses)
  // and falls back to DEFAULT_MASH_PROFILE exactly as BrewDayTab does.
  const handlePrintBrewDaySheet = () => {
    const recipe = activeRecipeId ? recipes.find(r => r.id === activeRecipeId) : null;
    if (!recipe) { pushToast({ message: 'Open a recipe first.', variant: 'info' }); return; }
    const ingredients = ingredientsByRecipe[recipe.id] ?? [];
    const recipeProfiles = recipeProfilesByRecipe[recipe.id];
    const equipId = recipeProfiles?.equip;
    const activeEquip = (equipId ? equipProfiles.find(p => p.id === equipId) : null) ?? equipProfiles[0] ?? null;
    const mashProfile = getMash(recipe.id) ?? DEFAULT_MASH_PROFILE;
    const targets = calcBrewDayTargets({
      recipe, ingredients, maltLib, hopLib, yeastLib,
      equip: activeEquip, mashProfile,
      grainAbsorbLkg: settings.grainAbsorb && settings.grainAbsorb > 0 ? settings.grainAbsorb : undefined,
      grainTempC: typeof settings.defaultGrainTemp === 'number' && isFinite(settings.defaultGrainTemp)
        ? settings.defaultGrainTemp
        : undefined,
      coolingShrinkagePct: typeof settings.coolingShrinkage === 'number' && settings.coolingShrinkage > 0
        ? settings.coolingShrinkage
        : undefined,
    });
    const tankName = recipe.bdFv ? (tankCalib[recipe.bdFv]?.name ?? recipe.bdFv) : '';
    printBrewDaySheet({
      recipe, ingredients, targets,
      brewDay: getBrewDay(recipe.id),
      waterChem: getWaterChem(recipe.id),
      mashProfile,
      tankName,
      // Per-recipe brewer wins; falls back to brewery-wide setting.
      brewerName: (recipe.brewer || '').trim() || settings.breweryName || '',
      yeastLib,
      hopLib,
    });
  };

  // Print Ferm & Packaging Sheet — combined A4 handwriting sheet covering
  // fermentation log, harvest, and packaging. Same getter-at-click-time
  // pattern as the two handlers above.
  const handlePrintFermPackagingSheet = () => {
    const recipe = activeRecipeId ? recipes.find(r => r.id === activeRecipeId) : null;
    if (!recipe) { pushToast({ message: 'Open a recipe first.', variant: 'info' }); return; }
    const ingredients = ingredientsByRecipe[recipe.id] ?? [];
    const tankName = recipe.bdFv ? (tankCalib[recipe.bdFv]?.name ?? recipe.bdFv) : '';
    printFermPackagingSheet({
      recipe, ingredients,
      fermMeta: getFermMeta(recipe.id),
      coldSide: getColdSide(recipe.id),
      brewDay: getBrewDay(recipe.id),
      tankName,
      // Per-recipe brewer wins; falls back to brewery-wide setting.
      brewerName: (recipe.brewer || '').trim() || settings.breweryName || '',
    });
  };

  // Print Full Brew Packet — calls all three print sheets in sequence.
  const handlePrintFullPacket = () => {
    handlePrintPrepSheet();
    handlePrintBrewDaySheet();
    handlePrintFermPackagingSheet();
  };

  return (
    <div className="desktop-layout">
      {/* ═══ Menu Bar ═══ */}
      <header className="menu-bar" ref={menuRef}>
        <div className="title-logo">BREWLAB</div>
        <div
          className={`menu-item ${openMenu === 'file' ? 'open' : ''}`}
          onClick={e => { if (e.target === e.currentTarget) toggleMenu('file'); }}
        >
          File
          <div className={`menu-dropdown ${openMenu === 'file' ? 'open' : ''}`}>
            <div
              className="menu-dd-item"
              onClick={() => {
                closeMenus();
                recipeImportInputRef.current?.click();
              }}
            >Import Recipe (BeerXML)</div>
            <input
              ref={recipeImportInputRef}
              type="file"
              accept=".xml,.beerxml,.bsmx"
              style={{ display: 'none' }}
              onChange={handleRecipeImportFile}
            />
            <div className="menu-dd-sep" />
            <div
              className="menu-dd-item"
              onClick={() => {
                closeMenus();
                handleExportCurrentRecipe();
              }}
            >Export Recipe (BeerXML)</div>
            <div
              className="menu-dd-item"
              onClick={() => {
                closeMenus();
                handleExportSelected();
              }}
            >Export Selected...</div>
            <div className="menu-dd-sep" />
            <div
              className="menu-dd-item"
              onClick={() => {
                closeMenus();
                if (!activeRecipeId) { pushToast({ message: 'No recipe open.', variant: 'info' }); return; }
                setSaveTemplateModalOpen(true);
              }}
            >Save as Template</div>
            <div className="menu-dd-sep" />
            <div
              className="menu-dd-item"
              onClick={() => {
                closeMenus();
                try {
                  const { keyCount, filename } = exportAllData();
                  pushToast({
                    message: `Exported ${keyCount} keys to ${filename}. File contains Supabase URL/anon key — don't share without review.`,
                    duration: 8000,
                  });
                } catch (err) {
                  pushToast({
                    message: `Backup failed: ${err instanceof Error ? err.message : String(err)}`,
                    variant: 'error',
                  });
                }
              }}
            >Export All Data (backup)</div>
            <div
              className="menu-dd-item"
              onClick={() => {
                closeMenus();
                backupImportInputRef.current?.click();
              }}
            >Import Backup</div>
            <input
              ref={backupImportInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={handleBackupImportFile}
            />
          </div>
        </div>
        <div
          className={`menu-item ${openMenu === 'view' ? 'open' : ''}`}
          onClick={e => { if (e.target === e.currentTarget) toggleMenu('view'); }}
        >
          View
          <div className={`menu-dropdown ${openMenu === 'view' ? 'open' : ''}`}>
            {/* Each "Show X" toggles the tab on AND switches to it.
                Mirrors Show Recipe Submitter / Tax Master below. */}
            <div className="menu-dd-item" onClick={() => {
              setTabVisibility({ planner: true });
              setActiveTab('planner');
              closeMenus();
            }}>Show Planner</div>
            <div className="menu-dd-item" onClick={() => {
              setTabVisibility({ inventory: true });
              setActiveTab('inventory');
              closeMenus();
            }}>Show Inventory</div>
            <div className="menu-dd-item" onClick={() => {
              setTabVisibility({ orderPlanner: true });
              setActiveTab('orderPlanner');
              closeMenus();
            }}>Show Order Planner</div>
            <div className="menu-dd-item" onClick={() => {
              setTabVisibility({ submitter: true });
              setActiveTab('submitter');
              closeMenus();
            }}>Show Recipe Submitter</div>
            <div className="menu-dd-item" onClick={() => {
              setTabVisibility({ taxMaster: true });
              setActiveTab('taxMaster');
              closeMenus();
            }}>Tax Master</div>
            <div className="menu-dd-item" onClick={() => {
              setTabVisibility({ tariffReduction: true });
              setActiveTab('tariffReduction');
              closeMenus();
            }}>Tariff Reduction</div>
          </div>
        </div>
        <div
          className={`menu-item ${openMenu === 'libraries' ? 'open' : ''}`}
          onClick={e => { if (e.target === e.currentTarget) toggleMenu('libraries'); }}
        >
          Libraries
          <div className={`menu-dropdown ${openMenu === 'libraries' ? 'open' : ''}`}>
            {/* Each item routes to the Libraries page AND points it at the
                requested sub-section (Malt / Hop / Yeast / Misc). Mirrors
                HTML openLibrariesTab(section) (brewlab-desktop.html:16573). */}
            <div className="menu-dd-item" onClick={() => { setLibrariesSection('malts'); setActiveTab('libraries'); closeMenus(); }}>Malt Library</div>
            <div className="menu-dd-item" onClick={() => { setLibrariesSection('hops');  setActiveTab('libraries'); closeMenus(); }}>Hop Library</div>
            <div className="menu-dd-item" onClick={() => { setLibrariesSection('yeast'); setActiveTab('libraries'); closeMenus(); }}>Yeast Library</div>
            <div className="menu-dd-item" onClick={() => { setLibrariesSection('misc');  setActiveTab('libraries'); closeMenus(); }}>Misc Library</div>
            <div className="menu-dd-sep" />
            {/* Import / Export from the menu — opens the Libraries page first
                (so the in-page toolbar buttons can do the file work) and lets
                the user choose the destination section before importing. */}
            <div className="menu-dd-item" onClick={() => { setActiveTab('libraries'); closeMenus(); }}>Import Library (BeerXML)</div>
            <div className="menu-dd-item" onClick={() => { setActiveTab('libraries'); closeMenus(); }}>Export Library (BeerXML)</div>
          </div>
        </div>
        <div className="menu-item" onClick={() => { setActiveTab('notes'); closeMenus(); }}>Notes</div>
        <div
          className={`menu-item ${openMenu === 'settings' ? 'open' : ''}`}
          onClick={e => { if (e.target === e.currentTarget) toggleMenu('settings'); }}
        >
          Settings
          <div className={`menu-dropdown ${openMenu === 'settings' ? 'open' : ''}`}>
            {/* Each item routes to the Settings page AND points it at the
                requested sub-tab (mirrors HTML switchSettingsQuick →
                openSettingsTab, brewlab-desktop.html:16614). Without setting
                the section first, the panel always lands on its default. */}
            {([
              'Units', 'Bitterness', 'Advanced', 'Styles', 'Tanks',
              'Equipment Profiles', 'Water Profiles', 'Mash Profiles',
              'Pitch Profiles', 'Suppliers', 'Connection',
            ] as const).map(name => (
              <div
                key={name}
                className="menu-dd-item"
                onClick={() => { setSettingsSection(name); setActiveTab('settings'); closeMenus(); }}
              >{name}</div>
            ))}
          </div>
        </div>
        <div className="menu-item">Help</div>
      </header>

      {/* ═══ Top Tab Bar ═══ */}
      {/* RECIPES is permanent. Open recipes get their own closeable tabs. Other tabs (Libraries, Settings, etc.) are closeable. */}
      <nav className="tabbar">
        {/* RECIPES — always visible, always first */}
        <div
          className={`tab ${activeTab === 'recipes' ? 'active' : ''}`}
          onClick={() => { setActiveTab('recipes'); }}
        >RECIPES</div>

        {/* Open recipe tabs — inserted dynamically like HTML app's recipe-tabs-container */}
        {openRecipeTabs.map(rid => {
          const r = recipes.find(x => x.id === rid);
          const label = (r?.locked ? '🔒 ' : '') + (r?.beerName || r?.name || 'Recipe').toUpperCase();
          return (
            <div
              key={rid}
              className={`tab ${activeTab === 'recipe:' + rid ? 'active' : ''}`}
              style={{ paddingRight: 4 }}
              onClick={() => { selectRecipe(rid); setActiveTab('recipe:' + rid); }}
            >
              <span className="tab-label">{label}</span>
              <span className="tab-close" title="Close" onClick={e => closeRecipeTab(e, rid)}>&times;</span>
            </div>
          );
        })}

        {/* Other closeable tabs */}
        {tabVisibility.planner && (
          <div className={`tab ${activeTab === 'planner' ? 'active' : ''}`} style={{ paddingRight: 4 }} onClick={() => setActiveTab('planner')}>
            <span className="tab-label">PLANNER</span>
            <span
              className="tab-close"
              title="Close"
              onClick={e => {
                e.stopPropagation();
                setTabVisibility({ planner: false });
                if (activeTab === 'planner') setActiveTab('recipes');
              }}
            >&times;</span>
          </div>
        )}
        {tabVisibility.inventory && (
          <div className={`tab ${activeTab === 'inventory' ? 'active' : ''}`} style={{ paddingRight: 4 }} onClick={() => setActiveTab('inventory')}>
            <span className="tab-label">INVENTORY</span>
            <span
              className="tab-close"
              title="Close"
              onClick={e => {
                e.stopPropagation();
                setTabVisibility({ inventory: false });
                if (activeTab === 'inventory') setActiveTab('recipes');
              }}
            >&times;</span>
          </div>
        )}
        {tabVisibility.orderPlanner && (
          <div className={`tab ${activeTab === 'orderPlanner' ? 'active' : ''}`} style={{ paddingRight: 4 }} onClick={() => setActiveTab('orderPlanner')}>
            <span className="tab-label">ORDER PLANNER</span>
            <span
              className="tab-close"
              title="Close"
              onClick={e => {
                e.stopPropagation();
                setTabVisibility({ orderPlanner: false });
                if (activeTab === 'orderPlanner') setActiveTab('recipes');
              }}
            >&times;</span>
          </div>
        )}
        {tabVisibility.submitter && (
          <div className={`tab ${activeTab === 'submitter' ? 'active' : ''}`} style={{ paddingRight: 4 }} onClick={() => setActiveTab('submitter')}>
            <span className="tab-label">SUBMITTER</span>
            <span
              className="tab-close"
              title="Close"
              onClick={e => {
                e.stopPropagation();
                setTabVisibility({ submitter: false });
                if (activeTab === 'submitter') setActiveTab('recipes');
              }}
            >&times;</span>
          </div>
        )}
        {tabVisibility.taxMaster && (
          <div className={`tab ${activeTab === 'taxMaster' ? 'active' : ''}`} style={{ paddingRight: 4 }} onClick={() => setActiveTab('taxMaster')}>
            <span className="tab-label">TAX MASTER</span>
            <span
              className="tab-close"
              title="Close"
              onClick={e => {
                e.stopPropagation();
                setTabVisibility({ taxMaster: false });
                if (activeTab === 'taxMaster') setActiveTab('recipes');
              }}
            >&times;</span>
          </div>
        )}
        <UndoButton />
      </nav>

      {/* ═══ Recipe Meta Bar — shown only when a recipe tab is active ═══
           Layout: title left, metadata pills + beer glass right (marginLeft
           auto). On the Ingredients sub-tab the bar is left-padded by the
           sidebar width so the title aligns with the content column below;
           other sub-tabs use the default 20 px from the CSS class. */}
      {isRecipeOpen && selectedRecipeForMeta && (
        <div
          className="recipe-meta-bar"
          style={recipeSubTab === 'ingredients'
            ? { paddingLeft: 236, paddingRight: 20 }
            : undefined}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0, minWidth: 120 }}>
            <input
              type="text"
              value={selectedRecipeForMeta.beerName || ''}
              onChange={e => updateRecipe(selectedRecipeForMeta.id, { beerName: e.target.value })}
              placeholder="Beer / label name"
              style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em', background: 'transparent', border: 'none', outline: 'none', padding: 0, fontFamily: 'var(--sans)', width: '100%' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' as const, color: 'var(--text-muted)', flexShrink: 0 }}>Recipe</span>
              <input
                type="text"
                value={selectedRecipeForMeta.name || ''}
                onChange={e => updateRecipe(selectedRecipeForMeta.id, { name: e.target.value })}
                placeholder="仕込記号"
                style={{ fontSize: 11, color: 'var(--text-muted)', background: 'transparent', border: 'none', borderBottom: '1px dashed rgba(255,255,255,0.15)', outline: 'none', padding: 0, fontFamily: 'var(--sans)', minWidth: 60 }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              {(['own', 'collab', 'oem'] as RecipeOrigin[]).map(opt => (
                <button
                  key={opt}
                  className="btn sm"
                  style={{
                    padding: '1px 7px', fontSize: 10,
                    ...(selectedRecipeForMeta.recipeOrigin === opt
                      ? { color: 'var(--amber)', borderColor: 'var(--amber)' }
                      : {}),
                  }}
                  onClick={() => updateRecipe(selectedRecipeForMeta.id, {
                    recipeOrigin: selectedRecipeForMeta.recipeOrigin === opt ? null : opt,
                  })}
                >
                  {opt === 'own' ? 'Own' : opt === 'collab' ? 'Collab' : 'OEM'}
                </button>
              ))}
              {(selectedRecipeForMeta.recipeOrigin === 'collab' || selectedRecipeForMeta.recipeOrigin === 'oem') && (
                <input
                  type="text"
                  value={selectedRecipeForMeta.oemFor ?? ''}
                  onChange={e => updateRecipe(selectedRecipeForMeta.id, { oemFor: e.target.value })}
                  placeholder={selectedRecipeForMeta.recipeOrigin === 'oem' ? 'OEM for...' : 'Collab with...'}
                  style={{ fontSize: 10, color: 'var(--text-muted)', background: 'transparent', border: 'none', borderBottom: '1px dashed rgba(255,255,255,0.15)', outline: 'none', padding: 0, fontFamily: 'var(--sans)', minWidth: 80 }}
                />
              )}
            </div>
          </div>
          {/* Metadata pills + beer glass — pushed right via marginLeft auto */}
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center' }}>
            {/* Tax Batch # — brewery-wide unique constraint enforced on
                the Supabase side (see recipeToRow tax_batch comment). */}
            <div className="meta-pill" style={{ minWidth: 64, flexShrink: 0 }}>
              <div className="meta-pill-label">Tax Batch #</div>
              <input
                className="meta-pill-input"
                type="text"
                value={selectedRecipeForMeta.taxBatch || ''}
                onChange={e => updateRecipe(selectedRecipeForMeta.id, { taxBatch: e.target.value })}
                style={{ width: 48, color: 'var(--amber)' }}
                placeholder="—"
                title="Brewery-wide manual NTA tax serial (e.g. 384). Brewery-wide unique."
              />
            </div>
            <div className="meta-pill" style={{ minWidth: 80 }}>
              <div className="meta-pill-label">Brew Date</div>
              <input
                className="meta-pill-input"
                type="date"
                value={selectedRecipeForMeta.brewDate || ''}
                onChange={e => updateRecipe(selectedRecipeForMeta.id, { brewDate: e.target.value })}
                style={{ fontSize: 12, width: 110 }}
              />
            </div>
            <div className="meta-pill" style={{ cursor: 'pointer' }}>
              <div className="meta-pill-label">Version</div>
              <div className="meta-pill-val" style={{ fontSize: 12 }}>{selectedRecipeForMeta.version || '1.0'}</div>
            </div>
            {/* Brew # — read-only per-lineage counter. Set automatically
                by createNextRecipeFromCurrent or the from-scratch creation
                paths. Em-dash only when brewNumber is null (legacy rows). */}
            <div className="meta-pill" style={{ minWidth: 56 }} title="Per-lineage brew counter. Set automatically when a new brew is created.">
              <div className="meta-pill-label">Brew #</div>
              <div className="meta-pill-val" style={{ fontSize: 12 }}>
                {selectedRecipeForMeta.brewNumber != null ? `#${selectedRecipeForMeta.brewNumber}` : '—'}
              </div>
            </div>
            {/* Beer-glass icon — rightmost element of the metadata cluster.
                Aligns with the right edge of Checklist tab below (both end at
                the same paddingRight on Ingredients sub-tab). */}
            <BeerGlassIcon
              size={50}
              fill={ebcToHex(selectedRecipeForMeta.ebc)}
              title={`Color: ${selectedRecipeForMeta.ebc > 0 ? fmtNum(selectedRecipeForMeta.ebc, { suffix: ' EBC' }) : '—'}`}
            />
          </div>
        </div>
      )}

      {/* ═══ Sub-tabs — shown only when a recipe tab is active ═══
           Order: meta bar (above) → sub-tabs (here) → equipment-derived
           pill strip (below, Ingredients only) → main content. Recipe
           identity sits at the top of the recipe page so the sub-tab
           nav reads as a section divider rather than chrome above the
           recipe being edited. */}
      {isRecipeOpen && (
        <div
          className="tabbar"
          style={{
            background: 'var(--bg)',
            borderTop: '1px solid var(--border)',
            // On Ingredients: align left edge with content-column edge
            // (sidebar width + 16) and right edge with beer glass (20).
            // Tabs flex-grow so Brew History / Checklist land at known
            // fractional positions of the row.
            paddingLeft: recipeSubTab === 'ingredients' ? 236 : 16,
            paddingRight: 20,
            justifyContent: 'flex-start',
          }}
        >
          {([
            ['ingredients', 'Ingredients'],
            ['brewday',     'Brew Day'],
            ['ferm',        'Fermentation'],
            ['cold',        'Packaging'],
            ['tax',         'Tax'],
            ['taxsummary',  'Tax Summary'],
            ['analysis',    'Analysis'],
            ['water',       'Water'],
            ['history',     'Brew History'],
            ['checklist',   'Checklist'],
          ] as [RecipeSubTab, string][]).map(([key, label]) => (
            <div
              key={key}
              className={`sub-tab${recipeSubTab === key ? ' active' : ''}`}
              onClick={() => setRecipeSubTab(key)}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {label}
            </div>
          ))}

          {/* Print dropdown — single entry point for the Prep Sheet and
              Brew Day Sheet prints. Sits flush right, after the last tab;
              not a tab itself (buttons "sit" on the tab row here, they
              don't participate in the flex:1 tab-width split). */}
          <div
            ref={printMenuRef}
            style={{ position: 'relative', marginLeft: 8, flexShrink: 0 }}
            onMouseDown={e => e.stopPropagation()}
          >
            <button
              className="btn sm"
              onClick={() => setPrintMenuOpen(o => !o)}
              title="Print a brewer's worksheet for this recipe"
            >
              Print ▾
            </button>
            {printMenuOpen && (
              <div className="menu-dropdown open" style={{ left: 'auto', right: 0, minWidth: 160 }}>
                <div
                  className="menu-dd-item"
                  onClick={() => { handlePrintPrepSheet(); setPrintMenuOpen(false); }}
                >Prep Sheet</div>
                <div
                  className="menu-dd-item"
                  onClick={() => { handlePrintBrewDaySheet(); setPrintMenuOpen(false); }}
                >Brew Day Sheet</div>
                <div
                  className="menu-dd-item"
                  onClick={() => { handlePrintFermPackagingSheet(); setPrintMenuOpen(false); }}
                >Ferm &amp; Packaging Sheet</div>
                <div
                  className="menu-dd-item"
                  onClick={() => { handlePrintFullPacket(); setPrintMenuOpen(false); }}
                >Print Full Packet</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Equipment-derived pills (Batch into FV/WP, Expected Loss, Boil,
          BH Eff, WP Temp) moved into RecipeTab's left column, sandwiched
          between the ingredient cards and the bottom 3-panel grid. They
          read as a compact info strip next to the editing surface rather
          than chrome above it. */}

      {/* ═══ Main Content Area ═══ */}
      <div className="global-layout">
        <div className="main-content">

          {/* Recipe-browser sidebar — shared between the recipes-browser
              page (activeTab === 'recipes') and the recipe Ingredients
              sub-tab. The latter wraps RecipeTab with this same sidebar
              on the left so the user can navigate to other recipes
              without leaving the editor. Other recipe sub-tabs (brewday,
              ferm, tax, etc.) keep their full-width layout — out of
              scope for the layout redesign. */}
          {(() => {
            const renderRecipeBrowserSidebar = () => (
              <div data-recipe-sidebar style={{ width: 220, background: 'var(--panel)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                <div style={{ background: 'var(--panel2)', borderBottom: '1px solid var(--border)', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 2, color: 'var(--amber)' }}>RECIPES</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <button className="btn sm" onClick={() => setNewRecipeModalCtx({ folderId: null })}>＋ New</button>
                    <button className="btn sm" onClick={handleNewFolder}>📁 Folder</button>
                  </div>
                </div>
                <div className="rb-toolbar" style={{ padding: '6px 8px' }}>
                  <button
                    className={`rb-view-btn ${sidebarTab === 'overview' ? 'active' : ''}`}
                    onClick={() => { setSidebarTab('overview'); setPreview(null); }}
                  >
                    Overview
                  </button>
                  <button
                    className={`rb-view-btn ${sidebarTab === 'explorer' ? 'active' : ''}`}
                    onClick={() => setSidebarTab('explorer')}
                  >
                    Recipe Explorer
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <FolderTree
                    folders={folders}
                    recipes={recipes}
                    preview={preview}
                    popoverId={popoverRecipeId}
                    setPreview={(sel) => {
                      // Sidebar recipe single-click → toggle the floating
                      // popover. Doesn't navigate, doesn't update
                      // `preview`. Same recipe re-clicked closes;
                      // different recipe replaces the open popover.
                      if (sel?.kind === 'recipe') {
                        setPopoverRecipeId(prev => prev === sel.id ? null : sel.id);
                        return;
                      }
                      // Folder click (or null deselect) — close any open
                      // popover and update preview state for the
                      // embedded folder-preview pane on the Recipes tab.
                      setPopoverRecipeId(null);
                      setPreview(sel);
                    }}
                    setFolders={setFolders}
                    setRecipes={setRecipes}
                    openRecipe={(id) => { setPopoverRecipeId(null); setPreview(null); openRecipe(id); }}
                    onRecipeContext={handleRecipeContext}
                    onFolderContext={handleFolderContext}
                    onBulkContext={handleBulkContext}
                    onBlankContext={handleBlankContext}
                    selectionRef={folderSelectionRef}
                  />
                </div>
                <div className="rb-new-folder-btn" onClick={handleNewFolder} role="button">＋ New Folder</div>
              </div>
            );

            return (
              <>
                {/* page-recipes: recipe browser (left 220px) + preview (right) */}
                {activeTab === 'recipes' && (
                  <div className="page page-row">
                    {renderRecipeBrowserSidebar()}
                    {/* Right pane swap. Explorer tab → RecipeExplorerPanel
                        unconditionally (preview state is preserved but not
                        rendered until the user switches back). Overview tab
                        → preview takes precedence; falls back to the
                        BreweryOverviewPanel dashboard. */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
                      {sidebarTab === 'explorer' ? (
                        <RecipeExplorerPanel
                          recipes={recipes}
                          folders={folders}
                          setFolders={setFolders}
                          openRecipe={openRecipe}
                          onBlankContext={handleBlankContext}
                          selectedFolderId={preview?.kind === 'folder' ? preview.id : null}
                        />
                      ) : (() => {
                        const r = preview?.kind === 'recipe' ? recipes.find(x => x.id === preview.id) : null;
                        const f = preview?.kind === 'folder' ? folders.find(x => x.id === preview.id) : null;
                        if (r) return <RecipePreview recipe={r} onOpen={() => { setPreview(null); openRecipe(r.id); }} />;
                        if (f) return (
                          <FolderPreview
                            folder={f}
                            onSelectFolder={folderId => setPreview({ kind: 'folder', id: folderId })}
                            onPreviewRecipe={recipeId => setPreview({ kind: 'recipe', id: recipeId })}
                            onOpenRecipe={recipeId => { setPreview(null); openRecipe(recipeId); }}
                            onNewSubfolder={handleNewSubfolder}
                            onNewRecipe={handleNewRecipeInFolder}
                          />
                        );
                        return <BreweryOverviewPanel onOpenRecipe={openRecipe} />;
                      })()}
                    </div>
                  </div>
                )}

                {/* page-recipe / Ingredients sub-tab: same sidebar on the
                    left, RecipeTab on the right. RecipeTab handles its
                    own action stack + bottom-row panels internally. */}
                {isRecipeOpen && activeRecipeId && recipeSubTab === 'ingredients' && (
                  <div className="page page-row">
                    {renderRecipeBrowserSidebar()}
                    <RecipeTab recipeId={activeRecipeId} />
                  </div>
                )}
              </>
            );
          })()}

          {/* Ingredients sub-tab is rendered inside the wrapper above
              (alongside the recipe-browser sidebar). The remaining sub-
              tabs render full-width with no sidebar. */}
          {isRecipeOpen && activeRecipeId && recipeSubTab === 'brewday' && (
            <BrewDayTab recipeId={activeRecipeId} />
          )}
          {isRecipeOpen && activeRecipeId && recipeSubTab === 'ferm' && (
            <FermTab key={activeRecipeId} recipeId={activeRecipeId} />
          )}
          {isRecipeOpen && activeRecipeId && recipeSubTab === 'cold' && (
            <PackagingTab key={activeRecipeId} recipeId={activeRecipeId} />
          )}
          {isRecipeOpen && activeRecipeId && recipeSubTab === 'water' && (
            <WaterTab key={activeRecipeId} recipeId={activeRecipeId} />
          )}
          {isRecipeOpen && activeRecipeId && recipeSubTab === 'history' && (
            <HistoryTab
              key={activeRecipeId}
              recipeId={activeRecipeId}
              onOpenRecipe={openRecipe}
            />
          )}
          {isRecipeOpen && activeRecipeId && recipeSubTab === 'checklist' && (
            <ChecklistTab
              key={activeRecipeId}
              recipeId={activeRecipeId}
              goToSubTab={setRecipeSubTab}
              goToTopLevel={setActiveTab}
            />
          )}
          {isRecipeOpen && activeRecipeId && recipeSubTab === 'tax' && (
            <TaxTab key={activeRecipeId} recipeId={activeRecipeId} />
          )}
          {isRecipeOpen && activeRecipeId && recipeSubTab === 'taxsummary' && (
            <TaxSummaryTab key={activeRecipeId} recipeId={activeRecipeId} />
          )}
          {isRecipeOpen && activeRecipeId && recipeSubTab === 'analysis' && (
            <AnalysisTab key={activeRecipeId} recipeId={activeRecipeId} />
          )}

          {/* Other pages */}
          {activeTab === 'libraries' && <LibrariesPage />}
          {activeTab === 'settings' && <SettingsPanel />}
          {activeTab === 'notes' && <NotesPage />}
          {activeTab === 'planner' && <PlannerPage />}
          {activeTab === 'inventory' && <InventoryPage />}
          {activeTab === 'orderPlanner' && <OrderPlannerPage />}
          {activeTab === 'submitter' && <NtaPage />}
          {activeTab === 'taxMaster' && <TaxMasterPage />}
          {activeTab === 'tariffReduction' && <TariffReductionPage />}
        </div>
      </div>

      {/* New Recipe modal — Blank / From Template tabs (HTML 3631–3695).
          defaultFolderId pre-targets when opened via FolderPreview's
          "+ New Recipe Here". */}
      {newRecipeModalCtx && (
        <NewRecipeModal
          onClose={() => setNewRecipeModalCtx(null)}
          onCreated={openRecipe}
          defaultFolderId={newRecipeModalCtx.folderId}
        />
      )}

      {/* Save as Template modal (HTML 3697–3718). Active recipe is
          guaranteed by the menu-item gate above. */}
      {saveTemplateModalOpen && activeRecipeId && (
        <SaveTemplateModal
          recipeId={activeRecipeId}
          onClose={() => setSaveTemplateModalOpen(false)}
        />
      )}

      {/* Floating recipe-preview popover. Opens on sidebar single-click,
          stays on the current tab. Replaces the previous "navigate to
          Recipes/Overview" sidebar-click behavior. Anchored to the
          sidebar's right edge via popoverPos, measured at open time. */}
      {popoverRecipeId && popoverPos && (() => {
        const r = recipes.find(x => x.id === popoverRecipeId);
        if (!r) return null;
        return (
          <RecipePreviewPopover
            recipe={r}
            pos={popoverPos}
            onOpen={() => { setPopoverRecipeId(null); openRecipe(r.id); }}
          />
        );
      })()}

      {/* Recipe BeerXML import preview (HTML recipeImportOverlay
          line ~17317). Single-recipe variant shows full ingredient summary;
          multi-recipe variant shows a list. Confirm materializes through
          the store; cancel discards. */}
      {pendingImports && (
        <RecipeImportPreview
          recipes={pendingImports}
          onConfirm={confirmRecipeImport}
          onCancel={() => setPendingImports(null)}
        />
      )}

      {/* Backup restore preview — two-stage button gate. The dataBackup
          parser already validated the file shape; this modal surfaces
          metadata + warnings and locks commit behind a second click.
          See lib/dataBackup.ts header for the disconnect-on-restore
          rationale. */}
      {pendingBackup && (
        <BackupImportConfirm
          backup={pendingBackup}
          onConfirm={confirmBackupRestore}
          onCancel={() => setPendingBackup(null)}
        />
      )}

      {/* Recipe browser right-click context menu (HTML rbCtxMenu, line 3958). */}
      {recipeCtxMenu && (
        <div
          className="ctx-menu open"
          style={{ left: recipeCtxMenu.x, top: recipeCtxMenu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="ctx-item" onClick={() => { rbCtxRename(recipeCtxMenu.recipeId); setRecipeCtxMenu(null); }}>
            ✎ Rename
          </div>
          <div className="ctx-item" onClick={() => { rbCtxDuplicate(recipeCtxMenu.recipeId); setRecipeCtxMenu(null); }}>
            ⧉ Duplicate
          </div>
          <div className="ctx-item" onClick={() => { rbCtxMove(recipeCtxMenu.recipeId); setRecipeCtxMenu(null); }}>
            → Move to folder
          </div>
          <div className="ctx-sep" />
          <div className="ctx-item danger" onClick={() => { rbCtxDelete(recipeCtxMenu.recipeId); setRecipeCtxMenu(null); }}>
            ✕ Delete recipe
          </div>
        </div>
      )}

      {/* Bulk context menu — shown on right-click of a row that's part of a
          multi-selection. Operates on the entire selection. */}
      {bulkCtxMenu && (
        <div
          className="ctx-menu open"
          style={{ left: bulkCtxMenu.x, top: bulkCtxMenu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="ctx-item" onClick={() => { handleBulkMove(bulkCtxMenu.ids); setBulkCtxMenu(null); }}>
            → Move {bulkCtxMenu.ids.length} to folder
          </div>
          <div className="ctx-sep" />
          <div className="ctx-item danger" onClick={() => { handleBulkDelete(bulkCtxMenu.ids); setBulkCtxMenu(null); }}>
            ✕ Delete {bulkCtxMenu.ids.length} recipes
          </div>
        </div>
      )}

      {/* Folder right-click context menu (HTML folderCtxMenu, line 4199). */}
      {folderCtxMenu && (
        <div
          className="ctx-menu open"
          style={{ left: folderCtxMenu.x, top: folderCtxMenu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="ctx-item" onClick={() => { folderCtxRename(folderCtxMenu.folderId); setFolderCtxMenu(null); }}>
            ✎ Rename
          </div>
          <div className="ctx-item" onClick={() => { handleNewSubfolder(folderCtxMenu.folderId); setFolderCtxMenu(null); }}>
            ＋ New Subfolder
          </div>
          <div className="ctx-sep" />
          <div className="ctx-item danger" onClick={() => { folderCtxDelete(folderCtxMenu.folderId); setFolderCtxMenu(null); }}>
            ✕ Delete folder
          </div>
        </div>
      )}

      {/* Blank-area right-click — fired by FolderTree's wrapper or by
          the explorer's By Folder list. Single-item menu wired to the
          same handleNewFolder action the top "📁 Folder" button uses. */}
      {blankCtxMenu && (
        <div
          className="ctx-menu open"
          style={{ left: blankCtxMenu.x, top: blankCtxMenu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="ctx-item" onClick={() => { setBlankCtxMenu(null); handleNewFolder(); }}>
            ＋ New Folder
          </div>
        </div>
      )}
    </div>
  );
}


/**
 * Recipe-level profile picker — Equipment only (Water and Pitch/O₂
 * pickers were moved to their own tabs; this row keeps Equipment because
 * its values flow into the recipe meta-bar pills before the user opens
 * Brew Day).
 *
 * Reads the equip profile list from the store (live — picks up new
 * profiles created in Settings the moment they're saved) and the current
 * per-recipe selection from `recipeProfilesByRecipe[recipeId]`.
 *
 * Persistence: `setRecipeProfileKind` writes to localStorage and updates
 * the store. BrewDayTab.activeEquip and the Recipe meta-bar's effective-
 * trub-loss memo subscribe to the same slice → recompute fires
 * immediately on change.
 *
 * Mirrors HTML populateRecipeProfileDropdowns (line 20105) +
 * applyEquipProfile. Active profile values feed downstream calcs via
 * `equipProfiles.find(p => p.id === selection)` lookups in BrewDayTab —
 * no separate "apply" step needed; selection IS application.
 */
// Sidebar recipe row + folder tree live in components/recipe/FolderTree.tsx.
// formatRecipeStyleLine moved to lib/utils.ts so it can be shared.
// (RecipesEmptyState removed — the right pane now defaults to
//  BreweryOverviewPanel when nothing is previewed.)

// ProfileSelect was inlined into components/recipe/ActionStack.tsx
// (Setup section). Removed here — no other call sites.

/**
 * BeerXML import preview modal. Shows what will be created before any
 * state changes, mirroring the HTML overlay at brewlab-desktop.html:17302.
 * Single-recipe variant lists every ingredient; multi-recipe variant
 * collapses to one line per recipe.
 */
function RecipeImportPreview({
  recipes, onConfirm, onCancel,
}: {
  recipes: ParsedRecipe[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Close on Escape — same UX as other modals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const single = recipes.length === 1 ? recipes[0] : null;

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1,
    textTransform: 'uppercase', color: 'var(--text-muted)',
  };
  const valueStyle: React.CSSProperties = {
    fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)',
  };

  return (
    <div className="modal-overlay open" onClick={onCancel}>
      <div
        className="modal"
        style={{ width: 560, maxWidth: '96vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">IMPORT BEERXML</span>
          <button className="modal-close" onClick={onCancel}>&times;</button>
        </div>

        <div className="modal-body" style={{ padding: '14px 18px', overflowY: 'auto' }}>
          {single ? (
            <SingleRecipePreview recipe={single} labelStyle={labelStyle} valueStyle={valueStyle} />
          ) : (
            <>
              <div style={{ fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 2, color: 'var(--amber)', marginBottom: 8 }}>
                {recipes.length} RECIPES FOUND
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {recipes.map((r, i) => (
                  <div key={i} style={valueStyle}>
                    <span style={{ color: 'var(--text-muted)' }}>{i + 1}.</span>{' '}
                    <strong style={{ color: 'var(--text)' }}>{r.name}</strong>
                    {' — '}
                    {fmtNum(r.batchL, { suffix: ' L' })}, {r.ingredients.length} ingredients
                    {r.styleName && (
                      <span style={{ color: 'var(--text-muted)' }}> · {r.styleName}{r.styleKey && ` (${r.styleKey})`}</span>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
                All recipes will be imported as new entries. The first will open after import.
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" onClick={onConfirm}>
            {recipes.length === 1 ? 'Import Recipe' : `Import ${recipes.length} Recipes`}
          </button>
        </div>
      </div>
    </div>
  );
}

function SingleRecipePreview({
  recipe, labelStyle, valueStyle,
}: {
  recipe: ParsedRecipe;
  labelStyle: React.CSSProperties;
  valueStyle: React.CSSProperties;
}) {
  const grains    = recipe.ingredients.filter(i => i.type === 'grain');
  const hops      = recipe.ingredients.filter(i => i.type === 'hop');
  const yeasts    = recipe.ingredients.filter(i => i.type === 'yeast');
  const miscAll   = recipe.ingredients.filter(i => i.type === 'misc');
  const waterChem = miscAll.filter(isWaterChem);
  const miscs     = miscAll.filter(i => !isWaterChem(i));

  const Section = ({ title, items, format }: {
    title: string;
    items: Omit<Ingredient, 'id'>[];
    format: (i: Omit<Ingredient, 'id'>) => string;
  }) => items.length === 0 ? null : (
    <div style={{ marginTop: 10 }}>
      <div style={{ ...labelStyle, marginBottom: 3 }}>{title} ({items.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((ing, i) => (
          <div key={i} style={{ ...valueStyle, color: 'var(--text-dim)' }}>{format(ing)}</div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {/* Title + style row */}
      <div style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 2, color: 'var(--amber)' }}>
        {recipe.name}
      </div>
      {recipe.styleName && (
        <div style={{ ...valueStyle, color: 'var(--text-muted)', marginTop: 2 }}>
          {recipe.styleName}{recipe.styleKey && ` · ${recipe.styleKey}`}
        </div>
      )}

      {/* Top stats grid. Efficiency dropped — BeerXML's EFFICIENCY no
          longer feeds bhEff (the brewery's own default applies at
          confirm time instead), and OG/FG shown here get recomputed
          from the grain bill at that same default before the recipe
          is created, so they're only a rough preview. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
        marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)',
      }}>
        <div>
          <div style={labelStyle}>Batch</div>
          <div style={valueStyle}>{fmtNum(recipe.batchL, { suffix: ' L' })}</div>
        </div>
        <div>
          <div style={labelStyle}>Boil</div>
          <div style={valueStyle}>{recipe.boilTime} min</div>
        </div>
        <div>
          <div style={labelStyle}>OG / FG</div>
          <div style={valueStyle}>
            {fmtNum(recipe.ogPlato, { suffix: '°P' })}{recipe.fgPlato > 0 && ` / ${fmtNum(recipe.fgPlato, { suffix: '°P' })}`}
          </div>
        </div>
      </div>

      {/* Ingredient lists */}
      <Section
        title="Fermentables"
        items={grains}
        format={i => `${fmtNum(i.amt, { suffix: ' kg' })} · ${i.name}${i.extra ? ` · EBC ${i.extra}` : ''}`}
      />
      <Section
        title="Hops"
        items={hops}
        format={i => `${fmtNum(i.amt, { suffix: ' g' })} · ${i.name}${i.extra ? ` · ${i.extra}% AA` : ''}${i.time ? ` · ${i.time} min` : ''} · ${i.use}`}
      />
      <Section
        title="Yeast"
        items={yeasts}
        format={i => `${fmtNum(i.amt, { suffix: ' ' + i.unit })} · ${i.name}${i.extra ? ` · ${i.extra}% atten` : ''}`}
      />
      <Section
        title="Water Chemistry"
        items={waterChem}
        format={i => `${fmtNum(i.amt, { suffix: ' ' + i.unit })} · ${i.name}${i.time ? ` · ${i.time} min` : ''} · ${i.use}`}
      />
      <Section
        title="Misc"
        items={miscs}
        format={i => `${fmtNum(i.amt, { suffix: ' ' + i.unit })} · ${i.name}${i.time ? ` · ${i.time} min` : ''} · ${i.use}`}
      />

      {recipe.mashProfile && recipe.mashProfile.steps.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ ...labelStyle, marginBottom: 3 }}>Mash schedule ({recipe.mashProfile.steps.length} steps)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {recipe.mashProfile.steps.map((s, i) => (
              <div key={i} style={{ ...valueStyle, color: 'var(--text-dim)' }}>
                {s.type} · {s.temp}°C · {s.time} min
              </div>
            ))}
          </div>
        </div>
      )}

      {recipe.notes && (
        <div style={{ marginTop: 10 }}>
          <div style={{ ...labelStyle, marginBottom: 3 }}>Notes</div>
          <div style={{ ...valueStyle, color: 'var(--text-dim)', whiteSpace: 'pre-wrap' }}>
            {recipe.notes}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Backup restore confirmation modal. Surfaces backup metadata + cross-
 * brewery + empty-payload warnings, gates the destructive commit
 * behind a two-stage button click (no typed confirmation, but no
 * single-click path either). On confirm, calls the parent's
 * confirmBackupRestore which calls restoreBackup + reloads.
 */
function BackupImportConfirm({
  backup, onConfirm, onCancel,
}: {
  backup: BackupFile;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const backupKeyCount  = Object.keys(backup.data).length;
  const currentKeyCount = countCurrentBrewLabKeys();
  const backupSbUrl     = readBackupSupabaseUrl(backup);
  const currentSbUrl    = readCurrentSupabaseUrl();
  // Different-brewery flag: both sides have a URL and they differ. If
  // either side is empty the warning would be noisy (fresh install,
  // backup taken while disconnected, etc.) — skip in that case.
  const differentBrewery =
    backupSbUrl !== '' && currentSbUrl !== '' && backupSbUrl !== currentSbUrl;
  const empty = backupKeyCount === 0;

  // Pretty exportedAt + age. Falls back to raw string when unparseable
  // so a malformed-but-valid-shape date doesn't blow up the modal.
  let exportedDisplay = backup.exportedAt;
  try {
    const d = new Date(backup.exportedAt);
    if (!isNaN(d.getTime())) {
      const ageMs = Date.now() - d.getTime();
      const days  = Math.floor(ageMs / 86400000);
      const ageLabel = days <= 0 ? 'today'
        : days === 1 ? '1 day ago'
        : days < 30 ? `${days} days ago`
        : `${Math.floor(days / 30)} mo ago`;
      exportedDisplay = `${d.toLocaleString()} (${ageLabel})`;
    }
  } catch { /* keep raw */ }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1,
    textTransform: 'uppercase', color: 'var(--text-muted)',
  };
  const valueStyle: React.CSSProperties = {
    fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)',
  };
  const rowStyle: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: '120px 1fr',
    columnGap: 12, rowGap: 4, alignItems: 'baseline',
  };

  return (
    <div className="modal-overlay open" onClick={onCancel}>
      <div
        className="modal"
        style={{ width: 540, maxWidth: '96vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">IMPORT BACKUP</span>
          <button className="modal-close" onClick={onCancel}>&times;</button>
        </div>

        <div className="modal-body" style={{ padding: '14px 18px', overflowY: 'auto' }}>
          <div style={rowStyle}>
            <div style={labelStyle}>Exported</div>
            <div style={valueStyle}>{exportedDisplay}</div>
            <div style={labelStyle}>Format</div>
            <div style={valueStyle}>v{backup.version}</div>
            <div style={labelStyle}>App Version</div>
            <div style={valueStyle}>{backup.appVersion ?? '(none recorded)'}</div>
            <div style={labelStyle}>Backup Keys</div>
            <div style={valueStyle}>{backupKeyCount}</div>
            <div style={labelStyle}>Current Keys</div>
            <div style={valueStyle}>{currentKeyCount}</div>
            <div style={labelStyle}>Supabase URL</div>
            <div style={{ ...valueStyle, wordBreak: 'break-all' }}>
              {backupSbUrl || <span style={{ color: 'var(--text-muted)' }}>(none in backup)</span>}
            </div>
          </div>

          {differentBrewery && (
            <div style={{
              marginTop: 14,
              background: 'rgba(255,176,0,0.08)',
              border: '1px solid rgba(255,176,0,0.4)',
              padding: '8px 10px',
              fontFamily: 'var(--mono)', fontSize: 10,
              color: 'var(--amber)',
              lineHeight: 1.5,
            }}>
              ⚠ Backup is from <b style={{ wordBreak: 'break-all' }}>{backupSbUrl}</b><br />
              You are currently using <b style={{ wordBreak: 'break-all' }}>{currentSbUrl}</b>.<br />
              This looks like a different brewery's backup.
            </div>
          )}

          {empty && (
            <div style={{
              marginTop: 14,
              background: 'rgba(255,176,0,0.08)',
              border: '1px solid rgba(255,176,0,0.4)',
              padding: '8px 10px',
              fontFamily: 'var(--mono)', fontSize: 10,
              color: 'var(--amber)',
              lineHeight: 1.5,
            }}>
              ⚠ Backup contains 0 keys. Restoring will wipe your data and
              leave the app empty.
            </div>
          )}

          <div style={{
            marginTop: 14,
            background: 'rgba(229,62,62,0.08)',
            border: '1px solid rgba(229,62,62,0.5)',
            padding: '10px 12px',
            fontFamily: 'var(--mono)', fontSize: 11,
            color: 'var(--red)',
            lineHeight: 1.5,
          }}>
            ⚠ THIS WILL REPLACE ALL CURRENT BREWLAB DATA on this device.<br />
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
              Supabase credentials will be cleared so the restored data stays
              local until you reconnect from Settings → Connection. Other
              devices syncing to the same Supabase project are not affected
              until you Push.
            </span>
          </div>
        </div>

        <div className="modal-footer">
          {!armed ? (
            <>
              <button className="btn" onClick={onCancel}>Cancel</button>
              <button
                className="btn primary"
                onClick={() => setArmed(true)}
                style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
              >Restore…</button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => setArmed(false)}>Back</button>
              <button
                className="btn primary"
                onClick={onConfirm}
                style={{ background: 'var(--red)', borderColor: 'var(--red)', color: 'var(--bg)' }}
              >Confirm — Wipe &amp; Replace</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
