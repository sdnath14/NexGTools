import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Users, Send, ClipboardList, Menu } from 'lucide-react';

export default function MobileNav({ user, onOpenMenu, mobileMenuOpen }) {
  const allowed = (permission) => user?.is_nexg_admin || user?.permissions?.includes(permission);
  const links = [{ to: '/', label: 'Home', icon: Home }, ...(allowed('lead_search') ? [{ to: '/lead-search', label: 'Leads', icon: Users }] : []), ...(allowed('outreach') ? [{ to: '/business-outreach', label: 'Outreach', icon: Send }] : []), { to: user?.is_nexg_admin ? '/work-assignments' : '/my-tasks', label: 'Tasks', icon: ClipboardList }];
  return <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
    {links.map((item) => <NavLink key={item.to} to={item.to} end><item.icon size={22} /><span>{item.label}</span></NavLink>)}
    <button onClick={onOpenMenu} aria-label="More workspace tools" aria-expanded={mobileMenuOpen} aria-controls="workspace-sidebar"><Menu size={22} /><span>More</span></button>
  </nav>;
}
