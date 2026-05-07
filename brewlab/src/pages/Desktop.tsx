import { useState, useRef, useEffect, useMemo } from 'react';
import { useStore, type RecipeDeleteSnapshot } from '../store';
import { calcEffectiveTrubLossL } from '../lib/calculations';
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
import RecipePreview from '../components/recipe/RecipePreview';
import FolderPreview from '../components/recipe/FolderPreview';
import FolderTree from '../components/recipe/FolderTree';
import UndoButton from '../components/shared/UndoButton';
import type { Folder } from '../types';

export type RecipeSubTab = 'ingredients' | 'brewday' | 'ferm' | 'cold' | 'tax'
  | 'taxsummary' | 'analysis' | 'water' | 'history' | 'checklist';

export default function Desktop() {
  const {
    activeTab, tabVisibility, setActiveTab,
    recipes, selectedRecipeId, selectRecipe, updateRecipe,
    setTabVisibility, setRecipeClassification, setSettingsSection,
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
  // Pulled separately so the meta-bar can compute effective trub loss
  // (= base + whirlpool/boil hop absorption) without going through a tab
  // component. Mirrors the BrewDayTab / WaterTab pattern.
  const ingredientsByRecipe = useStore(s => s.ingredientsByRecipe);
  const hopLib              = useStore(s => s.hopLib);
  const equipProfiles       = useStore(s => s.equipProfiles);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Track which recipes have open tabs (like the HTML app's recipe-tabs-container)
  const [openRecipeTabs, setOpenRecipeTabs] = useState<string[]>([]);
  // Left-sidebar organization mode. 'overview' is no longer a value
  // here — the Overview button now clears the preview rather than
  // switching a sidebar layout (see button wiring + right-pane swap
  // below). 'byStyle' rendering isn't ported yet; the button just
  // toggles state until that lands.
  const [recipeListView, setRecipeListView] = useState<'folders' | 'byStyle'>('folders');
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

  // Close on outside-mousedown / Escape, matching the ingredient-row
  // pattern in RecipeTab.tsx. One effect covers all three menus.
  useEffect(() => {
    if (!recipeCtxMenu && !folderCtxMenu && !bulkCtxMenu) return;
    const close = () => { setRecipeCtxMenu(null); setFolderCtxMenu(null); setBulkCtxMenu(null); };
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
  }, [recipeCtxMenu, folderCtxMenu, bulkCtxMenu]);

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
      window.alert('No folders defined yet.');
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
    if (!window.confirm(`Delete folder "${folder.name}"? Recipes inside will become unfiled.`)) return;
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
      alert('No folders defined yet.');
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

  // Effective trub loss for the meta-bar pills. Single source of truth in
  // lib/calculations → calcEffectiveTrubLossL. Returns base trub loss (40 L
  // default or active equipment-profile value) plus hot-side hop absorption.
  // Equipment selection comes from recipeProfilesByRecipe[recipeId].equip —
  // matches BrewDayTab.activeEquip's fallback chain (selection → first
  // profile → null) so the meta-bar's "Expected loss" / "Batch into WP"
  // pills track the same profile Brew Day is using.
  const recipeProfilesByRecipe = useStore(s => s.recipeProfilesByRecipe);
  const effectiveTrubLossL = useMemo(() => {
    if (!activeRecipeId) return 0;
    const ings = ingredientsByRecipe[activeRecipeId] ?? [];
    const equipId = recipeProfilesByRecipe[activeRecipeId]?.equip;
    const activeEquip =
      (equipId ? equipProfiles.find(p => p.id === equipId) : null)
      ?? equipProfiles[0]
      ?? null;
    return calcEffectiveTrubLossL(ings, hopLib, activeEquip);
  }, [activeRecipeId, ingredientsByRecipe, hopLib, equipProfiles, recipeProfilesByRecipe]);

  // Derived: current sub-tab for the active recipe (default 'ingredients').
  const recipeSubTab: RecipeSubTab = activeRecipeId
    ? (subTabByRecipe[activeRecipeId] ?? 'ingredients')
    : 'ingredients';
  const setRecipeSubTab = (t: RecipeSubTab) => {
    if (!activeRecipeId) return;
    setSubTabByRecipe(prev => ({ ...prev, [activeRecipeId]: t }));
  };

  return (
    <div className="desktop-layout">
      {/* ═══ Menu Bar ═══ */}
      <header className="menu-bar" ref={menuRef}>
        <div className="title-logo">BREWLAB</div>
        <div className={`menu-item ${openMenu === 'file' ? 'open' : ''}`} onClick={() => toggleMenu('file')}>
          File
          <div className={`menu-dropdown ${openMenu === 'file' ? 'open' : ''}`}>
            <div className="menu-dd-item" onClick={closeMenus}>Import Recipe (BeerXML)</div>
            <div className="menu-dd-sep" />
            <div className="menu-dd-item" onClick={closeMenus}>Save Recipe</div>
            <div className="menu-dd-item" onClick={closeMenus}>Scale Recipe...</div>
            <div className="menu-dd-sep" />
            <div className="menu-dd-item" onClick={closeMenus}>Export Recipe (BeerXML)</div>
            <div className="menu-dd-item" onClick={closeMenus}>Export Selected...</div>
            <div className="menu-dd-sep" />
            <div className="menu-dd-item" onClick={closeMenus}>Save as New Version</div>
            <div
              className="menu-dd-item"
              onClick={() => {
                closeMenus();
                if (!activeRecipeId) { alert('No recipe open.'); return; }
                setSaveTemplateModalOpen(true);
              }}
            >Save as Template</div>
            <div className="menu-dd-item" onClick={closeMenus}>Version...</div>
            <div className="menu-dd-item" onClick={closeMenus}>Lock Recipe</div>
            <div className="menu-dd-sep" />
            <div className="menu-dd-item" onClick={closeMenus}>Export All Data (backup)</div>
            <div className="menu-dd-item" onClick={closeMenus}>Import Backup</div>
            <div className="menu-dd-sep" />
            <div className="menu-dd-item" onClick={closeMenus}>Export for Sharing...</div>
          </div>
        </div>
        <div className={`menu-item ${openMenu === 'view' ? 'open' : ''}`} onClick={() => toggleMenu('view')}>
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
        <div className={`menu-item ${openMenu === 'libraries' ? 'open' : ''}`} onClick={() => toggleMenu('libraries')}>
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
        <div className={`menu-item ${openMenu === 'settings' ? 'open' : ''}`} onClick={() => toggleMenu('settings')}>
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

      {/* ═══ Sub-tabs — shown only when a recipe tab is active ═══ */}
      {isRecipeOpen && (
        <div className="tabbar" style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)', padding: '0 16px', justifyContent: 'center' }}>
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
            >
              {label}
            </div>
          ))}
        </div>
      )}

      {/* ═══ Recipe Meta Bar — shown only when a recipe tab is active ═══ */}
      {isRecipeOpen && selectedRecipeForMeta && (
        <div className="recipe-meta-bar">
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
          </div>
          <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0, margin: '0 4px' }} />
          {/* Tax Batch # — left side, right after the recipe-name block.
              Editable text input; brewery-wide unique constraint enforced
              on the Supabase side (see recipeToRow tax_batch comment). */}
          <div className="meta-pill" style={{ minWidth: 64, flexShrink: 0 }}>
            <div className="meta-pill-label">Tax Batch #</div>
            <input
              className="meta-pill-input"
              type="text"
              value={selectedRecipeForMeta.taxBatch || ''}
              onChange={e => updateRecipe(selectedRecipeForMeta.id, { taxBatch: e.target.value })}
              style={{ width: 48 }}
              placeholder="—"
              title="Brewery-wide manual NTA tax serial (e.g. 384). Brewery-wide unique."
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--panel2)', padding: '4px 10px', borderRadius: 6, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {/* Classification flows through the canonical setRecipeClassification
                action so it stays in sync with the Tax tab and tax record fields
                (HTML syncClassification, line 12120). */}
            <select
              value={selectedRecipeForMeta.classification || 'Beer'}
              onChange={e => setRecipeClassification(selectedRecipeForMeta.id, e.target.value as 'Beer' | 'Happoshu')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 12, fontWeight: 500, outline: 'none', cursor: 'pointer', padding: 0 }}
            >
              <option>Beer</option>
              <option>Happoshu</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center' }}>
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
            {/* Brew # — read-only display of the per-lineage counter.
                Set automatically by createNextRecipeFromCurrent (next-in-
                lineage) or by the from-scratch creation paths (=1 for a
                fresh lineage). No user typing — value is monotonic. Em-dash
                only when brewNumber is null (legacy rows pre-recompute). */}
            <div className="meta-pill" style={{ minWidth: 56 }} title="Per-lineage brew counter. Set automatically when a new brew is created.">
              <div className="meta-pill-label">Brew #</div>
              <div className="meta-pill-val" style={{ fontSize: 12 }}>
                {selectedRecipeForMeta.brewNumber != null ? `#${selectedRecipeForMeta.brewNumber}` : '—'}
              </div>
            </div>
            <button className="btn primary" style={{ flexShrink: 0, marginLeft: 8 }}>Save</button>
          </div>
        </div>
      )}

      {/* ═══ Profiles / Setup Row — Ingredients sub-tab only ═══
           Hosts the Equipment selector + the recipe-design pills (Batch into
           FV/WP, Expected Loss, Boil, BH Eff, WP Temp). Recipe-design
           parameters; separate from the identity/version meta-bar above.
           Water and Pitch/O₂ pickers are NOT in this row — they live
           solely on the Water tab and Brew Day tab respectively, where
           they're contextual. The ProfileSelect helper now supports
           kind='equip' only (the others are owned by their tabs).

           Layout: Equipment is absolutely-positioned at the row's left
           edge (flush against the window border) so it stays anchored
           independently of the pill group. The pill group lives in a
           constrained wrapper (sidebar offset 188px + maxWidth 1000px +
           16px inner padding) that matches the ingredient-cards container
           in RecipeTab.tsx:259–260, so the pills' centre aligns with the
           card centre at any viewport width. The wrapper is the row's
           sole layout child — Equipment overlays it via absolute
           positioning and does not affect pill centring. */}
      {isRecipeOpen && activeRecipeId && selectedRecipeForMeta && recipeSubTab === 'ingredients' && (
        <div style={{ position: 'relative', minHeight: 56, background: 'var(--panel2)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {/* Equipment — absolute, anchored to the row's far-left edge. */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center', zIndex: 1 }}>
            <ProfileSelect kind="equip" label="Equipment" recipeId={activeRecipeId} />
          </div>
          {/* Centred wrapper matching the ingredient-cards container bounds. */}
          <div style={{ paddingLeft: 188 }}>
            <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 16px', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="meta-pill">
            <div className="meta-pill-label">Batch into FV</div>
            <div className="meta-pill-val">
              <input className="meta-pill-input" type="text" value={selectedRecipeForMeta.batchL || ''} onChange={e => updateRecipe(selectedRecipeForMeta.id, { batchL: parseFloat(e.target.value) || 0 })} style={{ width: 44 }} />
              <span className="meta-pill-unit">L</span>
            </div>
          </div>
          {/* Batch into WP = into-FV target + effective trub loss (base trub
              + hot-side hop absorption). Recomputes whenever ingredients or
              batchL change. Read-only — derived from recipe + ingredients. */}
          <div className="meta-pill" title="Total volume needed in the kettle for whirlpool. Equals Batch into FV + expected losses (base trub + whirlpool/boil hop absorption).">
            <div className="meta-pill-label">Batch into WP</div>
            <div className="meta-pill-val">
              <span className="meta-pill-input" style={{ width: 44, display: 'inline-block', textAlign: 'left' }}>
                {selectedRecipeForMeta.batchL > 0 ? ((selectedRecipeForMeta.batchL || 0) + effectiveTrubLossL).toFixed(1) : '—'}
              </span>
              <span className="meta-pill-unit">L</span>
            </div>
          </div>
          <div className="meta-pill" title="Effective trub loss = equipment-profile base trub loss + hot-side hop absorption (whirlpool at 6 L/kg, boil/flameout/first-wort at pellet 1.0 L/kg or whole 3.0 L/kg).">
            <div className="meta-pill-label">Expected loss</div>
            <div className="meta-pill-val">
              <span className="meta-pill-input" style={{ width: 44, display: 'inline-block', textAlign: 'left' }}>
                {effectiveTrubLossL > 0 ? effectiveTrubLossL.toFixed(1) : '—'}
              </span>
              <span className="meta-pill-unit">L</span>
            </div>
          </div>
          <div className="meta-pill">
            <div className="meta-pill-label">Boil</div>
            <div className="meta-pill-val">
              <input className="meta-pill-input" type="text" value={selectedRecipeForMeta.boilTime ?? 45} onChange={e => updateRecipe(selectedRecipeForMeta.id, { boilTime: parseFloat(e.target.value) || 0 })} style={{ width: 32 }} />
              <span className="meta-pill-unit">min</span>
            </div>
          </div>
          <div className="meta-pill">
            <div className="meta-pill-label">BH Eff</div>
            <div className="meta-pill-val">
              <input className="meta-pill-input" type="text" value={selectedRecipeForMeta.bhEff ?? 67.60} onChange={e => updateRecipe(selectedRecipeForMeta.id, { bhEff: parseFloat(e.target.value) || 0 })} style={{ width: 44 }} />
              <span className="meta-pill-unit">%</span>
            </div>
          </div>
          <div className="meta-pill">
            <div className="meta-pill-label">WP Temp</div>
            <div className="meta-pill-val">
              <input className="meta-pill-input" type="text" value={selectedRecipeForMeta.whirlpoolTemp ?? 85} onChange={e => updateRecipe(selectedRecipeForMeta.id, { whirlpoolTemp: parseFloat(e.target.value) || 0 })} style={{ width: 32 }} />
              <span className="meta-pill-unit">°C</span>
            </div>
          </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Main Content Area ═══ */}
      <div className="global-layout">
        <div className="main-content">

          {/* page-recipes: recipe browser (left 220px) + preview (right) */}
          {activeTab === 'recipes' && (
            <div className="page page-row">
              {/* Left: folder tree + recipe list */}
              <div style={{ width: 220, background: 'var(--panel)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                <div style={{ background: 'var(--panel2)', borderBottom: '1px solid var(--border)', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 2, color: 'var(--amber)' }}>RECIPES</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <button className="btn sm" onClick={() => setNewRecipeModalCtx({ folderId: null })}>＋ New</button>
                    <button className="btn sm" onClick={handleNewFolder}>📁 Folder</button>
                  </div>
                </div>
                <div className="rb-toolbar" style={{ padding: '6px 8px' }}>
                  {/* Overview: clears the preview so the right pane returns
                      to the BreweryOverviewPanel dashboard. Active when
                      no preview is selected (the dashboard is showing). */}
                  <button
                    className={`rb-view-btn ${preview === null ? 'active' : ''}`}
                    onClick={() => setPreview(null)}
                  >
                    Overview
                  </button>
                  {/* Folders / By Style: left-sidebar organization only —
                      they don't touch the right pane or the preview. */}
                  <button
                    className={`rb-view-btn ${recipeListView === 'folders' ? 'active' : ''}`}
                    onClick={() => setRecipeListView('folders')}
                  >
                    Folders
                  </button>
                  <button
                    className={`rb-view-btn ${recipeListView === 'byStyle' ? 'active' : ''}`}
                    onClick={() => setRecipeListView('byStyle')}
                  >
                    By Style
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <FolderTree
                    folders={folders}
                    recipes={recipes}
                    preview={preview}
                    setPreview={setPreview}
                    setFolders={setFolders}
                    setRecipes={setRecipes}
                    openRecipe={(id) => { setPreview(null); openRecipe(id); }}
                    onRecipeContext={handleRecipeContext}
                    onFolderContext={handleFolderContext}
                    onBulkContext={handleBulkContext}
                  />
                </div>
                <div className="rb-new-folder-btn" onClick={handleNewFolder} role="button">＋ New Folder</div>
              </div>
              {/* Right pane swap — preview takes precedence; no preview
                  falls back to the BreweryOverviewPanel as the default
                  dashboard. The Overview sub-tab button is just a
                  shortcut that clears the preview. */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
                {(() => {
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
                  // Default dashboard — no preview selected, or the
                  // previewed item was deleted (cleared by the stale-
                  // preview useEffect above).
                  return <BreweryOverviewPanel onOpenRecipe={openRecipe} />;
                })()}
              </div>
            </div>
          )}

          {/* page-recipe: sidebar (188px) + content — shown when any recipe tab is active */}
          {isRecipeOpen && activeRecipeId && recipeSubTab === 'ingredients' && (
            <RecipeTab recipeId={activeRecipeId} />
          )}
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

function ProfileSelect({
  kind, label, recipeId,
}: {
  kind: 'equip';
  label: string;
  recipeId: string;
}) {
  const equipProfiles = useStore(s => s.equipProfiles);
  const selections    = useStore(s => s.recipeProfilesByRecipe[recipeId]);
  const getRecipeProfiles    = useStore(s => s.getRecipeProfiles);
  const setRecipeProfileKind = useStore(s => s.setRecipeProfileKind);

  // Lazy-prime the cache on first render for this recipe (matches the
  // ingredients/tax-record pattern). Subsequent renders read from `selections`.
  useEffect(() => {
    if (selections === undefined) getRecipeProfiles(recipeId);
  }, [selections, recipeId, getRecipeProfiles]);

  const list = equipProfiles;
  const current = (selections ?? {})[kind] ?? '';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{label}</span>
      <select
        value={current}
        onChange={e => setRecipeProfileKind(recipeId, kind, e.target.value)}
        style={{ background: 'var(--panel)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11, padding: '3px 7px', outline: 'none', borderRadius: 3, maxWidth: 160 }}
      >
        <option value="">— none —</option>
        {list.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  );
}
