import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Database,
  BarChart3,
  CalendarDays,
  Search,
  Send,
  Leaf,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE_URL, authHeaders } from '../auth';
import './Dashboard.css';

const permissionLabels = {
  lead_search: 'Lead Search',
  lead_search_history: 'Lead Search History',
  outreach: 'Business Outreach',
  data_library: 'Data Library',
  data_analytics: 'Business Analytics Platform',
  used_oil_india: 'Used Oil India Data',
  exports: 'CSV History',
  settings: 'Settings',
};

const allDashboardPermissions = Object.keys(permissionLabels);
const EMPTY_PERMISSIONS = [];

const adminTools = [
  { permission: 'lead_search', label: 'Lead Search', description: 'Find business leads quickly', path: '/lead-search', icon: Search, color: '#2260ed', soft: '#e8f3ff', accent: '#bbdcff' },
  { permission: 'outreach', label: 'Business Outreach', description: 'Generate and send outreach', path: '/business-outreach', icon: Send, color: '#e76a14', soft: '#fff2e5', accent: '#ffd1a6' },
  { permission: 'data_library', label: 'Data Library', description: 'Search uploaded data', path: '/data-library', icon: Database, color: '#1878c9', soft: '#e8f4ff', accent: '#b8dcfa' },
  { permission: 'data_analytics', label: 'Chat with your database', description: 'Turn your data into business insights', path: '/data-analytics', icon: BarChart3, color: '#d8631b', soft: '#fff1e5', accent: '#ffdab9' },
  { permission: 'used_oil_india', label: 'Used Oil India Data', description: 'View and maintain imported records', path: '/used-oil-india', icon: Database, color: '#0f766e', soft: '#ecfdf5', accent: '#99f6e4' },
];

const todayLabel = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
}).format(new Date());

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const Dashboard = ({ user }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = (searchParams.get('tools') || '').trim().toLowerCase();
  const [activity, setActivity] = useState({ searches: null, datasets: null, loading: true, error: '' });
  const firstName = user?.name?.split(' ')[0] || 'there';
  const userPermissions = user?.is_nexg_admin ? allDashboardPermissions : (user?.permissions || EMPTY_PERMISSIONS);
  const grantedTools = userPermissions
    .filter((permission) => permissionLabels[permission])
    .map((permission) => permissionLabels[permission]);

  const canReadHistory = userPermissions.includes('lead_search_history');
  const canReadDatasets = userPermissions.includes('data_analytics');
  useEffect(() => {
    let active = true;
    const requests = [
      ...(canReadHistory ? [['searches', '/api/search-history', 'history']] : []),
      ...(canReadDatasets ? [['datasets', '/api/analytics/datasets', 'datasets']] : []),
    ];
    setActivity({ searches: null, datasets: null, loading: true, error: '' });
    Promise.allSettled(requests.map(async ([key, url, field]) => {
      const response = await fetch(`${API_BASE_URL}${url}`, { headers: authHeaders() });
      if (!response.ok) throw new Error('Unable to load workspace activity.');
      const data = await response.json();
      return [key, data[field] || []];
    })).then((results) => {
      if (!active) return;
      const next = { searches: null, datasets: null, loading: false, error: '' };
      results.forEach((result) => {
        if (result.status === 'fulfilled') next[result.value[0]] = result.value[1];
        else next.error = 'Some activity could not be loaded. Refresh to try again.';
      });
      setActivity(next);
    });
    return () => { active = false; };
  }, [canReadHistory, canReadDatasets]);
  const recent = useMemo(() => [
    ...(activity.searches || []).map((item) => ({ id: `search-${item.id}`, title: item.query_text || 'Lead search', date: item.created_at, type: 'Search', icon: Search, path: '/lead-search/history' })),
    ...(activity.datasets || []).map((item) => ({ id: `data-${item.id}`, title: item.filename, date: item.created_at, type: 'Dataset uploaded', icon: Database, path: '/data-analytics' })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4), [activity.searches, activity.datasets]);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - 6 + index);
    const end = new Date(date); end.setDate(end.getDate() + 1);
    return { label: date.toLocaleDateString(undefined, { weekday: 'short' }), count: (activity.searches || []).filter((item) => new Date(item.created_at) >= date && new Date(item.created_at) < end).length };
  });
  const visibleTools = adminTools.filter((tool) => userPermissions.includes(tool.permission) && `${tool.label} ${tool.description}`.toLowerCase().includes(query));
  const stat = (value) => activity.loading ? '?' : value == null ? '?' : Number(value).toLocaleString();

  return (
    <div className="dash-page dash-live">
      <header className="dash-welcome-banner">
        <div className="dash-welcome-copy"><span className="dash-eyebrow">WELCOME TO <span className="dash-brand-orange">NEXG</span> <span className="dash-brand-blue">TOOLS</span></span>
          <h1>Your <span className="dash-brand-orange">business</span> <em>workspace</em></h1>
          <p>{greeting()}, {firstName}. Choose a tool to get started and keep things moving.</p>
          <div className="dash-date-card"><CalendarDays size={18} /><span>{todayLabel}</span></div>
        </div>
        <div className="dash-banner-caption">Cleaner resources.<br />Brighter tomorrow.<i /></div>
      </header>

      {!user?.is_nexg_admin && <section className="dash-panel dash-access-panel">
        <h2>You have access to</h2>
        {grantedTools.length ? <div className="dash-access-list">{grantedTools.map((tool) => <span key={tool}>{tool}</span>)}</div>
          : <p>No tools have been assigned yet. Please contact an administrator.</p>}
      </section>}

      {adminTools.some((tool) => userPermissions.includes(tool.permission)) && <section className="dash-admin-launcher" aria-label="Workspace tools">
        <div className="dash-section-heading"><div><h2>Workspace tools</h2><p>Choose a tool to get started.</p></div><button type="button" className="dash-view-tools" onClick={() => { setSearchParams({}); document.getElementById('workspace-tools')?.scrollIntoView({ block: 'nearest' }); }}>View all tools <ArrowRight size={15} /></button></div>
        <div className="dash-admin-tool-grid" id="workspace-tools">
          {visibleTools.map((tool, index) => {
            const Icon = tool.icon;
            return <button
              key={tool.path}
              type="button"
              className="dash-admin-tool-card"
              style={{ '--tool-color': tool.color, '--tool-soft': tool.soft, '--tool-accent': tool.accent, '--tool-order': index }}
              onClick={() => navigate(tool.path)}
            >
              <span className={`dash-admin-tool-icon ${tool.permission === 'data_analytics' ? 'dash-neha-icon' : tool.permission === 'data_library' ? 'dash-library-image' : tool.permission === 'outreach' ? 'dash-outreach-image' : tool.permission === 'lead_search' ? 'dash-lead-image' : ''}`}>{tool.permission === 'data_analytics' ? <img src="/images/neha-portrait.png" alt="Neha, your NexG AI analyst" /> : tool.permission === 'data_library' ? <img src="/images/data-library-card.png" alt="Data analysis charts and a magnifying glass" /> : tool.permission === 'outreach' ? <img src="/images/outreach-card.png" alt="Business handshake and communication bubbles" /> : tool.permission === 'lead_search' ? <img src="/images/lead-search-card.png" alt="Magnifying glass finding a person in a business network" /> : <Icon size={23} />}</span><ArrowRight className="dash-tool-arrow" size={17} />
              <span className="dash-admin-tool-copy">
                <strong>{tool.label}</strong>
                <small>{tool.description}</small>
              </span>
            </button>;
          })}
          {!visibleTools.length && <p className="dash-empty">No tools match your search.</p>}
        </div>
      </section>}

      {activity.error && <p className="dash-load-error" role="status">{activity.error}</p>}
      <div className="dash-summary-grid">
        <section className="dash-summary-panel"><div className="dash-summary-head"><h2>Search overview</h2><span>Last 7 days</span></div>
          {activity.loading ? <p className="dash-empty">Loading activity?</p> : !activity.searches ? <p className="dash-empty">Search history is unavailable.</p> : <>
            <div className="dash-usage-total"><strong>{days.reduce((sum, day) => sum + day.count, 0)}</strong><span>Searches this week</span></div>
            <div className="dash-week-bars" aria-label="Searches over the last seven days">{days.map((day, index) => <div key={index} title={`${day.label}: ${day.count} searches`}><span>{day.count}</span><i style={{ height: `${Math.max(2, day.count / Math.max(1, ...days.map((item) => item.count)) * 70)}px` }} /><small>{day.label}</small></div>)}</div>
          </>}
        </section>
        <section className="dash-summary-panel"><div className="dash-summary-head"><h2>Recent activity</h2><span>Latest updates</span></div>
          {activity.loading ? <p className="dash-empty">Loading activity?</p> : recent.length ? <div className="dash-activity-list">{recent.map((item) => <button key={item.id} type="button" onClick={() => navigate(item.path)}><span className="dash-activity-icon"><item.icon size={16} /></span><span><strong>{item.title}</strong><small>{item.type}</small></span><time>{Number.isNaN(new Date(item.date).getTime()) ? '' : new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time></button>)}</div> : <p className="dash-empty">Your searches and uploaded datasets will appear here.</p>}
        </section>
        <section className="dash-summary-panel"><div className="dash-summary-head"><h2>Workspace at a glance</h2><span>All activity</span></div><div className="dash-stat-grid">
          <div><Search size={20} /><span><strong>{stat(activity.searches?.length)}</strong><small>Saved searches</small></span></div>
          <div><Database size={20} /><span><strong>{stat(activity.datasets?.length)}</strong><small>Datasets</small></span></div>
          <div><BarChart3 size={20} /><span><strong>{stat(activity.datasets?.reduce((sum, item) => sum + Number(item.row_count || 0), 0))}</strong><small>Uploaded rows</small></span></div>
          <div><Send size={20} /><span><strong>{adminTools.filter((tool) => userPermissions.includes(tool.permission)).length}</strong><small>Available tools</small></span></div>
        </div></section>
      </div>
      <footer className="dash-sustainable-footer"><Leaf size={18} /><span>Empowering better decisions through intelligent tools.</span><strong>NEXG <span>Tools</span></strong></footer>


    </div>
  );
};

export default Dashboard;
