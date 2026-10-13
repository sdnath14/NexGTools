import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bell, LogOut } from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './EmployeeWorkspace.css';

const names = { lead_search: 'Lead Search', business_search: 'Business Search', outreach: 'Business Outreach', work_assignments: 'Work Assignments', data_library: 'Data Library', data_analytics: 'Analytics', used_oil_india: 'Used Oil India', exports: 'Exports', settings: 'Settings' };
const paths = { lead_search: '/lead-search', business_search: '/business-search', outreach: '/business-outreach', work_assignments: '/work-assignments', data_library: '/data-library', data_analytics: '/data-analytics', used_oil_india: '/used-oil-india', exports: '/lead-search/csv', settings: '/settings', lead_search_history: '/lead-search/csv' };

export default function EmployeeDashboard({ user, onLogout }) {
  const [tasks, setTasks] = useState([]);
  useEffect(() => {
    let live = true;
    const load = async () => {
      try { const response = await fetch(`${API_BASE_URL}/api/my-tasks`, { headers: authHeaders() }); const data = await response.json(); if (live && response.ok) setTasks(data.tasks || []); } catch { /* The task page shows connection errors. */ }
    };
    load(); const timer = window.setInterval(load, 15000);
    return () => { live = false; window.clearInterval(timer); };
  }, []);
  const tools = (user.permissions || []).filter((item) => item !== 'dashboard').map((item) => names[item] || item.replaceAll('_', ' '));
  return <div className="employee-dashboard">
    <div className="employee-dashboard-top"><div><Link to="/notifications" aria-label="Notifications"><Bell size={18} /></Link><button type="button" onClick={onLogout}><LogOut size={17} /> Sign out</button></div></div>
    <div className="employee-dashboard-intro"><span className="employee-dashboard-eyebrow">NexG Tools · Employee workspace</span><h2>Welcome, {user.name}</h2><p>Your work and access in one place</p></div>
    <dl className="employee-facts">
      <dt>Your name</dt><dd>{user.name}</dd>
      <dt>Employee ID</dt><dd>{user.employee_code || `EMP-${user.id}`}</dd>
      <dt>Role</dt><dd>{user.role || 'Employee'}</dd>
      <dt>Company</dt><dd>{user.company || 'Not set'}</dd>
      <dt>Tools assigned by admin</dt><dd>{tools.join(', ') || 'No tools assigned'}</dd>
      <dt>Tasks assigned</dt><dd>{tasks.length} total · {tasks.filter((task) => task.status !== 'Done').length} active</dd>
    </dl>
    {!!tools.length && <section className="employee-tool-section"><h2>Tools you can access</h2><div className="employee-tool-links" aria-label="Your tools">{(user.permissions || []).filter((item) => paths[item]).map((item) => <Link key={item} to={paths[item]}><span>{names[item] || item.replaceAll('_', ' ')}</span><ArrowUpRight size={16} /></Link>)}</div></section>}
    <div className="employee-dashboard-actions"><Link to="/my-tasks">My tasks</Link><Link to="/notifications">Notifications</Link>{tasks.find((task) => task.status !== 'Done') && <Link to={`/my-tasks/${tasks.find((task) => task.status !== 'Done').id}`}>Open current task</Link>}</div>
  </div>;
}
