import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bell, LogOut, UserRound, X } from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './EmployeeWorkspace.css';

const names = { lead_search: 'Lead Search', business_search: 'Business Search', outreach: 'Business Outreach', work_assignments: 'Work Assignments', data_library: 'Data Library', data_analytics: 'Analytics', used_oil_india: 'Used Oil India', expense_tracker: 'Expense Tracker', exports: 'Exports', settings: 'Settings' };
const paths = { lead_search: '/lead-search', business_search: '/business-search', outreach: '/business-outreach', work_assignments: '/work-assignments', data_library: '/data-library', data_analytics: '/data-analytics', used_oil_india: '/used-oil-india', expense_tracker: '/expense-tracker', exports: '/lead-search/csv', settings: '/settings', lead_search_history: '/lead-search/csv' };

export default function EmployeeDashboard({ user, onLogout }) {
  const [tasks, setTasks] = useState([]);
  const [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => {
    let live = true;
    const load = async () => {
      try { const response = await fetch(`${API_BASE_URL}/api/my-tasks`, { headers: authHeaders() }); const data = await response.json(); if (live && response.ok) setTasks(data.tasks || []); } catch { /* The task page shows connection errors. */ }
    };
    load(); const timer = window.setInterval(load, 15000);
    return () => { live = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!profileOpen) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') setProfileOpen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [profileOpen]);
  const accessibleTools = [...new Set([...(user.permissions || []), 'expense_tracker'])];
  const tools = accessibleTools.filter((item) => item !== 'dashboard').map((item) => names[item] || item.replaceAll('_', ' '));
  return <div className="employee-dashboard">
    <div className="employee-dashboard-top"><div><Link to="/notifications" aria-label="Notifications"><Bell size={18} /></Link><button type="button" className="employee-profile-trigger" aria-label={`View ${user.name}'s profile`} aria-expanded={profileOpen} aria-controls="employee-profile-panel" onClick={() => setProfileOpen(true)}><UserRound size={17} /> {user.name}</button><button type="button" onClick={onLogout}><LogOut size={17} /> Sign out</button></div></div>
    <div className="employee-dashboard-intro"><span className="employee-dashboard-eyebrow">NexG Tools · Employee workspace</span><h2>Welcome, {user.name}</h2><p>Your work and access in one place</p></div>
    {profileOpen && <div className="employee-profile-overlay" onClick={() => setProfileOpen(false)}>
      <aside id="employee-profile-panel" className="employee-profile-panel" role="dialog" aria-modal="true" aria-label="Employee profile" onClick={(event) => event.stopPropagation()}>
        <div className="employee-profile-heading"><div><span>Employee profile</span><h2>{user.name}</h2></div><button type="button" aria-label="Close profile" onClick={() => setProfileOpen(false)}><X size={20} /></button></div>
        <dl className="employee-profile-facts">
          <div><dt>Your name</dt><dd>{user.name}</dd></div>
          <div><dt>Employee ID</dt><dd>{user.employee_code || `EMP-${user.id}`}</dd></div>
          <div><dt>Role</dt><dd>{user.role || 'Employee'}</dd></div>
          <div><dt>Company</dt><dd>{user.company || 'Not set'}</dd></div>
          <div><dt>Tasks assigned</dt><dd>{tasks.length} total · {tasks.filter((task) => task.status !== 'Done').length} active</dd></div>
        </dl>
      </aside>
    </div>}
    {!!tools.length && <section className="employee-tool-section"><h2>Tools you can access</h2><div className="employee-tool-links" aria-label="Your tools">{accessibleTools.filter((item) => paths[item]).map((item) => <Link key={item} to={paths[item]}><span>{names[item] || item.replaceAll('_', ' ')}</span><ArrowUpRight size={16} /></Link>)}</div></section>}
    <div className="employee-dashboard-actions"><Link to="/my-tasks">My tasks</Link>{tasks.find((task) => task.status !== 'Done') && <Link to={`/my-tasks/${tasks.find((task) => task.status !== 'Done').id}`}>Open current task</Link>}</div>
  </div>;
}
