import React, { useEffect, useState } from 'react';
import { ArrowRight, Database, BarChart3, Search, Send, ClipboardList, Users, CheckCircle2, Mic } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE_URL, authHeaders } from '../auth';
import './Dashboard.css';

const tools = [
  { permission: 'lead_search', label: 'Lead Search', description: 'Find verified business leads quickly.', path: '/lead-search', icon: Search, color: '#1260ff', image: 'architecture-hero.png' },
  { permission: 'outreach', label: 'Business Outreach', description: 'Generate and send personalized outreach.', path: '/business-outreach', icon: Send, color: '#ff641e', image: 'architecture-hero.png' },
  { permission: 'work_assignments', label: 'Work Assignments', description: 'Type assignments and track all team tasks.', path: '/work-assignments', icon: ClipboardList, color: '#12b99a', image: 'office-interior.png' },
  { permission: 'data_library', label: 'Data Library', description: 'Search and manage uploaded data.', path: '/data-library', icon: Database, color: '#5951ff', image: 'office-library.png' },
  { permission: 'work_assignments', label: 'Voice Agent', description: 'Speak to assign work and update progress.', path: '/voice-agent', icon: Mic, color: '#1260ff', image: 'office-interior.png' },
  { permission: 'data_analytics', label: 'Analytics', description: 'Turn your business data into insights.', path: '/data-analytics', icon: BarChart3, color: '#1260ff', image: 'office-library.png' },
  { permission: 'used_oil_india', label: 'Used Oil India Data', description: 'Explore and maintain industry records.', path: '/used-oil-india', icon: Database, color: '#12b99a', image: 'office-interior.png' },
];
const greeting = () => new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
const initials = (name) => (name || 'Employee').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
const weekDays = (history) => Array.from({ length: 7 }, (_, index) => {
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 6 + index);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { label: start.toLocaleDateString(undefined, { weekday: 'short' }), count: (history || []).filter((item) => new Date(item.created_at) >= start && new Date(item.created_at) < end).length };
});

export default function Dashboard({ user }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [showAllTools, setShowAllTools] = useState(false);
  const query = (params.get('tools') || '').trim().toLowerCase();
  const allowed = (permission) => Boolean(user?.is_nexg_admin || user?.permissions?.includes(permission));
  const canHistory = allowed('lead_search_history'), canData = allowed('data_analytics'), canOutreach = allowed('outreach'), canAssign = allowed('work_assignments');
  const [activity, setActivity] = useState({ loading: true, searches: null, datasets: null, outreach: null, tasks: null, error: '' });
  useEffect(() => {
    let active = true;
    const load = async () => {
      const requests = [
        ...(canHistory ? [['searches', '/api/search-history', 'history']] : []),
        ...(canData ? [['datasets', '/api/analytics/datasets', 'datasets']] : []),
        ...(canOutreach ? [['outreach', '/api/outreach', 'history']] : []),
        ['tasks', canAssign ? '/api/work-assignments' : '/api/my-tasks', 'tasks'],
      ];
      const results = await Promise.allSettled(requests.map(async ([key, endpoint, field]) => {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, { headers: authHeaders() });
        if (!response.ok) throw new Error('Could not load activity.');
        const data = await response.json();
        return [key, data[field] || []];
      }));
      if (!active) return;
      const next = { loading: false, searches: null, datasets: null, outreach: null, tasks: null, error: '' };
      for (const result of results) {
        if (result.status === 'fulfilled') next[result.value[0]] = result.value[1];
        else next.error = 'Some workspace activity could not be loaded. Please refresh to retry.';
      }
      setActivity(next);
    };
    load();
    const timer = window.setInterval(load, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [canHistory, canData, canOutreach, canAssign]);
  const value = (number) => activity.loading || number == null ? '\u2014' : Number(number).toLocaleString();
  const cards = [
    { label: 'Total Leads', count: activity.searches?.reduce((sum, item) => sum + Number(item.result_count || 0), 0), detail: 'From saved searches', icon: Users, color: '#1260ff' },
    { label: 'Outreach Sent', count: activity.outreach?.filter((item) => item.status === 'sent').length, detail: 'Sent messages', icon: Send, color: '#5951ff' },
    { label: canAssign ? 'Tasks Assigned' : 'My Tasks', count: activity.tasks?.length, detail: `${activity.tasks?.filter((item) => item.status === 'In Progress').length || 0} in progress`, icon: ClipboardList, color: '#ff641e' },
    { label: 'Data Sources', count: activity.datasets?.length, detail: 'Uploaded datasets', icon: Database, color: '#008cff' },
  ];
  const available = tools.filter((tool) => allowed(tool.permission));
  const filtered = available.filter((tool) => `${tool.label} ${tool.description}`.toLowerCase().includes(query));
  const visible = showAllTools || query ? filtered : filtered.slice(0, 4);
  const days = weekDays(activity.outreach), searches = weekDays(activity.searches);
  const chartMax = Math.max(1, ...days.map((day) => day.count), ...searches.map((day) => day.count));
  return <div className="workspace-dashboard">
    <section className="workspace-intro">
      <div className="workspace-intro-copy">
        <p className="workspace-greeting"><span>{greeting()}, </span><span className="workspace-first-name">{user?.name?.split(' ')[0] || 'there'}</span></p>
        <h1>Turn leads into<br />real <span>opportunities.</span></h1>
        <p className="workspace-intro-description">Find leads, automate outreach, assign work and keep your business moving &mdash; all in one place.</p>
        <p className="workspace-mobile-tagline">Turn leads into real <span>opportunities.</span></p>
      </div>
      <div className="workspace-hero-image" role="img" aria-label="Modern office architecture"><span>Build.<br />Outreach.<br />Execute.<br />Scale.<i /></span></div>
    </section>
    <section className="workspace-metrics" aria-label="Workspace overview">
      {cards.map((card) => <article className="workspace-metric" key={card.label} style={{ '--metric-color': card.color }}>
        <span className="workspace-metric-icon"><card.icon size={23} /></span>
        <div><span className="workspace-metric-label">{card.label}</span><strong>{value(card.count)}</strong><small>{card.detail}</small></div>
      </article>)}
    </section>
    <section className="workspace-tools-section">
      <div className="workspace-section-head"><h2>Workspace Tools</h2><button type="button" onClick={() => { setShowAllTools(!showAllTools); setParams({}); document.getElementById('workspace-tools')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }}>{showAllTools ? 'Show fewer tools' : 'View all tools'} <ArrowRight size={17} /></button></div>
      <div className="workspace-tools-grid" id="workspace-tools">
        {visible.map((tool) => <button className="workspace-tool-card" key={tool.path} onClick={() => navigate(tool.path)} style={{ '--tool-color': tool.color }}>
          <img src={`/images/${tool.image}`} alt="" loading="lazy" decoding="async" className="workspace-tool-photo" />
          <span className="workspace-tool-icon"><tool.icon size={25} /></span>
          <span className="workspace-tool-copy"><strong>{tool.label}</strong><small>{tool.description}</small></span>
          <span className="workspace-tool-arrow"><ArrowRight size={19} /></span>
        </button>)}
        {!visible.length && <p className="workspace-empty">{available.length ? 'No tools match your search.' : 'Your administrator can assign access to workspace tools. Your tasks and notifications are available in the navigation.'}</p>}
      </div>
    </section>
    {activity.error && <p className="workspace-error" role="status">{activity.error}</p>}
    <div className="workspace-lower-grid">
      <section className="workspace-panel">
        <div className="workspace-section-head"><h2>{canAssign ? 'Recent Work Assignments' : 'My Recent Tasks'}</h2><button onClick={() => navigate(canAssign ? '/work-assignments' : '/my-tasks')}>View all <ArrowRight size={15} /></button></div>
        <div className="workspace-recent-scroll"><table className="workspace-recent-table"><thead><tr><th>Task</th><th>Assigned To</th><th>Status</th><th>Due Date</th></tr></thead><tbody>
          {activity.tasks?.slice(0, 4).map((task) => <tr key={task.id}><td><button className="workspace-task-link" onClick={() => navigate(canAssign && !user?.is_nexg_admin ? '/work-assignments' : `/my-tasks?taskId=${encodeURIComponent(task.id)}`)}>{task.title}</button></td><td><span className="workspace-assignee"><i>{initials(task.employeeName)}</i>{task.employeeName || user?.name}</span></td><td><span className={`workspace-status status-${task.status.toLowerCase().replaceAll(' ', '-')}`}>{task.status === 'Done' ? 'Completed' : task.status}</span></td><td>{task.dueDate ? new Date(`${task.dueDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014'}</td></tr>)}
        </tbody></table></div>
        {!activity.tasks?.length && <p className="workspace-empty">{activity.loading ? 'Loading assignments...' : 'New assignments will appear here.'}</p>}
      </section>
      <section className="workspace-panel workspace-chart-panel">
        <div className="workspace-section-head"><h2>Outreach Overview</h2><span className="workspace-period">Last 7 days</span></div>
        <div className="workspace-chart-legend"><span><i />Outreach</span><span><i />Lead searches</span></div>
        {activity.outreach || activity.searches ? <div className="workspace-bar-chart" role="img" aria-label={`Last 7 days: ${days.reduce((total, day) => total + day.count, 0)} outreach messages and ${searches.reduce((total, day) => total + day.count, 0)} lead searches`}>
          {days.map((day, index) => <div className="workspace-bar-group" key={index}><div><i title={`${day.count} outreach messages`} style={{ height: `${Math.max(2, day.count / chartMax * 85)}px` }} /><i title={`${searches[index].count} searches`} style={{ height: `${Math.max(2, searches[index].count / chartMax * 85)}px` }} /></div><small>{day.label}</small></div>)}
        </div> : <p className="workspace-empty">{activity.loading ? 'Loading activity...' : 'Outreach and search activity are unavailable for this account.'}</p>}
        <div className="workspace-chart-totals"><div><Send size={18} /><strong>{value(activity.outreach?.length)}</strong><small>Outreach messages</small></div><div><Search size={18} /><strong>{value(activity.searches?.length)}</strong><small>Saved searches</small></div><div><CheckCircle2 size={18} /><strong>{value(activity.tasks?.filter((task) => task.status === 'Done').length)}</strong><small>Tasks completed</small></div></div>
      </section>
    </div>
  </div>;
}
