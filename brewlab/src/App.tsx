import { useEffect, useState } from 'react';
import { useStore } from './store';
import { detectDevice, recomputeBrewNumbers, type DeviceType } from './lib/utils';
import { hasSupabase } from './lib/supabase';
import Desktop from './pages/Desktop';
import Tablet from './pages/Tablet';
import Mobile from './pages/Mobile';
import ToastContainer from './components/shared/ToastContainer';

// One-time migration flag. After the 2026-05-06 brewNumber-as-counter
// rename, existing recipes carry whatever value the old free-text Brew #
// input wrote (often a tax-serial-like "123"). The flag gates
// recomputeBrewNumbers so it runs once per device on first load and
// never again. Synced via the settings table on push, but the local
// flag is what prevents re-runs — multiple devices firing the recompute
// produces deterministic identical writes anyway.
const BREW_NUMBER_RECOMPUTE_FLAG = 'bl_brew_number_recompute';
const BREW_NUMBER_RECOMPUTE_VERSION = '2026-05-06';

export default function App() {
  const { hydrate, syncing, hydrated } = useStore();
  const theme = useStore(s => s.settings.theme);
  const [device, setDevice] = useState<DeviceType>(detectDevice);

  // Hydrate from Supabase on startup. When credentials aren't configured
  // sbHydrate resolves immediately and the app boots in local-only mode.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Post-hydrate recompute pass for brewNumber. Runs once per device.
  // Reads recipes via getState() (not as an effect dep) so the effect
  // fires exactly once after hydration completes.
  useEffect(() => {
    if (!hydrated) return;
    let flag: string | null = null;
    try { flag = localStorage.getItem(BREW_NUMBER_RECOMPUTE_FLAG); } catch { /* ignore */ }
    if (flag) return;
    const state = useStore.getState();
    const next = recomputeBrewNumbers(state.recipes);
    if (next !== state.recipes) {
      state.setRecipes(next);
    }
    try { localStorage.setItem(BREW_NUMBER_RECOMPUTE_FLAG, BREW_NUMBER_RECOMPUTE_VERSION); } catch { /* ignore */ }
  }, [hydrated]);

  // Apply persisted theme by toggling body.light. Mirrors HTML setTheme +
  // applyThemeOnLoad (brewlab-desktop.html:20350 / 20361). React's
  // theme.css uses `body.light` (not `body.light-mode` like the HTML);
  // we follow theme.css.
  useEffect(() => {
    document.body.classList.toggle('light', theme === 'light');
  }, [theme]);

  // Update device type on resize
  useEffect(() => {
    const onResize = () => setDevice(detectDevice());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Global Ctrl+Z / Cmd+Z → invoke the most recent toast's undo closure.
  // Mirrors HTML undoPop wiring (brewlab-desktop.html:13452). Deviation:
  // when focus is in an INPUT/TEXTAREA we let native text-undo run
  // instead of stealing the keystroke. Ctrl+Shift+Z is left alone for a
  // future redo.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.shiftKey) return;
      if (e.key !== 'z' && e.key !== 'Z') return;

      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      e.preventDefault();
      useStore.getState().popMostRecentUndo();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Show loading during initial hydration only when we actually have a
  // Supabase connection to wait on. Otherwise render straight through.
  if (!hydrated && syncing && hasSupabase()) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Syncing with Supabase...</p>
      </div>
    );
  }

  // Wrap the device-specific layout so the toast stack mounts once at
  // app root and surfaces above all modals across desktop/tablet/mobile.
  const layout =
    device === 'mobile' ? <Mobile /> :
    device === 'tablet' ? <Tablet /> :
                          <Desktop />;
  return (
    <>
      {layout}
      <ToastContainer />
    </>
  );
}
