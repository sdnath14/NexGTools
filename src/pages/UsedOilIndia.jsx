import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bot, ChevronLeft, ChevronRight, Database, Edit3, Loader2, MessageCircle, Plus, RefreshCw, Save, Search, Send, Table2, Trash2, X } from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './UsedOilIndia.css';

const PAGE_SIZE = 50;
const CHAT_RESULT_STEP = 25;
const displayName = (name) => String(name || '').replace(/^uoi_/, '').replaceAll('_', ' ');
const messageOf = (detail, fallback) => typeof detail === 'string' ? detail : detail?.message || fallback;

export default function UsedOilIndia() {
  const [tables, setTables] = useState([]);
  const [schemaSummary, setSchemaSummary] = useState(null);
  const [table, setTable] = useState('');
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatVisibleRows, setChatVisibleRows] = useState({});
  const [chatting, setChatting] = useState(false);

  const primaryKey = useMemo(() => columns.find((column) => column.column_key === 'PRI')?.column_name, [columns]);
  const visibleColumns = useMemo(() => columns.slice(0, 10), [columns]);

  const loadTables = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/used-oil-india/tables`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(messageOf(data.detail, 'Could not load Used Oil India tables.'));
      const summaryResponse = await fetch(`${API_BASE_URL}/api/used-oil-india/schema-summary`, { headers: authHeaders() });
      const summaryData = await summaryResponse.json();
      if (!summaryResponse.ok) throw new Error(messageOf(summaryData.detail, 'Could not load schema summary.'));
      setTables(data.tables || []);
      setSchemaSummary(summaryData.summary || null);
      setTable((current) => current || data.tables?.[0]?.table_name || data.tables?.[0]?.TABLE_NAME || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadRows = async () => {
    if (!table) return;
    setRowsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (search) params.set('search', search);
      const response = await fetch(`${API_BASE_URL}/api/used-oil-india/tables/${table}/rows?${params}`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(messageOf(data.detail, 'Could not load table rows.'));
      setColumns(data.columns || []);
      setRows(data.rows || []);
      setTotal(Number(data.total || 0));
    } catch (err) {
      setError(err.message);
    } finally {
      setRowsLoading(false);
    }
  };

  useEffect(() => { loadTables(); }, []);
  useEffect(() => { setOffset(0); setCreating(false); setEditing(null); setDraft({}); }, [table, search]);
  useEffect(() => { loadRows(); }, [table, offset, search]);

  const openCreate = () => {
    const empty = {};
    columns.forEach((column) => { empty[column.column_name] = ''; });
    setDraft(empty);
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (row) => {
    setDraft({ ...row });
    setCreating(false);
    setEditing(row);
  };

  const closeEditor = () => {
    setDraft({});
    setEditing(null);
    setCreating(false);
  };

  const submitSearch = (event) => {
    event.preventDefault();
    setSearch(pendingSearch.trim());
  };

  const saveRow = async () => {
    setSaving(true);
    setError('');
    try {
      const url = editing ? `${API_BASE_URL}/api/used-oil-india/tables/${table}/rows/${encodeURIComponent(editing[primaryKey])}` : `${API_BASE_URL}/api/used-oil-india/tables/${table}/rows`;
      const response = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: draft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(messageOf(data.detail, 'Could not save this row.'));
      closeEditor();
      await loadRows();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (row) => {
    if (!primaryKey || !window.confirm(`Delete this row from ${displayName(table)}?`)) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/used-oil-india/tables/${table}/rows/${encodeURIComponent(row[primaryKey])}`, { method: 'DELETE', headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(messageOf(data.detail, 'Could not delete this row.'));
      await loadRows();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const askOlivia = async (event) => {
    event.preventDefault();
    const question = chatQuestion.trim();
    if (!question || chatting) return;
    const nextMessages = [...chatMessages, { role: 'user', content: question }];
    setChatMessages(nextMessages);
    setChatQuestion('');
    setChatting(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/used-oil-india/chat`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          table_name: table,
          history: chatMessages.slice(-6).map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(messageOf(data.detail, 'Olivia could not answer right now.'));
      setChatMessages([...nextMessages, { role: 'assistant', content: data.answer, sql: data.sql, rows: data.rows || [] }]);
      setChatVisibleRows((current) => ({ ...current, [nextMessages.length]: CHAT_RESULT_STEP }));
    } catch (err) {
      setError(err.message);
      setChatMessages([...nextMessages, { role: 'assistant', content: err.message }]);
    } finally {
      setChatting(false);
    }
  };

  return (
    <div className="uoi-page">
      <header className="uoi-header">
        <div>
          <h1>Used Oil India Data</h1>
          <p>Browse, add, edit, and delete records imported from the Used Oil India database.</p>
        </div>
        <button type="button" className="uoi-primary" onClick={openCreate} disabled={!columns.length || rowsLoading}>
          <Plus size={16} /> Add row
        </button>
      </header>

      <section className="uoi-schema-summary" aria-label="Used Oil India schema summary">
        <div><strong>{schemaSummary ? schemaSummary.table_count.toLocaleString() : tables.length.toLocaleString()}</strong><span>Tables</span></div>
        <div><strong>{schemaSummary ? schemaSummary.column_count.toLocaleString() : '-'}</strong><span>Columns</span></div>
        <div><strong>{schemaSummary ? schemaSummary.relationship_count.toLocaleString() : '-'}</strong><span>Relationships</span></div>
        <div><strong>{schemaSummary ? Number(schemaSummary.estimated_rows || 0).toLocaleString() : '-'}</strong><span>Estimated rows</span></div>
      </section>

      {error && <div className="uoi-alert"><AlertCircle size={17} /> {error}</div>}

      <div className="uoi-shell">
        <aside className="uoi-table-list">
          <div className="uoi-panel-head"><strong>Tables</strong><button type="button" onClick={loadTables} title="Refresh tables"><RefreshCw size={15} /></button></div>
          {loading ? <p className="uoi-muted">Loading tables...</p> : tables.map((item) => {
            const tableName = item.table_name || item.TABLE_NAME;
            return (
            <button key={tableName} type="button" className={tableName === table ? 'active' : ''} onClick={() => setTable(tableName)}>
              <Database size={15} /><span>{displayName(tableName)}</span><small>{Number(item.estimated_rows || 0).toLocaleString()}</small>
            </button>
          ); })}
        </aside>

        <section className="uoi-data-panel">
          <div className="uoi-toolbar">
            <div><h2>{table ? displayName(table) : 'Select a table'}</h2><span>{total.toLocaleString()} rows</span></div>
            <form onSubmit={submitSearch} className="uoi-search"><Search size={16} /><input value={pendingSearch} onChange={(event) => setPendingSearch(event.target.value)} placeholder="Search this table" /><button type="submit">Search</button></form>
          </div>
          <div className="uoi-table-wrap">
            {rowsLoading ? <div className="uoi-empty"><Loader2 className="spin" size={20} /> Loading rows...</div> : rows.length ? (
              <table>
                <thead><tr><th>Actions</th>{visibleColumns.map((column) => <th key={column.column_name}>{column.column_name}</th>)}</tr></thead>
                <tbody>{rows.map((row, index) => <tr key={`${row[primaryKey] || index}`}>
                  <td className="uoi-actions"><button type="button" onClick={() => openEdit(row)} title="Edit row"><Edit3 size={15} /></button><button type="button" onClick={() => deleteRow(row)} title="Delete row" disabled={!primaryKey || saving}><Trash2 size={15} /></button></td>
                  {visibleColumns.map((column) => <td key={column.column_name} title={row[column.column_name] || ''}>{row[column.column_name] == null ? '' : String(row[column.column_name])}</td>)}
                </tr>)}</tbody>
              </table>
            ) : <div className="uoi-empty">No rows found.</div>}
          </div>
          <div className="uoi-pagination">
            <button type="button" onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0 || rowsLoading}><ChevronLeft size={16} /> Previous</button>
            <span>{total ? `${offset + 1}-${Math.min(offset + PAGE_SIZE, total)} of ${total}` : '0 rows'}</span>
            <button type="button" onClick={() => setOffset(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total || rowsLoading}>Next <ChevronRight size={16} /></button>
          </div>
        </section>
      </div>

      {(creating || editing) && <div className="uoi-modal" role="dialog" aria-modal="true">
        <div className="uoi-editor">
          <div className="uoi-editor-head"><h2>{editing ? 'Edit row' : 'Add row'}</h2><button type="button" onClick={closeEditor} title="Close"><X size={18} /></button></div>
          <div className="uoi-form-grid">
            {columns.map((column) => <label key={column.column_name}>
              <span>{column.column_name}{column.column_name === primaryKey ? ' *' : ''}</span>
              <textarea rows={String(draft[column.column_name] || '').length > 80 ? 4 : 1} value={draft[column.column_name] ?? ''} disabled={editing && column.column_name === primaryKey} onChange={(event) => setDraft((current) => ({ ...current, [column.column_name]: event.target.value }))} />
            </label>)}
          </div>
          <div className="uoi-editor-actions"><button type="button" onClick={closeEditor}>Cancel</button><button type="button" className="uoi-primary" onClick={saveRow} disabled={saving}>{saving ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Save</button></div>
        </div>
      </div>}

      <button type="button" className={`uoi-neha-button ${chatOpen ? 'is-open' : ''}`} onClick={() => setChatOpen((value) => !value)} title="Ask Olivia">
        <img src="/images/neha-portrait.png" alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
        <span><MessageCircle size={15} /> Ask Olivia</span>
      </button>

      {chatOpen && <aside className="uoi-chat" aria-label="Used Oil India chatbot">
        <header className="uoi-chat-head">
          <div className="uoi-chat-identity"><span><img src="/images/neha-portrait.png" alt="" /><Bot size={18} /></span><div><h2>Olivia</h2><p>Used Oil India assistant</p></div></div>
          <button type="button" onClick={() => setChatOpen(false)} title="Close chat"><X size={18} /></button>
        </header>
        <div className="uoi-chat-context"><Table2 size={14} /> Full database mode · {schemaSummary ? `${schemaSummary.table_count} tables, ${schemaSummary.column_count} columns` : 'schema loading'}{table ? ` · viewing ${displayName(table)}` : ''}</div>
        <div className="uoi-chat-log">
          {!chatMessages.length && <div className="uoi-chat-welcome"><strong>Ask me about the full database.</strong><span>Olivia checks all Used Oil India tables, columns, and relationships before writing SQL.</span></div>}
          {chatMessages.map((message, index) => {
            const resultColumns = message.rows?.[0] ? Object.keys(message.rows[0]) : [];
            const visibleCount = chatVisibleRows[index] || CHAT_RESULT_STEP;
            const visibleRows = message.rows?.slice(0, visibleCount) || [];
            const hasMoreRows = message.rows?.length > visibleRows.length;
            return <article key={index} className={`uoi-chat-message ${message.role}`}>
              <p>{message.content}</p>
              {message.rows?.length > 0 && <div className="uoi-chat-result">
                <table><thead><tr>{resultColumns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{visibleRows.map((row, rowIndex) => <tr key={rowIndex}>{resultColumns.map((column) => <td key={column}>{row[column] == null ? '' : String(row[column])}</td>)}</tr>)}</tbody></table>
                <div className="uoi-chat-result-more"><span>Showing {visibleRows.length.toLocaleString()} of {message.rows.length.toLocaleString()} rows</span>{hasMoreRows && <button type="button" onClick={() => setChatVisibleRows((current) => ({ ...current, [index]: Math.min(message.rows.length, visibleCount + CHAT_RESULT_STEP) }))}>Show more</button>}</div>
              </div>}
            </article>;
          })}
          {chatting && <div className="uoi-chat-thinking"><img src="/images/neha-portrait.png" alt="" /><span>Olivia is checking the database</span><Loader2 className="spin" size={15} /></div>}
        </div>
        <form className="uoi-chat-form" onSubmit={askOlivia}>
          <textarea rows={2} value={chatQuestion} onChange={(event) => setChatQuestion(event.target.value)} placeholder="Ask anything about Used Oil India data..." onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} />
          <button type="submit" disabled={!chatQuestion.trim() || chatting} title="Send"><Send size={17} /></button>
        </form>
      </aside>}
    </div>
  );
}
