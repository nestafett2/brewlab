import { useState } from 'react';
import { useStore } from '../store';

type MobileTab = 'home' | 'brews' | 'recipes' | 'inventory' | 'settings';

export default function Mobile() {
  const { recipes } = useStore();
  const [tab, setTab] = useState<MobileTab>('home');

  return (
    <div className="mobile-layout">
      {/* Main Content */}
      <main className="mobile-main">
        {tab === 'home' && <p>Home — coming soon</p>}
        {tab === 'brews' && <p>Brews ({recipes.length}) — coming soon</p>}
        {tab === 'recipes' && <p>Recipes — coming soon</p>}
        {tab === 'inventory' && <p>Inventory — coming soon</p>}
        {tab === 'settings' && <p>Settings — coming soon</p>}
      </main>

      {/* Bottom Tab Bar */}
      <nav className="bottom-tabs">
        <button className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}>Home</button>
        <button className={tab === 'brews' ? 'active' : ''} onClick={() => setTab('brews')}>Brews</button>
        <button className={tab === 'recipes' ? 'active' : ''} onClick={() => setTab('recipes')}>Recipes</button>
        <button className={tab === 'inventory' ? 'active' : ''} onClick={() => setTab('inventory')}>Inventory</button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>Settings</button>
      </nav>
    </div>
  );
}
