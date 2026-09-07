import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Database, Settings, ChevronLeft, ChevronRight, ShieldCheck, FileSpreadsheet, History, Send, BarChart3 } from 'lucide-react';
import nexgToolLogo from '../assets/nexgtool-removebg-preview.png';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/lead-search', label: 'Lead Search', icon: Users, permission: 'lead_search' },
  { path: '/lead-search/history', label: 'Lead Search History', icon: History, permission: 'lead_search_history' },
  { path: '/lead-search/csv', label: 'Lead CSV History', icon: FileSpreadsheet, permission: 'exports' },
  { path: '/business-outreach', label: 'Business Outreach', icon: Send, permission: 'outreach' },
  { path: '/data-library', label: 'Data Library', icon: Database, permission: 'data_library' },
  { path: '/data-analytics', label: 'Business Analytics Platform', icon: BarChart3, permission: 'data_analytics' },
];

const Sidebar = ({ collapsed, onToggle, permissions = [], isNexgAdmin = false }) => {
  const isDashboard = useLocation().pathname === '/';
  const visibleNavItems = [
    ...navItems.filter((item) => !item.permission || isNexgAdmin || permissions.includes(item.permission)),
    // The page itself requires an admin-password session. Keep this entry point
    // visible so an administrator can reach that unlock screen after logging in.
    { path: '/admin', label: 'Admin', icon: ShieldCheck },
  ];

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${isDashboard ? 'sidebar-dashboard' : ''}`}>
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
          >
            <item.icon size={20} />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {isDashboard && !collapsed && <div className="sidebar-growth-note"><strong>Turn data<br />into opportunity</strong><p>Intelligent tools for a brighter tomorrow.</p></div>}
      <div className="sidebar-bottom">
        {(isNexgAdmin || permissions.includes('settings')) && <NavLink to="/settings" className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`} title="Settings">
          <Settings size={20} />
          {!collapsed && <span>Settings</span>}
        </NavLink>}
        <button className="sidebar-toggle" onClick={onToggle}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
