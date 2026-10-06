import React, { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { X, Bell, LayoutDashboard, Users, Database, Settings, ChevronLeft, ChevronRight, ShieldCheck, FileSpreadsheet, History, Send, BarChart3, Table2, ClipboardList } from 'lucide-react';
import nexgToolLogo from '../assets/nexgtool-removebg-preview.png';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/lead-search', label: 'Lead Search', icon: Users, permission: 'lead_search' },
  { path: '/lead-search/history', label: 'Lead Search History', icon: History, permission: 'lead_search_history' },
  { path: '/lead-search/csv', label: 'Lead CSV History', icon: FileSpreadsheet, permission: 'exports' },
  { path: '/business-outreach', label: 'Business Outreach', icon: Send, permission: 'outreach' },
  { path: '/notifications', label: 'Notifications', icon: Bell },
  { path: '/my-tasks', label: 'My Tasks', icon: ClipboardList },
  { path: '/work-assignments', label: 'Work Assignments', icon: ClipboardList, permission: 'work_assignments' },
  { path: '/data-library', label: 'Data Library', icon: Database, permission: 'data_library' },
  { path: '/data-analytics', label: 'Business Analytics Platform', icon: BarChart3, permission: 'data_analytics' },
  { path: '/used-oil-india', label: 'Used Oil India Data', icon: Table2, permission: 'used_oil_india' },
];

const Sidebar = ({ collapsed, onToggle, permissions = [], isNexgAdmin = false, isMobile = false, mobileOpen = false, onClose }) => {
  const sidebarRef = useRef(null);
  useEffect(() => {
    if (!isMobile || !mobileOpen) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => [...sidebarRef.current.querySelectorAll('a[href], button:not(:disabled)')];
    focusable()[0]?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const items = focusable();
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [isMobile, mobileOpen, onClose]);
  const isDashboard = useLocation().pathname === '/';
  const visibleNavItems = [
    ...navItems.filter((item) => !item.permission || isNexgAdmin || permissions.includes(item.permission))
      .map((item) => item.path === '/my-tasks' && isNexgAdmin ? { ...item, label: 'Task Assigned' } : item),
    // The page itself requires an admin-password session. Keep this entry point
    // visible so an administrator can reach that unlock screen after logging in.
    { path: '/admin', label: 'Admin', icon: ShieldCheck },
  ];

  return (
    <>
    {isMobile && mobileOpen && <div className="mobile-sidebar-backdrop" onClick={onClose} aria-hidden="true" />}
    <aside id="workspace-sidebar" ref={sidebarRef} role={isMobile && mobileOpen ? 'dialog' : undefined} aria-modal={isMobile && mobileOpen ? true : undefined} aria-label="Workspace navigation" className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${isDashboard ? 'sidebar-dashboard' : ''} ${mobileOpen ? 'sidebar-mobile-open' : ''}`}>
      {isMobile && <button className="mobile-sidebar-close" aria-label="Close navigation menu" onClick={onClose}><X size={22} /></button>}
      <div className="sidebar-brand">
        {collapsed ? (
          <div className="sidebar-logo-mini" title="NexG Tools">
            <img className="sidebar-logo sidebar-logo-collapsed" src={nexgToolLogo} alt="NexG Tools" />
          </div>
        ) : (
          <div className="sidebar-brand-lockup">
            <img className="sidebar-logo" src={nexgToolLogo} alt="NexG" />
            <span className="sidebar-logo-e" aria-hidden="true">
              <img src={nexgToolLogo} alt="" />
            </span>
            <span className="sidebar-logo-text">Tools</span>
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-nav-label">{!collapsed && 'TOOLS'}</div>
        {visibleNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end
            className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
            title={item.label}
            onClick={isMobile ? onClose : undefined}
          >
            <item.icon size={20} />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {isDashboard && !collapsed && <div className="sidebar-growth-note"><strong>Turn data<br />into opportunity</strong><p>Intelligent tools for a brighter tomorrow.</p></div>}
      <div className="sidebar-bottom">
        {(isNexgAdmin || permissions.includes('settings')) && <NavLink to="/settings" onClick={isMobile ? onClose : undefined} className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`} title="Settings">
          <Settings size={20} />
          {!collapsed && <span>Settings</span>}
        </NavLink>}
        <button className="sidebar-toggle" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
    </>
  );
};

export default Sidebar;
