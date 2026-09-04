import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Bot,
  Database,
  FileSpreadsheet,
  Loader2,
  Send,
  Table2,
  Upload,
  Users,
} from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './DataAnalytics.css';

const ACCEPTED = '.csv,.xls,.xlsx,.xlsm';

const formatNumber = (value) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(Number(value || 0));
const formatMoney = (value) => {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 10000000) return `INR ${formatNumber(amount / 10000000)} Cr`;
  if (Math.abs(amount) >= 100000) return `INR ${formatNumber(amount / 100000)} L`;
  return `INR ${formatNumber(amount)}`;
};

const resultColumns = (rows) => rows?.length ? Object.keys(rows[0]) : [];
const errorMessage = (detail, fallback) => {
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (detail.message && detail.sql) return `${detail.message}\nSQL: ${detail.sql}`;
  if (detail.message) return detail.message;
  return fallback;
};

const DataAnalytics = () => {
  const picker = useRef(null);
  const [datasets, setDatasets] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [summary, setSummary] = useState(null);
  const [activeTable, setActiveTable] = useState('');
  const [preview, setPreview] = useState(null);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [chatting, setChatting] = useState(false);
  const [error, setError] = useState('');

  const loadDatasets = async (selectLatest = false) => {
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/analytics/datasets`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(errorMessage(data.detail, 'Could not load analytics datasets.'));
      const items = data.datasets || [];
      setDatasets(items);
      if ((selectLatest || !selectedId) && items[0]) setSelectedId(String(items[0].id));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDatasets(); }, []);

  useEffect(() => {
    if (!selectedId) {
      setSummary(null);
      setPreview(null);
      return;
    }
    let active = true;
    const loadSummary = async () => {
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/api/analytics/datasets/${selectedId}/summary`, { headers: authHeaders() });
        const data = await response.json();
        if (!response.ok) throw new Error(errorMessage(data.detail, 'Could not load analytics summary.'));
        if (!active) return;
        setSummary(data);
        const firstTable = data.schema?.tables?.[0]?.table_name || '';
        setActiveTable((current) => current || firstTable);
      } catch (summaryError) {
        if (active) setError(summaryError.message);
      }
    };
    loadSummary();
    return () => { active = false; };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !activeTable) return;
    let active = true;
    const loadPreview = async () => {
      try {
        const table = summary?.schema?.tables?.find((item) => item.table_name === activeTable);
        const limit = Math.max(Number(table?.row_count || 5000), 1);
        const response = await fetch(`${API_BASE_URL}/api/analytics/datasets/${selectedId}/tables/${activeTable}/preview?limit=${limit}`, { headers: authHeaders() });
        const data = await response.json();
        if (!response.ok) throw new Error(errorMessage(data.detail, 'Could not load table preview.'));
        if (active) setPreview(data);
      } catch (previewError) {
        if (active) setError(previewError.message);
      }
    };
    loadPreview();
    return () => { active = false; };
  }, [selectedId, activeTable, summary]);

  const uploadDataset = async (files) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`${API_BASE_URL}/api/analytics/datasets`, { method: 'POST', headers: authHeaders(), body });
      const data = await response.json();
      if (!response.ok) throw new Error(errorMessage(data.detail, 'Could not upload dataset.'));
      setSelectedId(String(data.dataset.id));
      setActiveTable(data.dataset.tables?.[0]?.table_name || '');
      setMessages([]);
      await loadDatasets();
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
      if (picker.current) picker.current.value = '';
    }
  };

  const dashboard = useMemo(() => {
    const metrics = summary?.metrics || {};
    return {
      revenue: metrics.revenue,
      quantity: metrics.quantity,
      customers: metrics.customers,
      productMix: metrics.product_mix || [],
      trend: metrics.trend || [],
    };
  }, [summary]);

  const ask = async (event) => {
    event.preventDefault();
    if (!question.trim() || !selectedId || chatting) return;
    const nextMessages = [...messages, { role: 'user', content: question.trim() }];
    setMessages(nextMessages);
    setQuestion('');
    setChatting(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/analytics/chat`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: Number(selectedId), question: question.trim(), history: messages.slice(-6) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(errorMessage(data.detail, 'Could not ask the dataset.'));
      setMessages([...nextMessages, { role: 'assistant', content: data.answer, sql: data.sql, rows: data.rows || [] }]);
    } catch (chatError) {
      setError(chatError.message);
      setMessages(nextMessages);
    } finally {
      setChatting(false);
    }
  };

  const selectedDataset = datasets.find((dataset) => String(dataset.id) === String(selectedId));
  const previewColumns = preview?.table?.columns?.length
    ? ['__row_id', ...preview.table.columns.map((column) => column.name)]
    : (preview?.rows?.length ? Object.keys(preview.rows[0]) : []);
  const trendMax = Math.max(...dashboard.trend.map((item) => item.value), 1);
  const productTotal = dashboard.productMix.reduce((sum, item) => sum + item.value, 0) || 1;

  return (
    <div className="analytics-page">
      <header className="analytics-header">
        <div>
          <h1>Business Analytics Platform</h1>
          <p>Upload Excel data, store it in MySQL, and ask business questions in plain language.</p>
        </div>
        <div className="analytics-header-actions">
          <select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setActiveTable(''); setMessages([]); }}>
            <option value="">Choose dataset</option>
            {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.filename}</option>)}
          </select>
          <input ref={picker} type="file" accept={ACCEPTED} hidden onChange={(event) => uploadDataset(event.target.files)} />
          <button type="button" onClick={() => picker.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="spin" size={17} /> : <Upload size={17} />}
            Upload data
          </button>
        </div>
      </header>

      {error && <div className="analytics-alert"><AlertCircle size={17} />{error}</div>}

      <div className="analytics-shell">
        <aside className="analytics-nav">
          {[
            ['Dashboard', BarChart3],
            ['Upload Data', FileSpreadsheet],
            ['Customers', Users],
            ['Products', Database],
            ['Reports', Table2],
            ['AI Analyst', Bot],
          ].map(([label, Icon]) => <button key={label} type="button"><Icon size={17} />{label}</button>)}
        </aside>

        <section className="analytics-main">
          {loading ? (
            <div className="analytics-empty"><Loader2 className="spin" /> Loading analytics...</div>
          ) : selectedDataset ? (
            <>
              <div className="analytics-kpis">
                <div><span>Revenue</span><strong>{dashboard.revenue != null ? formatMoney(dashboard.revenue) : 'No column'}</strong><small>Calculated from all stored rows</small></div>
                <div><span>Quantity</span><strong>{dashboard.quantity != null ? formatNumber(dashboard.quantity) : 'No column'}</strong><small>Calculated from all stored rows</small></div>
                <div><span>Customers</span><strong>{dashboard.customers != null ? formatNumber(dashboard.customers) : 'No column'}</strong><small>{selectedDataset.row_count} rows in MySQL</small></div>
              </div>

              <div className="analytics-grid">
                <section className="analytics-panel analytics-trend">
                  <div className="analytics-panel-head"><h2>Sales Trend</h2><span>{selectedDataset.filename}</span></div>
                  {dashboard.trend.length ? <div className="analytics-bars">{dashboard.trend.map((item) => <div key={item.label}><i style={{ height: `${Math.max(8, (item.value / trendMax) * 100)}%` }} /><span>{item.label}</span></div>)}</div> : <div className="analytics-empty">Ask the analyst for trends, or upload data with date and sales columns.</div>}
                </section>

                <section className="analytics-panel">
                  <div className="analytics-panel-head"><h2>Product Mix</h2><span>{summary?.schema?.tables?.length || 0} tables</span></div>
                  {dashboard.productMix.length ? <div className="analytics-mix">{dashboard.productMix.map((item) => <div key={item.label}><span>{item.label}</span><strong>{Math.round((item.value / productTotal) * 100)}%</strong><i style={{ width: `${Math.max(4, (item.value / productTotal) * 100)}%` }} /></div>)}</div> : <div className="analytics-empty">Product columns will appear here after upload.</div>}
                </section>
              </div>

              <section className="analytics-panel">
                <div className="analytics-panel-head">
                  <div><h2>MySQL Tables</h2><span>Showing {preview?.returned_rows || 0} of {preview?.total_rows || 0} rows with all stored columns.</span></div>
                  <select value={activeTable} onChange={(event) => setActiveTable(event.target.value)}>
                    {summary?.schema?.tables?.map((table) => <option key={table.table_name} value={table.table_name}>{table.sheet_name}</option>)}
                  </select>
                </div>
                <div className="analytics-table-wrap">
                  <table>
                    <thead><tr>{previewColumns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                    <tbody>{(preview?.rows || []).map((row, index) => <tr key={index}>{previewColumns.map((column) => <td key={column}>{row[column] == null ? '' : String(row[column])}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <div className="analytics-empty"><FileSpreadsheet size={32} /> Upload an Excel workbook to create your analytics database.</div>
          )}
        </section>
      </div>

      <section className="analytics-chat">
        <div className="analytics-chat-log">
          {messages.length ? messages.map((message, index) => (
            <div key={index} className={`analytics-message ${message.role}`}>
              <p>{message.content}</p>
              {message.sql && <code>{message.sql}</code>}
              {!!message.rows?.length && (
                <div className="analytics-result-table">
                  <table>
                    <thead>
                      <tr>{resultColumns(message.rows).map((column) => <th key={column}>{column}</th>)}</tr>
                    </thead>
                    <tbody>
                      {message.rows.slice(0, 20).map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {resultColumns(message.rows).map((column) => <td key={column}>{row[column] == null ? '' : String(row[column])}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {message.rows.length > 20 && <span>{message.rows.length - 20} more rows returned by SQL.</span>}
                </div>
              )}
            </div>
          )) : <span>Ask your data: Why did sales fall in August?</span>}
          {chatting && <div className="analytics-message assistant"><Loader2 className="spin" size={16} /> Thinking with SQL...</div>}
        </div>
        <form onSubmit={ask} className="analytics-chat-form">
          <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask your data..." disabled={!selectedId} />
          <button disabled={!question.trim() || !selectedId || chatting}>{chatting ? <Loader2 className="spin" size={17} /> : <Send size={17} />} Send</button>
        </form>
      </section>
    </div>
  );
};

export default DataAnalytics;
