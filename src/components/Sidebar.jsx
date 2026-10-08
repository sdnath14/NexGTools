import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { X, Bell, Home, Search, Database, Settings, ChevronLeft, ChevronRight, FileSpreadsheet, Send, BarChart3, Table2, ClipboardList, Mic } from 'lucide-react';
import Brand from './Brand';
import { useNotifications } from '../notificationContext';

const navItems = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/lead-search', label: 'Lead Search', icon: Search, permission: 'lead_search' },
  { path: '/lead-search/csv', label: 'Lead CSV History', icon: FileSpreadsheet, permissions: ['exports', 'lead_search_history'] },
  { path: '/business-outreach', label: 'Business Outreach', icon: Send, permission: 'outreach' },
  { path: '/notifications', label: 'Notifications', icon: Bell },
  { path: '/my-tasks', label: 'My Tasks', icon: ClipboardList },
  { path: '/work-assignments', label: 'Work Assignments', icon: ClipboardList, permission: 'work_assignments' },
  { path: '/voice-agent', label: 'Voice Agent', icon: Mic, permission: 'work_assignments' },
  { path: '/data-library', label: 'Data Library', icon: Database, permission: 'data_library' },
  { path: '/data-analytics', label: 'Analytics', icon: BarChart3, permission: 'data_analytics' },
  { path: '/used-oil-india', label: 'Used Oil India Data', icon: Table2, permission: 'used_oil_india' },
];

const Sidebar = ({ user, collapsed, onToggle, permissions = [], isNexgAdmin = false, isMobile = false, mobileOpen = false, onClose }) => {
  const sidebarRef = useRef(null);
  const navRef = useRef(null);
  const [indicator, setIndicator] = useState(null);
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    const nav = navRef.current;
    const updateIndicator = () => {
      const active = nav?.querySelector('[aria-current="page"]');
      setIndicator(active ? { top: active.offsetTop, height: active.offsetHeight } : null);
    };
    updateIndicator();
    const observer = new ResizeObserver(updateIndicator);
    if (nav) observer.observe(nav);
    return () => observer.disconnect();
  }, [pathname, collapsed, mobileOpen]);
  const { unreadCount } = useNotifications();
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
  const isDashboard = pathname === '/';
  const visibleNavItems = navItems
    .filter((item) => isNexgAdmin || (item.permissions ? item.permissions.some((permission) => permissions.includes(permission)) : !item.permission || permissions.includes(item.permission)))
    .filter((item) => !(item.path === '/my-tasks' && isNexgAdmin));

  return (
    <>
    {isMobile && <div className={`mobile-sidebar-backdrop ${mobileOpen ? 'mobile-sidebar-backdrop-open' : ''}`} onClick={onClose} aria-hidden="true" />}
    <aside id="workspace-sidebar" ref={sidebarRef} inert={isMobile && !mobileOpen} aria-hidden={isMobile && !mobileOpen ? true : undefined} role={isMobile && mobileOpen ? 'dialog' : undefined} aria-modal={isMobile && mobileOpen ? true : undefined} aria-label="Workspace navigation" className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${isDashboard ? 'sidebar-dashboard' : ''} ${mobileOpen ? 'sidebar-mobile-open' : ''}`}>
      {isMobile && <button className="mobile-sidebar-close" aria-label="Close navigation menu" onClick={onClose}><X size={22} /></button>}
      <div className="sidebar-brand">
        <Brand dark tools subtitle="Petrolube" />
        {!isMobile && <button className="sidebar-collapse-control" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>}
      </div>

      <nav className="sidebar-nav" ref={navRef}>
        <span className={`sidebar-active-indicator ${indicator ? 'sidebar-active-indicator-visible' : ''}`} aria-hidden="true" style={{ transform: `translateY(${indicator?.top || 0}px)`, height: indicator?.height || 43 }} />
        {[...visibleNavItems].sort((a, b) => {
          const order = ['/', '/lead-search', '/business-outreach', '/work-assignments', '/voice-agent', '/data-library', '/data-analytics', '/notifications', '/my-tasks', '/lead-search/csv', '/used-oil-india'];
          return order.indexOf(a.path) - order.indexOf(b.path);
        }).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end
            className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''} ${item.path === '/notifications' ? 'sidebar-notification-link' : ''}`}
            title={item.label}
            onClick={isMobile ? onClose : undefined}
          >
            <item.icon size={20} />
            <span className="sidebar-link-label">{item.label}</span>
            {item.path === '/notifications' && unreadCount > 0 && <i className="sidebar-unread-dot" />}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-bottom">
        {(isNexgAdmin || permissions.includes('settings')) && <NavLink to="/settings" onClick={isMobile ? onClose : undefined} className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`} title="Settings">
          <Settings size={20} />
          <span className="sidebar-link-label">Settings</span>
        </NavLink>}
        <div className="sidebar-user"><span className="sidebar-user-avatar">{(user?.name || 'NT').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><span><strong>{user?.name || 'NexG User'}</strong><small>{isNexgAdmin ? 'Admin' : 'Employee'}</small></span><ChevronRight size={15} /></div>
      </div>
    </aside>
    </>
  );
};

export default Sidebar;
