import { useState } from 'react';
import { useStore } from '../store';
import { isActiveBrew } from '../lib/utils';

type SidebarSection = 'home' | 'recipes' | 'inventory' | 'settings';
type HomeTab = 'overview' | 'calendar' | 'planner';

export default function Tablet() {
  const { recipes } = useStore();
  const [section, setSection] = useState<SidebarSection>('home');
  const [homeTab, setHomeTab] = useState<HomeTab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const activeBrews = recipes.filter(r => isActiveBrew(r.brewDate, false));
  const upcomingBrews = recipes.filter(r => {
    const d = new Date(r.brewDate);
    const now = new Date();
    const twoWeeks = new Date();
    twoWeeks.setDate(twoWeeks.getDate() + 14);
    return d > now && d <= twoWeeks;
  });

  return (
    <div className="tablet-layout">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
        <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? '\u2190' : '\u2192'}
        </button>
        {sidebarOpen && (
          <>
            <nav className="sidebar-nav">
              <button className={section === 'home' ? 'active' : ''} onClick={() => setSection('home')}>Home</button>
              <button className={section === 'recipes' ? 'active' : ''} onClick={() => setSection('recipes')}>Recipes</button>
              <button className={section === 'inventory' ? 'active' : ''} onClick={() => setSection('inventory')}>Inventory</button>
              <button className={section === 'settings' ? 'active' : ''} onClick={() => setSection('settings')}>Settings</button>
            </nav>
            <div className="sidebar-brews">
              <h4>Active ({activeBrews.length})</h4>
              {activeBrews.map(r => (
                <div key={r.id} className="brew-item">{r.beerName || r.name}</div>
              ))}
              <h4>Upcoming ({upcomingBrews.length})</h4>
              {upcomingBrews.map(r => (
                <div key={r.id} className="brew-item">{r.beerName || r.name}</div>
              ))}
            </div>
          </>
        )}
      </aside>

      {/* Main Content */}
      <main className="tablet-main">
        {section === 'home' && (
          <>
            <nav className="home-tabs">
              <button className={homeTab === 'overview' ? 'active' : ''} onClick={() => setHomeTab('overview')}>Overview</button>
              <button className={homeTab === 'calendar' ? 'active' : ''} onClick={() => setHomeTab('calendar')}>Calendar</button>
              <button className={homeTab === 'planner' ? 'active' : ''} onClick={() => setHomeTab('planner')}>Planner</button>
            </nav>
            {homeTab === 'overview' && <p>Overview — coming soon</p>}
            {homeTab === 'calendar' && <p>Calendar — coming soon</p>}
            {homeTab === 'planner' && <p>Planner — coming soon</p>}
          </>
        )}
        {section === 'recipes' && <p>Recipes — coming soon</p>}
        {section === 'inventory' && <p>Inventory — coming soon</p>}
        {section === 'settings' && <p>Settings — coming soon</p>}
      </main>
    </div>
  );
}
