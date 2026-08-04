import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  BookOpen,
  Loader2,
  Megaphone,
  MoreVertical,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './Dashboard.css';

const DAY = 24 * 60 * 60 * 1000;
const SOURCE_COLORS = ['#7047eb', '#2478e5', '#18b981', '#ff9f1c', '#e43d91', '#708097'];
const quickTools = [
  { title: 'Lead Search', description: 'Find and discover potential leads across multiple sources.', icon: Search, color: '#6c47ff', bg: '#eee9ff', link: '/lead-search' },
  { title: 'Business Search', description: 'Search for businesses and access key company information.', icon: Building2, color: '#287be0', bg: '#e8f2ff', link: '/business-search' },
  { title: 'Knowledge Base', description: 'Explore internal documentation and guides.', icon: BookOpen, color: '#8061ee', bg: '#f0ecff', link: '/knowledge-base' },
  { title: 'Company Outreach', description: 'Manage company contacts and outreach activity.', icon: Megaphone, color: '#ec4899', bg: '#fceaf4', link: '/outreach' },
];

const startOfDay = (date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const dateValue = (item) => new Date(item.created_at).getTime();

const makeSeries = (records) => {
  const today = startOfDay(new Date());
  return Array.from({ length: 7 }, (_, index) => {
    const start = today.getTime() - (6 - index) * DAY;
    const end = start + DAY;
    return records.filter((item) => {
      const value = dateValue(item);
      return value >= start && value < end;
    }).length;
  });
};

const percentChange = (current, previous) => {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
};

const Sparkline = ({ values, color }) => {
  const width = 118;
  const height = 32;
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = 2 + index * ((width - 4) / Math.max(values.length - 1, 1));
    const y = height - 3 - (value / max) * (height - 8);
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg className="dash-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Last seven days activity">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

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

  useEffect(() => {
    let active = true;
    const loadDashboard = async () => {
      setIsLoading(true);
      setError('');
      const endpoints = ['/api/search-history', '/api/business-search/history'];
      const results = await Promise.allSettled(endpoints.map(async (endpoint) => {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, { headers: authHeaders() });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Could not load dashboard activity.');
        return data.history || [];
      }));
      if (!active) return;
      if (results[0].status === 'fulfilled') setLeadHistory(results[0].value);
      if (results[1].status === 'fulfilled') setBusinessHistory(results[1].value);
      if (results.every((result) => result.status === 'rejected')) {
        setError('Live dashboard data could not be loaded. Please refresh to try again.');
      } else if (results.some((result) => result.status === 'rejected')) {
        setError('Some dashboard activity is temporarily unavailable.');
      }
      setIsLoading(false);
    };
    loadDashboard();
    return () => { active = false; };
  }, []);

  const dashboard = useMemo(() => {
    const now = Date.now();
    const weekStart = startOfDay(new Date()).getTime() - 6 * DAY;
    const previousStart = weekStart - 7 * DAY;
    const all = [
      ...leadHistory.map((item) => ({ ...item, type: 'lead', sourceLabel: 'Google Maps' })),
      ...businessHistory.map((item) => ({
        ...item,
        type: 'business',
        sourceLabel: labelSource(item.source || item.sources?.[0] || 'Business Search'),
      })),
    ].sort((a, b) => dateValue(b) - dateValue(a));
    const current = (records) => records.filter((item) => dateValue(item) >= weekStart && dateValue(item) <= now);
    const previous = (records) => records.filter((item) => dateValue(item) >= previousStart && dateValue(item) < weekStart);
    const metric = (label, records, icon, color, bg, total = records.length) => ({
      label, total, icon, color, bg,
      series: makeSeries(records),
      change: percentChange(current(records).length, previous(records).length),
    });
    const metrics = [
      metric('Lead Searches', leadHistory, Search, '#6c47ff', '#eee9ff'),
      metric('Business Searches', businessHistory, Building2, '#287be0', '#e8f2ff'),
      metric('Total Searches', all, BarChart3, '#6c47ff', '#eee9ff'),
    ];
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
    return { metrics, recent: all.slice(0, 7), sources, sourceTotal };
  }, [leadHistory, businessHistory]);

  return (
    <div className="dash-page dash-live">
      <div className="dash-heading">
        <h1>Welcome back, {firstName}! <span aria-hidden="true">👋</span></h1>
        <p>Live activity from the last 7 days and all-time totals.</p>
      </div>

      {error && <div className="dash-notice">{error}</div>}

      <section className="dash-metrics" aria-label="Search activity">
        {dashboard.metrics.map((metric) => {
          const TrendIcon = metric.change < 0 ? TrendingDown : TrendingUp;
          return (
            <article
              className="dash-metric-card"
              key={metric.label}
              style={{ '--metric-color': metric.color, '--metric-soft': metric.bg }}
            >
              <div className="dash-metric-top">
                <div className="dash-metric-icon" style={{ color: metric.color, background: metric.bg }}>
                  <metric.icon size={23} />
                </div>
                <div>
                  <span>{metric.label}</span>
                  <strong>{isLoading ? '—' : metric.total.toLocaleString()}</strong>
                </div>
              </div>
              <div className={`dash-change ${metric.change < 0 ? 'is-down' : ''}`}>
                <TrendIcon size={12} />
                <b>{Math.abs(metric.change)}%</b>
                <span>vs previous 7 days</span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="dash-panel dash-quick-panel">
        <h2>Quick Access Tools</h2>
        <div className="dash-quick-grid">
          {quickTools.map((tool) => (
            <button
              type="button"
              className={`dash-quick-card ${tool.link ? '' : 'is-disabled'}`}
              key={tool.title}
              onClick={() => tool.link && navigate(tool.link)}
              style={{ '--tool-color': tool.color, '--tool-soft': tool.bg }}
            >
              <div className="dash-quick-icon" style={{ color: tool.color, background: tool.bg }}>
                <tool.icon size={28} />
              </div>
              <strong>{tool.title}</strong>
              <p>{tool.description}</p>
              {!tool.link && <span>Coming soon</span>}
            </button>
          ))}
        </div>
      </section>

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
