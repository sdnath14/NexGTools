import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, BarChart3, Bell, ChevronDown, ClipboardList, Database, FileSpreadsheet, LayoutGrid, LogOut, Mic, Search, Send, Settings, ShieldCheck, Table2, Users, Wallet, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import Brand from '../components/Brand';
import { useNotifications } from '../notificationContext';

const categories = [
  {
    name: 'Sales', icon: Search, apps: [
      { name: 'Lead Search', description: 'Find business leads and save search results.', path: '/lead-search', icon: Search },
      { name: 'Business Search', description: 'Research companies and their contact details.', path: '/business-search', icon: Users },
      { name: 'Business Outreach', description: 'Prepare and send personalized outreach.', path: '/business-outreach', icon: Send },
      { name: 'Lead CSV History', description: 'Review saved searches and exports.', path: '/lead-search/csv', icon: FileSpreadsheet },
      { name: 'Business CSV History', description: 'Access exported business search data.', path: '/business-search/csv', icon: FileSpreadsheet },
    ],
  },
  {
    name: 'Operations', icon: ClipboardList, apps: [
      { name: 'Work Assignments', description: 'Create assignments and track team progress.', path: '/work-assignments', icon: ClipboardList },
      { name: 'Employee Work', description: 'Review work submitted by employees.', path: '/team-work', icon: Users },
      { name: 'Voice Agent', description: 'Assign work and update progress by voice.', path: '/voice-agent', icon: Mic },
    ],
  },
  {
    name: 'Finance', icon: Wallet, apps: [
      { name: 'Expense Tracker', description: 'Review claims, advances, and reimbursements.', path: '/expense-tracker', icon: Wallet },
    ],
  },
  {
    name: 'Data', icon: Database, apps: [
      { name: 'Data Library', description: 'Upload, search, and manage business files.', path: '/data-library', icon: Database },
      { name: 'Analytics', description: 'Explore datasets and business insights.', path: '/data-analytics', icon: BarChart3 },
      { name: 'Used Oil India Data', description: 'Search and maintain industry records.', path: '/used-oil-india', icon: Table2 },
    ],
  },
  {
    name: 'Administration', icon: ShieldCheck, apps: [
      { name: 'Employee DB', description: 'Manage employee profiles and access.', path: '/employee-db', icon: Users },
      { name: 'Admin Console', description: 'Manage workspace users and settings.', path: '/admin', icon: ShieldCheck },
      { name: 'Settings', description: 'Update workspace preferences.', path: '/settings', icon: Settings },
    ],
  },
];

const totalApps = categories.reduce((count, category) => count + category.apps.length, 0);

export default function AdminDirectory({ user, onLogout, toolPage = false, children }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { unreadCount } = useNotifications();
  const [activeCategory, setActiveCategory] = useState('All Applications');
  const [query, setQuery] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const initials = (user?.name || 'Admin').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();

  useEffect(() => {
    if (!profileOpen) return undefined;
    const close = (event) => { if (!profileRef.current?.contains(event.target)) setProfileOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') setProfileOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [profileOpen]);

  const search = query.trim().toLowerCase();
  const visibleCategories = categories
    .filter((category) => activeCategory === 'All Applications' || category.name === activeCategory)
    .map((category) => ({ ...category, apps: category.apps.filter((app) => `${app.name} ${app.description} ${category.name}`.toLowerCase().includes(search)) }))
    .filter((category) => category.apps.length > 0);
  const visibleCount = visibleCategories.reduce((count, category) => count + category.apps.length, 0);
  const currentCategory = categories.find((category) => category.apps.some((app) => app.path === pathname || pathname.startsWith(`${app.path}/`)));
  const currentApp = currentCategory?.apps.find((app) => app.path === pathname) || currentCategory?.apps.find((app) => pathname.startsWith(`${app.path}/`));
  const selectedCategory = toolPage ? currentCategory?.name || 'All Applications' : activeCategory;
  const chooseCategory = (name) => { setActiveCategory(name); setQuery(''); if (toolPage) navigate('/'); };

  return <div className="admin-directory">
    <header className="directory-topbar">
      <button className="directory-brand" type="button" onClick={() => { setActiveCategory('All Applications'); setQuery(''); navigate('/'); }} aria-label="NexG Tools application directory"><span className="directory-brand-mark"><Brand /></span><span className="directory-brand-name">NexG Tools <small>Portal</small></span></button>
      <div className="directory-topbar-actions">
        <label className="directory-search"><Search size={17} aria-hidden="true" /><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); if (toolPage) { setActiveCategory('All Applications'); navigate('/'); } }} placeholder="Search applications..." aria-label="Search applications" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={15} /></button>}</label>
        <button className="directory-notifications" type="button" onClick={() => navigate('/notifications')} aria-label={`Notifications, ${unreadCount} unread`}><Bell size={20} />{unreadCount > 0 && <i />}</button>
        <div className="directory-profile" ref={profileRef}>
          <button type="button" className="directory-profile-trigger" aria-label="Account menu" aria-expanded={profileOpen} onClick={() => setProfileOpen((current) => !current)}><span>{initials}</span><ChevronDown size={15} /></button>
          {profileOpen && <div className="directory-profile-menu"><strong>{user?.name || 'Admin'}</strong><small>{user?.email}</small><button type="button" onClick={() => { setProfileOpen(false); navigate('/settings'); }}><Settings size={16} /> Settings</button><button type="button" onClick={onLogout}><LogOut size={16} /> Sign out</button></div>}
        </div>
      </div>
    </header>
    <div className="directory-frame">
      <nav className="directory-categories" aria-label="Application categories">
        <p>Categories</p>
        <button type="button" className={selectedCategory === 'All Applications' ? 'active' : ''} aria-current={selectedCategory === 'All Applications' ? 'page' : undefined} onClick={() => chooseCategory('All Applications')}><LayoutGrid size={17} /><span>All Applications</span><small>{totalApps}</small></button>
        {categories.filter((category) => category.name !== 'Finance').map((category) => <button type="button" key={category.name} className={selectedCategory === category.name ? 'active' : ''} aria-current={selectedCategory === category.name ? 'page' : undefined} onClick={() => chooseCategory(category.name)}><category.icon size={17} /><span>{category.name}</span><small>{category.apps.length}</small></button>)}
        <div className="directory-category-divider" aria-hidden="true" />
        <button type="button" className={pathname === '/expense-tracker' ? 'active' : ''} aria-current={pathname === '/expense-tracker' ? 'page' : undefined} onClick={() => navigate('/expense-tracker')}><Wallet size={17} /><span>Expense Tracker</span></button>
      </nav>
      <main className={`directory-main ${toolPage ? 'directory-main-tool' : ''}`}>
        {toolPage ? <div className="app-content directory-tool-content"><div className="directory-tool-crumb"><button type="button" onClick={() => chooseCategory(currentCategory?.name || 'All Applications')}>Applications</button><ArrowRight size={14} /><span>{currentApp?.name || (pathname === '/notifications' ? 'Notifications' : 'Workspace')}</span></div>{children}</div> : <>
        <div className="directory-heading"><div><h1>Application Directory</h1><p>Browse and access your NexG Tools workspace.</p></div><span>{visibleCount} {visibleCount === 1 ? 'application' : 'applications'}</span></div>
        {visibleCategories.map((category) => <section className="directory-section" key={category.name} aria-labelledby={`directory-${category.name}`}>
          <div className="directory-section-head"><h2 id={`directory-${category.name}`}>{category.name}</h2><span>{category.apps.length}</span></div>
          <div className="directory-cards">{category.apps.map((app) => <article className="directory-card" key={app.path}>
            <div className="directory-card-title"><app.icon size={19} aria-hidden="true" /><h3>{app.name}</h3></div>
            <div className="directory-card-body"><span>{category.name}</span><p>{app.description}</p></div>
            <div className="directory-card-footer"><span>NexG Tools</span><button type="button" onClick={() => navigate(app.path)} aria-label={`Open ${app.name}`}>Open <ArrowRight size={15} /></button></div>
          </article>)}</div>
        </section>)}
        {!visibleCount && <div className="directory-empty"><Search size={24} /><h2>No applications found</h2><p>Try another search or choose a different category.</p><button type="button" onClick={() => { setQuery(''); setActiveCategory('All Applications'); }}>Show all applications</button></div>}
        </>}
      </main>
    </div>
  </div>;
}
