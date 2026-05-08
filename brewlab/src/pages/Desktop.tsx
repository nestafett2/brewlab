import { useState, useRef, useEffect } from 'react';
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
import FolderPreview from '../components/recipe/FolderPreview';
import FolderTree from '../components/recipe/FolderTree';
import BeerGlassIcon from '../components/recipe/BeerGlassIcon';
import { ebcToHex } from '../lib/ebcColor';
import UndoButton from '../components/shared/UndoButton';
import type { Folder } from '../types';

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
  // (effectiveTrubLossL + its store subscriptions moved into RecipeTab
  // when the equipment-derived pill strip moved out of the meta bar.)
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
          {/* Classification + Equipment moved to ActionStack's Setup
              section (Ingredients sub-tab only). The Tax tab and NTA
              Submitter still surface their own classification pickers,
              all routed through the canonical setRecipeClassification
              action — so cross-tab consistency is preserved. */}
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center' }}>
            {/* Tax Batch # — first in the right-aligned group, before
                Brew Date. Editable text input; brewery-wide unique
                constraint enforced on the Supabase side (see recipeToRow
                tax_batch comment). */}
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
            {/* Beer-glass icon — flat fill from current EBC. Empty/zero
                EBC falls back to the lightest ramp endpoint per ebcToHex.
                Size bump (~50 px) — meta-bar focal element. */}
            <BeerGlassIcon
              size={50}
              fill={ebcToHex(selectedRecipeForMeta.ebc)}
              title={`Color: ${selectedRecipeForMeta.ebc > 0 ? selectedRecipeForMeta.ebc.toFixed(1) + ' EBC' : '—'}`}
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
              <div style={{ width: 220, background: 'var(--panel)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
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
                    setPreview={(sel) => {
                      if (sel && sidebarTab === 'explorer') setSidebarTab('overview');
                      setPreview(sel);
                    }}
                    setFolders={setFolders}
                    setRecipes={setRecipes}
                    openRecipe={(id) => { setPreview(null); openRecipe(id); }}
                    onRecipeContext={handleRecipeContext}
                    onFolderContext={handleFolderContext}
                    onBulkContext={handleBulkContext}
                    onBlankContext={handleBlankContext}
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
