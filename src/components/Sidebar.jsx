import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Building2, Database, Settings, ChevronLeft, ChevronRight, ShieldCheck, FileSpreadsheet, Send } from 'lucide-react';
import nexgToolLogo from '../assets/nexgtool-removebg-preview.png';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/lead-search', label: 'Lead Search', icon: Users },
  { path: '/lead-search/csv', label: 'Lead CSV History', icon: FileSpreadsheet },
  { path: '/business-search', label: 'Business Search', icon: Building2 },
  { path: '/business-search/csv', label: 'Business CSV History', icon: FileSpreadsheet },
  { path: '/outreach', label: 'Company Outreach', icon: Send },
  { path: '/data-library', label: 'Data Library', icon: Database },
];

const Sidebar = ({ collapsed, onToggle, isAdmin }) => {
  const visibleNavItems = isAdmin
    ? [...navItems, { path: '/admin', label: 'Admin', icon: ShieldCheck }]
    : navItems;

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
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

      <div className="sidebar-bottom">
        <NavLink to="/settings" className="sidebar-link" title="Settings">
          <Settings size={20} />
          {!collapsed && <span>Settings</span>}
        </NavLink>
        <button className="sidebar-toggle" onClick={onToggle}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
