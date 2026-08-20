import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Database,
  Loader2,
  MoreVertical,
  Search,
  Send,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL, authHeaders } from '../auth';
import nexgToolLogo from '../assets/nexgtool-removebg-preview.png';
import './Dashboard.css';

const SOURCE_COLORS = ['#f97316', '#fb923c', '#fdba74', '#ea580c', '#c2410c', '#9a3412'];
const permissionLabels = {
  lead_search: 'Lead Search',
  lead_search_history: 'Lead Search History',
  business_search: 'Business Search',
  business_search_history: 'Business Search History',
  outreach: 'Business Outreach',
  data_library: 'Data Library',
  exports: 'CSV History',
  settings: 'Settings',
};

const allDashboardPermissions = Object.keys(permissionLabels);

const adminTools = [
  { label: 'Lead Search', description: 'Find business leads', path: '/lead-search', icon: Users, color: '#f97316' },
  { label: 'Business Search', description: 'Discover businesses', path: '/business-search', icon: Building2, color: '#ea580c' },
  { label: 'Business Outreach', description: 'Generate and send outreach', path: '/business-outreach', icon: Send, color: '#f97316' },
  { label: 'Data Library', description: 'Search uploaded data', path: '/data-library', icon: Database, color: '#c2410c' },
];

const dateValue = (item) => new Date(item.created_at).getTime();

const formatDate = (value) => new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}).format(new Date(value));

const sourceValue = (source) => {
  if (typeof source === 'string' || typeof source === 'number') return String(source);
  if (source && typeof source === 'object') {
    return String(source.label || source.source_label || source.name || source.id || source.source || 'Business Search');
  }
  return 'Business Search';
};

const labelSource = (source) => sourceValue(source)
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase())
  .replace('Google Maps', 'Google Maps');

const Dashboard = ({ user }) => {
  const navigate = useNavigate();
  const [leadHistory, setLeadHistory] = useState([]);
  const [businessHistory, setBusinessHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const firstName = user?.name?.split(' ')[0] || 'there';
  const userPermissions = user?.is_nexg_admin ? allDashboardPermissions : (user?.permissions || []);
  const grantedTools = userPermissions
    .filter((permission) => permissionLabels[permission])
    .map((permission) => permissionLabels[permission]);

  useEffect(() => {
    let active = true;
    const loadDashboard = async () => {
      setIsLoading(true);
      setError('');
      const endpoints = [
        ...(userPermissions.includes('lead_search_history') ? ['/api/search-history'] : []),
        ...(userPermissions.includes('business_search_history') ? ['/api/business-search/history'] : []),
      ];
      if (!endpoints.length) {
        setLeadHistory([]);
        setBusinessHistory([]);
        setIsLoading(false);
        return;
      }
      const results = await Promise.allSettled(endpoints.map(async (endpoint) => {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, { headers: authHeaders() });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Could not load dashboard activity.');
        return data.history || [];
      }));
      if (!active) return;
      const leadResult = results[endpoints.indexOf('/api/search-history')];
      const businessResult = results[endpoints.indexOf('/api/business-search/history')];
      if (leadResult?.status === 'fulfilled') setLeadHistory(leadResult.value);
      if (businessResult?.status === 'fulfilled') setBusinessHistory(businessResult.value);
      if (results.every((result) => result.status === 'rejected')) {
        setError('Live dashboard data could not be loaded. Please refresh to try again.');
      } else if (results.some((result) => result.status === 'rejected')) {
        setError('Some dashboard activity is temporarily unavailable.');
      }
      setIsLoading(false);
    };
    loadDashboard();
    return () => { active = false; };
  }, [userPermissions]);

  const dashboard = useMemo(() => {
    const all = [
      ...leadHistory.map((item) => ({ ...item, type: 'lead', sourceLabel: 'Google Maps' })),
      ...businessHistory.map((item) => ({
        ...item,
        type: 'business',
        sourceLabel: labelSource(item.source || item.sources?.[0] || 'Business Search'),
      })),
    ].sort((a, b) => dateValue(b) - dateValue(a));
    const sourceCounts = new Map();
    leadHistory.forEach(() => sourceCounts.set('Google Maps', (sourceCounts.get('Google Maps') || 0) + 1));
    businessHistory.forEach((item) => {
      const sources = item.sources?.length ? item.sources : [item.source || 'business_search'];
      sources.forEach((source) => {
        const label = labelSource(source);
        const count = source && typeof source === 'object'
          ? Math.max(Number(source.count) || 0, 0)
          : 1;
        if (count > 0) sourceCounts.set(label, (sourceCounts.get(label) || 0) + count);
      });
    });
    const sources = [...sourceCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    const sourceTotal = sources.reduce((sum, item) => sum + item.count, 0);
    return { recent: all.slice(0, 7), sources, sourceTotal };
  }, [leadHistory, businessHistory]);

  return (
    <div className="dash-page dash-live">
      <div className="dash-heading">
        <img className="dash-brand-logo" src={nexgToolLogo} alt="NexG Tools" />
        <div>
          <h1>Welcome back, {firstName}! <span aria-hidden="true">👋</span></h1>
          <p>{user?.is_nexg_admin ? 'NexG Admin access is active across the entire workspace.' : 'Your workspace access has been verified by an administrator.'}</p>
        </div>
      </div>

      {!user?.is_nexg_admin && <section className="dash-panel dash-access-panel">
        <h2>You have access to</h2>
        {grantedTools.length ? <div className="dash-access-list">{grantedTools.map((tool) => <span key={tool}>{tool}</span>)}</div>
          : <p>No tools have been assigned yet. Please contact an administrator.</p>}
      </section>}

      {user?.is_nexg_admin && <section className="dash-admin-launcher" aria-label="NexG Admin tool launcher">
        <div className="dash-admin-tool-grid">
          {adminTools.map((tool, index) => {
            const Icon = tool.icon;
            return <button
              key={tool.path}
              type="button"
              className="dash-admin-tool-card"
              style={{ '--tool-color': tool.color, '--tool-order': index }}
              onClick={() => navigate(tool.path)}
            >
              <span className="dash-admin-tool-icon"><Icon size={23} /></span>
              <strong>{tool.label}</strong>
              <small>{tool.description}</small>
            </button>;
          })}
        </div>
      </section>}

      {error && <div className="dash-notice">{error}</div>}

      <div className="dash-bottom-grid">
        <section className="dash-panel dash-recent">
          <h2>Recent Searches</h2>
          <div className="dash-table-wrap">
            <table>
              <colgroup>
                <col className="dash-col-keyword" />
                <col className="dash-col-source" />
                <col className="dash-col-date" />
                <col className="dash-col-action" />
              </colgroup>
              <thead>
                <tr>
                  <th>Keyword / Name</th>
                  <th>Source</th>
                  <th>Date &amp; Time</th>
                  <th><span className="dash-visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan="4" className="dash-empty"><Loader2 className="dash-spin" size={18} /> Loading live activity…</td></tr>
                ) : dashboard.recent.length ? dashboard.recent.map((item) => (
                  <tr key={`${item.type}-${item.id}`}>
                    <td>
                      <span className="dash-row-icon"><Search size={15} /></span>
                      <span className="dash-keyword">{item.query_text || item.company_name || 'Untitled search'}</span>
                    </td>
                    <td>{item.sourceLabel}</td>
                    <td>{formatDate(item.created_at)}</td>
                    <td>
                      <button
                        type="button"
                        className="dash-row-action"
                        aria-label={`More options for ${item.query_text || item.company_name || 'search'}`}
                      >
                        <MoreVertical size={16} />
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="4" className="dash-empty">No search activity yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="dash-panel dash-sources">
          <h2>Top Sources</h2>
          {isLoading ? <div className="dash-empty"><Loader2 className="dash-spin" size={18} /> Loading sources…</div>
            : dashboard.sources.length ? (
              <div className="dash-source-content">
                <div className="dash-donut" style={{
                  background: `conic-gradient(${dashboard.sources.map((item, index) => {
                    const before = dashboard.sources.slice(0, index).reduce((sum, row) => sum + row.count, 0);
                    return `${SOURCE_COLORS[index]} ${(before / dashboard.sourceTotal) * 100}% ${((before + item.count) / dashboard.sourceTotal) * 100}%`;
                  }).join(', ')})`,
                }}><span>{dashboard.sourceTotal}</span></div>
                <div className="dash-source-list">
                  {dashboard.sources.map((item, index) => (
                    <div key={item.name}>
                      <i style={{ background: SOURCE_COLORS[index] }} />
                      <span>{item.name}</span>
                      <strong>{Math.round((item.count / dashboard.sourceTotal) * 100)}%</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : <div className="dash-empty">No source data yet.</div>}
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
