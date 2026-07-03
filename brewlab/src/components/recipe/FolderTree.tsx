/**
 * Recipe-browser sidebar tree — port of brewlab-desktop.html
 * renderRBFolderLevel (line 4346) + makeRbItem (line 4458) +
 * selectFolder (line 4392).
 *
 * Recursive folder/recipe tree:
 *   • Each folder header has a ▶ arrow that rotates to ▼ when open
 *   • Click toggles open AND sets the folder as the previewed item
 *     (HTML conflates these — every click previews regardless of open state)
 *   • Children indented by depth * 12px
 *   • Inside an open folder: subfolders first, then direct recipes
 *   • Recipes: single-click → preview, double-click → open
 *   • Folder count shows total descendant recipes (recursive)
 *   • Root-level "Unfiled" section for recipes whose `folder` doesn't
 *     match any folder.id
 *
 * Open state lives on `folder.open` and persists via `setFolders`
 * (matches HTML which mutates folder.open then writes the array
 * back to bl_folder_list).
 *
 * Performance — Ben's data has ~540 recipes; pre-computes child and
 * recipe lookups + descendant counts once per render via memos so
 * nothing scans the full lists per node.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Recipe, Folder } from '../../types';
import { formatRecipeStyleLine } from '../../lib/utils';

// ── Drag/drop types (PART 2) ─────────────────────────────────────────
type DragSource =
  | { kind: 'recipe'; ids: string[] }   // single OR multi (PART 4)
  | { kind: 'folder'; id: string };

type DropTarget =
  | { kind: 'folder'; id: string; mode: 'before' | 'into' | 'after' }
  | { kind: 'recipe'; id: string; mode: 'before' | 'after' }
  | { kind: 'root' };

const HOVER_OPEN_MS = 800;

/** Move a set of recipes to a target folder, splicing them into the
 *  global array at a specified position. Preserves the dragged group's
 *  relative order. `pos` is either 'end' (append after every other
 *  recipe in the array) or { beforeId, mode } where the group is
 *  inserted before/after that id in the post-removal array. */
function applyRecipeMove(
  recipes: Recipe[],
  draggedIds: string[],
  targetFolder: string,
  pos: 'end' | { beforeId: string; mode: 'before' | 'after' },
): Recipe[] {
  const draggedSet = new Set(draggedIds);
  // Collect dragged recipes in their existing global-array order so the
  // group stays internally consistent.
  const moved = recipes
    .filter(r => draggedSet.has(r.id))
    .map(r => ({ ...r, folder: targetFolder }));
  const without = recipes.filter(r => !draggedSet.has(r.id));
  if (pos === 'end') return [...without, ...moved];
  let toIdx = without.findIndex(r => r.id === pos.beforeId);
  if (toIdx === -1) return [...without, ...moved];
  if (pos.mode === 'after') toIdx += 1;
  return [...without.slice(0, toIdx), ...moved, ...without.slice(toIdx)];
}

/** Build a small canvas as the dataTransfer drag image when multi-
 *  dragging. Single-row drags use the default browser-rendered image
 *  of the row itself. */
function buildMultiDragImage(count: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const w = 110, h = 26;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = 'rgba(255, 159, 10, 0.95)';
  ctx.beginPath();
  // Inline rounded-rect — roundRect isn't universally available.
  const r = 4;
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.fill();
  ctx.fillStyle = '#1c1c1e';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${count} recipes`, w / 2, h / 2);
  return canvas;
}

function sameDropTarget(a: DropTarget, b: DropTarget): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'root' || b.kind === 'root') return a.kind === b.kind;
  // After the kind-equal check, TS still needs a discriminant narrowing
  // to know `a` and `b` aren't the 'root' case. Cast through any-kind
  // mode field — both folder and recipe variants have id+mode.
  const aa = a as { id: string; mode: string };
  const bb = b as { id: string; mode: string };
  return aa.id === bb.id && aa.mode === bb.mode;
}

export type PreviewSelection = { kind: 'recipe' | 'folder'; id: string } | null;

interface Props {
  folders: Folder[];
  recipes: Recipe[];
  preview: PreviewSelection;
  setPreview: (sel: PreviewSelection) => void;
  setFolders: (folders: Folder[]) => void;
  /** Used by drag-drop to persist a moved recipe's `folder` field
   *  (PART 1 — recipe → folder drag). */
  setRecipes: (recipes: Recipe[]) => void;
  openRecipe: (recipeId: string) => void;
  onRecipeContext: (e: React.MouseEvent, recipeId: string) => void;
  onFolderContext: (e: React.MouseEvent, folderId: string) => void;
  /** Right-click on a selected row when selection.size > 1 — Desktop
   *  shows the bulk menu. Single-row right-click goes through
   *  onRecipeContext after clearing selection. */
  onBulkContext: (e: React.MouseEvent, ids: string[]) => void;
  /** Right-click on the tree wrapper but not on any folder/recipe row —
   *  Desktop shows the "+ New Folder" blank-area menu. Optional; when
   *  omitted the wrapper falls back to the browser's default menu. */
  onBlankContext?: (e: React.MouseEvent) => void;
  /** Recipe id whose floating preview popover is currently open. Drives
   *  an additional row-highlight tier so the user can see which row the
   *  open popover corresponds to. */
  popoverId?: string | null;
  /** Optional out-channel for the current multi-selection. Desktop's
   *  File → Export Selected... reads `selectionRef.current()` at click
   *  time instead of lifting selectedIds into state (which would
   *  re-render Desktop on every row click). */
  selectionRef?: React.MutableRefObject<() => string[]>;
}

export default function FolderTree({
  folders, recipes, preview, setPreview, setFolders, setRecipes,
  openRecipe, onRecipeContext, onFolderContext, onBulkContext, onBlankContext,
  popoverId, selectionRef,
}: Props) {
  // ── Multi-select state (PART 4) ─────────────────────────────────────
  // selectedIds is the set of recipe ids that are checked. anchorId is
  // the last clicked row, used as the start of shift-range selection.
  // selectedIdsRef mirrors the state for sync access from drag handlers
  // (which fire async via dragstart and need the latest selection).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => {
    if (selectionRef) selectionRef.current = () => [...selectedIds];
  }, [selectedIds, selectionRef]);
  // ── Drag/drop state ─────────────────────────────────────────────────
  // dragRef carries what's being dragged (recipe or folder); kept in a
  // ref so dragover handlers don't re-render. dropTarget drives visual
  // feedback — that one IS state. The pendingDropTargetRef + rafIdRef
  // pair throttles dragover updates to one per animation frame
  // (caveat: with 540 recipes, raw dragover at every pixel can choke).
  const dragRef = useRef<DragSource | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const pendingDropTargetRef = useRef<DropTarget | null>(null);
  const rafIdRef = useRef<number | null>(null);
  // Hover-to-open: when dragging "into" a closed folder for HOVER_OPEN_MS,
  // auto-open it so the user can drill into nested folders mid-drag.
  const hoverOpenTimerRef = useRef<{ folderId: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  // Cycle-prevention scratchpad — set on folder dragstart, holds the
  // dragged folder + all its descendants so dragover can reject drops
  // onto them in O(1).
  const bannedDropTargetsRef = useRef<Set<string>>(new Set());
  // Refs to read latest folders/recipes from async callbacks
  // (hover-open timer, drop handler) without stale closures.
  const foldersRef = useRef(folders);
  const recipesRef = useRef(recipes);
  useEffect(() => { foldersRef.current = folders; }, [folders]);
  useEffect(() => { recipesRef.current = recipes; }, [recipes]);
  // ── Pre-compute lookups (one pass each per data change) ─────────────
  const childrenByParent = useMemo(() => {
    const m = new Map<string | null, Folder[]>();
    for (const f of folders) {
      const list = m.get(f.parentId) ?? [];
      list.push(f);
      m.set(f.parentId, list);
    }
    return m;
  }, [folders]);

  const recipesByFolder = useMemo(() => {
    const m = new Map<string, Recipe[]>();
    for (const r of recipes) {
      const list = m.get(r.folder) ?? [];
      list.push(r);
      m.set(r.folder, list);
    }
    return m;
  }, [recipes]);

  /** Total recipes in folder + all descendants. Memoized via a single
   *  recursive walk that visits each folder once. Mirrors HTML
   *  countFolderRecipes (line 4337) but avoids the O(F²) re-scan. */
  const descendantCount = useMemo(() => {
    const m = new Map<string, number>();
    const visit = (id: string): number => {
      const cached = m.get(id);
      if (cached !== undefined) return cached;
      let n = recipesByFolder.get(id)?.length ?? 0;
      for (const sub of childrenByParent.get(id) ?? []) n += visit(sub.id);
      m.set(id, n);
      return n;
    };
    for (const f of folders) visit(f.id);
    return m;
  }, [folders, childrenByParent, recipesByFolder]);

  /** Recipes pointing at a non-existent folder id (or empty/null) — the
   *  "Unfiled" bucket. Same logic as HTML line 4382. */
  const unfiledRecipes = useMemo(() => {
    const ids = new Set(folders.map(f => f.id));
    return recipes.filter(r => !ids.has(r.folder));
  }, [folders, recipes]);

  /** Recipes in render order (depth-first walk, only descending into
   *  open folders, then Unfiled at the end). Used as the index space
   *  for shift-range selection. Recomputed when the tree shape changes. */
  const flattenedRecipes = useMemo(() => {
    const out: string[] = [];
    const visit = (parentId: string | null) => {
      for (const f of childrenByParent.get(parentId) ?? []) {
        if (f.open) {
          visit(f.id);
          for (const r of recipesByFolder.get(f.id) ?? []) out.push(r.id);
        }
      }
    };
    visit(null);
    for (const r of unfiledRecipes) out.push(r.id);
    return out;
  }, [childrenByParent, recipesByFolder, unfiledRecipes]);

  // ── Recipe row click — file-explorer convention (PART 4) ────────────
  const handleRecipeClick = (recipeId: string, e: React.MouseEvent) => {
    e.stopPropagation();   // don't bubble to wrapper-clear-selection
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    if (shift && anchorId) {
      // Range select: anchor → clicked. Replaces selection unless Ctrl is also held.
      const fromIdx = flattenedRecipes.indexOf(anchorId);
      const toIdx = flattenedRecipes.indexOf(recipeId);
      if (fromIdx >= 0 && toIdx >= 0) {
        const [lo, hi] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
        const range = flattenedRecipes.slice(lo, hi + 1);
        setSelectedIds(prev => ctrl ? new Set([...prev, ...range]) : new Set(range));
      }
      // Plain shift updates preview to the clicked row; Ctrl+Shift leaves it alone.
      if (!ctrl) setPreview({ kind: 'recipe', id: recipeId });
      // Don't move anchor on shift — that's the file-explorer convention.
      return;
    }
    if (ctrl) {
      // Toggle membership; preview stays put.
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(recipeId)) next.delete(recipeId); else next.add(recipeId);
        return next;
      });
      setAnchorId(recipeId);
      return;
    }
    // Plain click — replace selection, set preview, set anchor.
    setSelectedIds(new Set([recipeId]));
    setAnchorId(recipeId);
    setPreview({ kind: 'recipe', id: recipeId });
  };

  // Right-click semantics (Pattern A — file-explorer):
  //   • Selected & multi  → bulk menu, selection unchanged
  //   • Otherwise         → replace selection with {id}, single menu
  // stopPropagation so the wrapper's blank-area context menu doesn't
  // also fire on row right-clicks.
  const handleRecipeContextMenu = (recipeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedIds.has(recipeId) && selectedIds.size > 1) {
      onBulkContext(e, [...selectedIds]);
      return;
    }
    setSelectedIds(new Set([recipeId]));
    setAnchorId(recipeId);
    onRecipeContext(e, recipeId);
  };

  // Folder row right-click — same stopPropagation rationale as recipe
  // rows above. The forwarded handler still gets called.
  const handleFolderContextMenu = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onFolderContext(e, folderId);
  };

  // Wrapper-level click — clear selection on empty-space click.
  const handleWrapperClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;   // bubbled from a row → ignore
    setSelectedIds(new Set());
    setAnchorId(null);
  };

  // ── Toggle open state on the folder + persist via setFolders ────────
  const toggleOpen = (folderId: string) => {
    setFolders(folders.map(f => f.id === folderId ? { ...f, open: !f.open } : f));
  };

  const handleFolderClick = (folderId: string) => {
    // HTML selectFolder does all three on every click.
    toggleOpen(folderId);
    setPreview({ kind: 'folder', id: folderId });
  };

  // ── Drag/drop helpers ────────────────────────────────────────────────

  /** Hit-test the cursor against a folder header's bounding rect.
   *  Top 25% = before, middle 50% = into, bottom 25% = after. Recipe
   *  drags get coerced to 'into' regardless of zone (recipes only nest
   *  into folders; before/after a folder is meaningless for them). */
  const hitTestFolder = (
    rect: DOMRect, clientY: number, dragKind: 'recipe' | 'folder',
  ): 'before' | 'into' | 'after' => {
    if (dragKind === 'recipe') return 'into';
    const rel = (clientY - rect.top) / rect.height;
    if (rel < 0.25) return 'before';
    if (rel > 0.75) return 'after';
    return 'into';
  };

  /** Hit-test against a recipe row. Top half = before, bottom half = after. */
  const hitTestRecipe = (rect: DOMRect, clientY: number): 'before' | 'after' =>
    (clientY - rect.top) / rect.height < 0.5 ? 'before' : 'after';

  /** Throttle setDropTarget to once per animation frame. Native
   *  dragover fires at every pixel of mouse movement; 540 rows + per-
   *  pixel React state updates would lag the cursor on the deeper
   *  parts of the tree. */
  const scheduleDropTarget = (next: DropTarget | null) => {
    pendingDropTargetRef.current = next;
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      // Only set if it actually changed (object identity check is cheap
      // here; React's setter does Object.is internally too).
      setDropTarget(prev => {
        const p = pendingDropTargetRef.current;
        if (prev === p) return prev;
        if (prev && p && sameDropTarget(prev, p)) return prev;
        return p;
      });
    });
  };

  /** Cancel any scheduled hover-open timer. Called on dragend, on drop,
   *  and whenever the drop target changes to a different folder. */
  const cancelHoverOpen = () => {
    if (hoverOpenTimerRef.current) {
      clearTimeout(hoverOpenTimerRef.current.timer);
      hoverOpenTimerRef.current = null;
    }
  };

  /** Schedule auto-open of a closed folder after HOVER_OPEN_MS of
   *  hovering "into" it. Uses foldersRef for the latest array since
   *  this fires async — a stale closure would clobber edits made
   *  during the hover. */
  const scheduleHoverOpen = (folderId: string) => {
    if (hoverOpenTimerRef.current?.folderId === folderId) return;
    cancelHoverOpen();
    const timer = setTimeout(() => {
      const next = foldersRef.current.map(f =>
        f.id === folderId ? { ...f, open: true } : f,
      );
      setFolders(next);
      hoverOpenTimerRef.current = null;
    }, HOVER_OPEN_MS);
    hoverOpenTimerRef.current = { folderId, timer };
  };

  /** Clean up all drag bookkeeping. Called from dragend AND drop so
   *  the state can't leak between drags. */
  const endDrag = () => {
    dragRef.current = null;
    bannedDropTargetsRef.current = new Set();
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    pendingDropTargetRef.current = null;
    cancelHoverOpen();
    setDropTarget(null);
  };

  // Cleanup on unmount — guards against a drag-in-flight when the
  // component unmounts (e.g. user navigates away mid-drag).
  useEffect(() => () => {
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    if (hoverOpenTimerRef.current) clearTimeout(hoverOpenTimerRef.current.timer);
  }, []);

  // ── Recipe row drag handlers ────────────────────────────────────────
  // Multi-drag: if the row is in the current selection, drag all
  // selected. If not, replace selection with this row and drag single.
  const handleRecipeDragStart = (recipeId: string, e: React.DragEvent) => {
    const sel = selectedIdsRef.current;
    let ids: string[];
    if (sel.has(recipeId) && sel.size > 1) {
      ids = [...sel];
    } else {
      // Replace selection — standard convention (drag of unselected
      // implicitly clears multi-selection).
      ids = [recipeId];
      setSelectedIds(new Set([recipeId]));
      setAnchorId(recipeId);
    }
    dragRef.current = { kind: 'recipe', ids };
    e.dataTransfer.effectAllowed = 'move';
    (e.currentTarget as HTMLElement).style.opacity = '0.5';
    if (ids.length > 1) {
      const img = buildMultiDragImage(ids.length);
      // Canvas needs to be in the DOM for setDragImage to render it
      // reliably across browsers. Append off-screen and remove next tick.
      img.style.position = 'absolute';
      img.style.top = '-9999px';
      document.body.appendChild(img);
      e.dataTransfer.setDragImage(img, 10, 10);
      setTimeout(() => img.remove(), 0);
    }
  };
  const handleRecipeDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = '';
    endDrag();
  };

  // ── Folder row drag handlers (PART 2) ───────────────────────────────
  const handleFolderDragStart = (folderId: string, e: React.DragEvent) => {
    dragRef.current = { kind: 'folder', id: folderId };
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();   // don't let the inner draggable swallow it
    (e.currentTarget as HTMLElement).style.opacity = '0.5';
    // Precompute banned drop targets — folder + all descendants. Used
    // by dragover to reject cycle-creating drops in O(1).
    const banned = new Set<string>([folderId]);
    const visit = (id: string) => {
      for (const sub of childrenByParent.get(id) ?? []) {
        banned.add(sub.id);
        visit(sub.id);
      }
    };
    visit(folderId);
    bannedDropTargetsRef.current = banned;
  };
  const handleFolderDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = '';
    endDrag();
  };

  // ── Drop-target dragover (folder header) ────────────────────────────
  const handleFolderDragOver = (folderId: string, e: React.DragEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    // Cycle prevention — folder dragged onto itself or a descendant.
    if (drag.kind === 'folder' && bannedDropTargetsRef.current.has(folderId)) return;
    e.preventDefault();
    e.stopPropagation();   // prevent wrapper "root" handler from firing
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mode = hitTestFolder(rect, e.clientY, drag.kind);
    scheduleDropTarget({ kind: 'folder', id: folderId, mode });
    // Hover-to-open: only when mode === 'into' on a closed folder.
    const folder = foldersRef.current.find(f => f.id === folderId);
    if (mode === 'into' && folder && !folder.open) scheduleHoverOpen(folderId);
    else cancelHoverOpen();
  };

  // ── Drop-target dragover (recipe row) ───────────────────────────────
  const handleRecipeDragOver = (recipeId: string, e: React.DragEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.kind !== 'recipe') return;   // folders don't drop on recipes
    if (drag.ids.includes(recipeId)) return;       // self / within-set drop no-op
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mode = hitTestRecipe(rect, e.clientY);
    scheduleDropTarget({ kind: 'recipe', id: recipeId, mode });
  };

  // ── Wrapper-level dragover (root drop) ──────────────────────────────
  const handleRootDragOver = (e: React.DragEvent) => {
    if (!dragRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    scheduleDropTarget({ kind: 'root' });
    cancelHoverOpen();
  };

  // ── Drop handler — applies the move per current dropTarget mode ─────
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const drag = dragRef.current;
    const target = pendingDropTargetRef.current ?? dropTarget;
    endDrag();   // resets everything, including dropTarget
    if (!drag || !target) return;
    applyDrop(drag, target);
  };

  /** Mutate folders/recipes per the drop. All branches use
    *  foldersRef/recipesRef so we read the latest arrays even if drop
    *  fires after async updates. */
  const applyDrop = (drag: DragSource, target: DropTarget) => {
    const fs = foldersRef.current;
    const rs = recipesRef.current;

    if (drag.kind === 'recipe' && target.kind === 'folder' && target.mode === 'into') {
      // Move N recipes into folder: update folder field + splice to end
      // (preserving the dragged group's relative order).
      const next = applyRecipeMove(rs, drag.ids, target.id, 'end');
      setRecipes(next);
      const tgt = fs.find(f => f.id === target.id);
      if (tgt && !tgt.open) {
        setFolders(fs.map(f => f.id === target.id ? { ...f, open: true } : f));
      }
      return;
    }

    if (drag.kind === 'recipe' && target.kind === 'recipe') {
      // Reorder/move relative to a recipe — also moves to target.folder.
      const tgt = rs.find(r => r.id === target.id);
      if (!tgt) return;
      const next = applyRecipeMove(rs, drag.ids, tgt.folder, {
        beforeId: target.id,
        mode: target.mode,
      });
      setRecipes(next);
      return;
    }

    if (drag.kind === 'recipe' && target.kind === 'root') {
      // Move N to Unfiled. Splice to end of global recipes array.
      const next = applyRecipeMove(rs, drag.ids, '', 'end');
      setRecipes(next);
      return;
    }

    if (drag.kind === 'folder' && target.kind === 'folder' && target.mode === 'into') {
      // Make subfolder. Cycle was already rejected at dragover.
      const idx = fs.findIndex(f => f.id === drag.id);
      if (idx === -1) return;
      const moved = { ...fs[idx], parentId: target.id };
      const next = [...fs.slice(0, idx), ...fs.slice(idx + 1), moved];
      // Auto-open the target so the moved folder is visible.
      const finalFs = next.map(f => f.id === target.id ? { ...f, open: true } : f);
      setFolders(finalFs);
      return;
    }

    if (drag.kind === 'folder' && target.kind === 'folder') {
      // Reorder within target's parent.
      const tgt = fs.find(f => f.id === target.id);
      if (!tgt) return;
      const fromIdx = fs.findIndex(f => f.id === drag.id);
      if (fromIdx === -1) return;
      const without = fs.filter(f => f.id !== drag.id);
      let toIdx = without.findIndex(f => f.id === target.id);
      if (toIdx === -1) return;
      if (target.mode === 'after') toIdx += 1;
      const moved = { ...fs[fromIdx], parentId: tgt.parentId };
      const next = [...without.slice(0, toIdx), moved, ...without.slice(toIdx)];
      setFolders(next);
      return;
    }

    if (drag.kind === 'folder' && target.kind === 'root') {
      // Make top-level. Splice to end of folders array.
      const idx = fs.findIndex(f => f.id === drag.id);
      if (idx === -1) return;
      const moved = { ...fs[idx], parentId: null };
      const next = [...fs.slice(0, idx), ...fs.slice(idx + 1), moved];
      setFolders(next);
      return;
    }
  };

  // ── Recursive node renderer ─────────────────────────────────────────
  const renderNode = (folder: Folder, depth: number): React.ReactNode => {
    const indent = depth * 12;
    const isSelected = preview?.kind === 'folder' && preview.id === folder.id;
    const subs = childrenByParent.get(folder.id) ?? [];
    const directRecipes = recipesByFolder.get(folder.id) ?? [];
    const empty = subs.length === 0 && directRecipes.length === 0;

    // Drop-target visual state for this folder header. dropTarget can
    // refer to a folder/recipe/root; only mark this row when it's the
    // current folder target (one of three modes).
    const tgt = dropTarget?.kind === 'folder' && dropTarget.id === folder.id
      ? dropTarget.mode : null;
    const headerClass =
      `rb-folder-header${isSelected ? ' selected' : ''}` +
      (tgt === 'into'   ? ' drop-target'  : '') +
      (tgt === 'before' ? ' drop-before' : '') +
      (tgt === 'after'  ? ' drop-after'  : '');
    return (
      <div key={folder.id} className="rb-folder">
        <div
          className={headerClass}
          style={{ paddingLeft: 8 + indent }}
          draggable
          onClick={e => { e.stopPropagation(); handleFolderClick(folder.id); }}
          onContextMenu={e => handleFolderContextMenu(folder.id, e)}
          onDragStart={e => handleFolderDragStart(folder.id, e)}
          onDragEnd={handleFolderDragEnd}
          onDragOver={e => handleFolderDragOver(folder.id, e)}
          onDrop={handleDrop}
        >
          <span className={`rb-folder-arrow${folder.open ? ' open' : ''}`}>▶</span>
          <span className="rb-folder-icon">📁</span>
          <span className="rb-folder-name">{folder.name}</span>
          <span className="rb-folder-count">{descendantCount.get(folder.id) ?? 0}</span>
        </div>
        {folder.open && (
          <div className="rb-folder-body">
            {empty && (
              <div className="rb-folder-empty" style={{ paddingLeft: 22 + indent }}>Empty</div>
            )}
            {subs.map(sub => renderNode(sub, depth + 1))}
            {directRecipes.map(r => (
              <RecipeSidebarRow
                key={r.id}
                recipe={r}
                indentPx={(depth + 1) * 12}
                selected={(preview?.kind === 'recipe' && preview.id === r.id) || r.id === popoverId}
                multiSelected={selectedIds.has(r.id)}
                dropMode={dropTarget?.kind === 'recipe' && dropTarget.id === r.id ? dropTarget.mode : null}
                onClick={e => handleRecipeClick(r.id, e)}
                onOpen={() => openRecipe(r.id)}
                onContext={e => handleRecipeContextMenu(r.id, e)}
                onDragStart={e => handleRecipeDragStart(r.id, e)}
                onDragEnd={handleRecipeDragEnd}
                onDragOver={e => handleRecipeDragOver(r.id, e)}
                onDrop={handleDrop}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const rootFolders = childrenByParent.get(null) ?? [];
  const rootIsDropTarget = dropTarget?.kind === 'root';

  return (
    <div
      className={`rb-tree-root${rootIsDropTarget ? ' drop-root' : ''}`}
      onClick={handleWrapperClick}
      onContextMenu={e => {
        // Row-level handlers stopPropagation, so this only fires on
        // truly empty space. preventDefault so the OS menu doesn't appear.
        if (!onBlankContext) return;
        e.preventDefault();
        onBlankContext(e);
      }}
      onDragOver={handleRootDragOver}
      onDrop={handleDrop}
    >
      {rootFolders.map(f => renderNode(f, 0))}

      {/* Unfiled section — root-level only. Header doesn't toggle (no
          state to track) and doesn't preview (no folder to point at). */}
      {unfiledRecipes.length > 0 && (
        <div className="rb-folder">
          <div className="rb-folder-header rb-folder-header-static" style={{ paddingLeft: 8 }}>
            <span className="rb-folder-arrow rb-folder-arrow-spacer" />
            <span className="rb-folder-icon">📁</span>
            <span className="rb-folder-name">Unfiled</span>
            <span className="rb-folder-count">{unfiledRecipes.length}</span>
          </div>
          {unfiledRecipes.map(r => (
            <RecipeSidebarRow
              key={r.id}
              recipe={r}
              indentPx={12}
              selected={(preview?.kind === 'recipe' && preview.id === r.id) || r.id === popoverId}
              multiSelected={selectedIds.has(r.id)}
              dropMode={dropTarget?.kind === 'recipe' && dropTarget.id === r.id ? dropTarget.mode : null}
              onClick={e => handleRecipeClick(r.id, e)}
              onOpen={() => openRecipe(r.id)}
              onContext={e => handleRecipeContextMenu(r.id, e)}
              onDragStart={e => handleRecipeDragStart(r.id, e)}
              onDragEnd={handleRecipeDragEnd}
              onDragOver={e => handleRecipeDragOver(r.id, e)}
              onDrop={handleDrop}
            />
          ))}
        </div>
      )}

      {folders.length === 0 && unfiledRecipes.length === 0 && recipes.length === 0 && (
        <p className="empty">No recipes yet</p>
      )}
    </div>
  );
}

// ─── Recipe row ──────────────────────────────────────────────────────
//
// Three-line format: `#X beerName / style · vol / v1.x`. Single-click
// previews; double-click opens. `indentPx` overrides the CSS class's
// default left padding so rows align under their parent folder.

interface RecipeSidebarRowProps {
  recipe: Recipe;
  /** Selected for preview (single-blue-tint). */
  selected: boolean;
  /** Selected as part of a multi-select (amber border-left, distinct
   *  from the preview-target tint). */
  multiSelected: boolean;
  /** Visual mode when this row is the current drop target. Null when
   *  not the target — the standard before/after CSS classes only
   *  attach on a non-null value. */
  dropMode: 'before' | 'after' | null;
  indentPx: number;
  onClick: (e: React.MouseEvent) => void;
  onOpen: () => void;
  onContext: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

function RecipeSidebarRow({
  recipe, selected, multiSelected, dropMode, indentPx,
  onClick, onOpen, onContext,
  onDragStart, onDragEnd, onDragOver, onDrop,
}: RecipeSidebarRowProps) {
  const hasBrewNumber = typeof recipe.brewNumber === 'number' && recipe.brewNumber > 0;
  const nameLine = hasBrewNumber
    ? `#${recipe.brewNumber} ${recipe.beerName || recipe.name}`
    : (recipe.beerName || recipe.name);
  const styleLine = formatRecipeStyleLine(recipe.style);
  const versionLine = `v${recipe.version || '1.0'}`;

  const cls =
    `recipe-item${selected ? ' selected' : ''}` +
    (multiSelected ? ' multi-selected' : '') +
    (dropMode === 'before' ? ' drop-before' : '') +
    (dropMode === 'after'  ? ' drop-after'  : '');
  return (
    <div
      className={cls}
      style={{ paddingLeft: 10 + indentPx }}
      draggable
      onClick={onClick}
      onDoubleClick={onOpen}
      onContextMenu={onContext}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="recipe-item-info">
        <div className="recipe-item-name">{nameLine}</div>
        {styleLine && <div className="recipe-item-meta">{styleLine}</div>}
        <div className="recipe-item-version">{versionLine}</div>
      </div>
    </div>
  );
}
