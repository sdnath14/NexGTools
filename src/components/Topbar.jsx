import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Menu, LogOut, ArrowLeft, Bell, FileSpreadsheet, Search, ChevronDown, Settings, ShieldCheck } from 'lucide-react';
import { useNotifications } from '../notificationContext';
import Brand from './Brand';

const titles = { '/': 'Home', '/lead-search': 'Lead Search', '/lead-search/history': 'Lead CSV History', '/lead-search/csv': 'Lead CSV History', '/business-search': 'Business Search', '/business-search/csv': 'Business CSV History', '/business-outreach': 'Business Outreach', '/my-tasks': 'My Tasks', '/notifications': 'Notifications', '/data-library': 'Data Library', '/data-analytics': 'Analytics', '/used-oil-india': 'Used Oil India Data', '/admin': 'Admin', '/settings': 'Settings', '/work-assignments': 'Work Assignments', '/voice-agent': 'Voice Agent' };

export default function Topbar({ user, onLogout, mobileMenuOpen, onOpenMenu }) {
  const location = useLocation(), navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { unreadCount } = useNotifications();
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const profileRef = useRef(null), searchRef = useRef(null);
  const home = location.pathname === '/';
  const allowed = (permission) => user?.is_nexg_admin || user?.permissions?.includes(permission);
  const initials = (user?.name || 'NexG').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  useEffect(() => {
    const keyDown = (event) => {
      if (event.key === 'Escape') setProfileOpen(false);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (!home) navigate('/'); else searchRef.current?.focus(); }
    };
    const close = (event) => { if (!profileRef.current?.contains(event.target)) setProfileOpen(false); };
    document.addEventListener('keydown', keyDown); document.addEventListener('pointerdown', close);
    return () => { document.removeEventListener('keydown', keyDown); document.removeEventListener('pointerdown', close); };
  }, [home, navigate]);
  useEffect(() => { setProfileOpen(false); }, [location.pathname]);
  return <header className={`topbar ${home ? 'topbar-dashboard' : ''}`}>
    <div className="topbar-left">
      <button className="mobile-brand-button" onClick={() => navigate('/')} aria-label="NexG Petrolube home"><Brand tools subtitle="Petrolube" /></button>
      <button className="mobile-menu-button" aria-label="Open navigation menu" aria-expanded={mobileMenuOpen} aria-controls="workspace-sidebar" onClick={onOpenMenu}><Menu size={22} /></button>
      {!home && <button className="topbar-nav-btn" onClick={() => navigate('/')} aria-label="Back to home"><ArrowLeft size={16} /><span>Back</span></button>}
      {home ? <label className={`dashboard-tool-search ${mobileSearchOpen || params.get('tools') ? 'mobile-search-open' : ''}`}><Search size={19} /><input ref={searchRef} aria-label="Search workspace tools" type="search" placeholder="Search leads, companies, tools..." value={params.get('tools') || ''} onChange={(event) => { const next = new URLSearchParams(params); if (event.target.value) next.set('tools', event.target.value); else next.delete('tools'); setParams(next, { replace: true }); }} /><kbd>Ctrl K</kbd></label> : <h2 className="topbar-title">{location.pathname === '/my-tasks' && user?.is_nexg_admin ? 'Work Assignments' : titles[location.pathname] || 'NexG Tools'}</h2>}
      {location.pathname.startsWith('/lead-search') && (allowed('exports') || allowed('lead_search_history')) && <div className="topbar-context-actions"><button className="topbar-nav-btn" onClick={() => navigate('/lead-search/csv')}><FileSpreadsheet size={15} />CSV History</button></div>}
      {location.pathname.startsWith('/business-search') && allowed('exports') && <button className="topbar-nav-btn" onClick={() => navigate('/business-search/csv')}><FileSpreadsheet size={15} />CSV</button>}
    </div>
    <div className="topbar-right">
      {home && <button className="mobile-search-toggle" aria-label="Search tools" aria-expanded={mobileSearchOpen} onClick={() => { setMobileSearchOpen(!mobileSearchOpen); window.setTimeout(() => searchRef.current?.focus(), 0); }}><Search size={18} /></button>}
      <button className="topbar-btn notification-bell" aria-label={`Notifications, ${unreadCount} unread`} onClick={() => navigate('/notifications')}><Bell size={23} />{unreadCount > 0 && <span className="notification-dot" />}</button>
      <div className="workspace-profile" ref={profileRef}>
        <button className="workspace-profile-trigger" aria-expanded={profileOpen} aria-controls="profile-options" onClick={() => setProfileOpen(!profileOpen)}><span className="topbar-avatar">{initials}</span><span className="workspace-profile-name">{user?.name?.split(' ')[0] || 'User'}</span><ChevronDown className="workspace-profile-chevron" size={17} /></button>
        {profileOpen && <div className="workspace-profile-dropdown" id="profile-options"><strong>{user?.name}</strong><small>{user?.email}</small>{allowed('settings') && <button onClick={() => navigate('/settings')}><Settings size={16} />Settings</button>}<button onClick={() => navigate('/admin')}><ShieldCheck size={16} />Admin</button><button onClick={onLogout}><LogOut size={16} />Log out</button></div>}
      </div>
    </div>
  </header>;
}
