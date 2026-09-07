import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowUp, ArrowUpRight, BarChart3, Bot, Check, Copy, Database, FileSpreadsheet, Loader2, Pause, Play, Plus, Sparkles, Table2, ThumbsDown, ThumbsUp, TrendingUp, Trash2, Upload, X } from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './DataAnalytics.css';

const ACCEPTED = '.csv,.xls,.xlsx,.xlsm';
const SUGGESTIONS = [
  { icon: BarChart3, title: 'See the big picture', text: 'Summarize this dataset and highlight the most important business insights.' },
  { icon: TrendingUp, title: 'Find the trends', text: 'What trends or unusual changes can you find in this data?' },
  { icon: Table2, title: 'Discover top performers', text: 'Which products or customers are the top performers in this dataset?' },
];
const errorMessage = (detail, fallback) => typeof detail === 'string' ? detail : detail?.message || fallback;

function NehaPortrait({ variant = 'portrait', className = '' }) {
  const [unavailable, setUnavailable] = useState(false);
  return <span className={`neha-portrait neha-${variant} ${className}`}>
    {unavailable ? <Bot aria-hidden="true" /> : <img src={`/images/neha-${variant}.png`} alt={variant === 'portrait' ? 'Neha from NexG Analyst, facing forward' : 'Neha from NexG Analyst presenting an analytics chart'} onError={() => setUnavailable(true)} />}
  </span>;
}

function ResultTable({ rows }) {
  if (!rows?.length) return null;
  const columns = Object.keys(rows[0]);
  return <div className="analyst-result-table" tabIndex={0} aria-label="Query results">
    <table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
      <tbody>{rows.slice(0, 50).map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{row[column] == null ? '' : String(row[column])}</td>)}</tr>)}</tbody>
    </table>
    {rows.length > 50 && <p>Showing the first 50 of {rows.length} returned rows.</p>}
  </div>;
}

const DataAnalytics = () => {
  const picker = useRef(null);
  const composer = useRef(null);
  const log = useRef(null);
  const requestVersion = useRef(0);
  const copyTimer = useRef(null);
  const [datasets, setDatasets] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [summary, setSummary] = useState(null);
  const [activeTable, setActiveTable] = useState('');
  const [preview, setPreview] = useState(null);
  const [showData, setShowData] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = uploading || deleting;
  const [chatting, setChatting] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(null);
  const [notice, setNotice] = useState('');
  const [motionPaused, setMotionPaused] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/analytics/datasets`, { headers: authHeaders() });
        const data = await response.json();
        if (!response.ok) throw new Error(errorMessage(data.detail, 'Could not load datasets.'));
        if (active) {
          setDatasets(data.datasets || []);
          setSelectedId(data.datasets?.[0] ? String(data.datasets[0].id) : '');
        }
      } catch (err) { if (active) setError(err.message); }
      finally { if (active) setLoading(false); }
    };
    load();
    return () => { active = false; requestVersion.current += 1; clearTimeout(copyTimer.current); };
  }, []);

  useEffect(() => {
    setSummary(null);
    setActiveTable('');
    setPreview(null);
    if (!selectedId) return;
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/analytics/datasets/${selectedId}/summary`, { headers: authHeaders() });
        const data = await response.json();
        if (!response.ok) throw new Error(errorMessage(data.detail, 'Could not load dataset details.'));
        if (active) { setSummary(data); setActiveTable(data.schema?.tables?.[0]?.table_name || ''); }
      } catch (err) { if (active) setError(err.message); }
    };
    load();
    return () => { active = false; };
  }, [selectedId]);

  useEffect(() => {
    setPreview(null);
    setPreviewLoading(false);
    if (!showData || !selectedId || !activeTable) return;
    let active = true;
    setPreviewLoading(true);
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/analytics/datasets/${selectedId}/tables/${encodeURIComponent(activeTable)}/preview?limit=50`, { headers: authHeaders() });
        const data = await response.json();
        if (!response.ok) throw new Error(errorMessage(data.detail, 'Could not load table preview.'));
        if (active) setPreview(data);
      } catch (err) { if (active) setError(err.message); }
      finally { if (active) setPreviewLoading(false); }
    };
    load();
    return () => { active = false; };
  }, [selectedId, activeTable, showData]);

  useEffect(() => {
    if (log.current) {
      log.current.scrollTop = messages.length || chatting ? log.current.scrollHeight : 0;
    }
  }, [messages, chatting]);

  useEffect(() => {
    if (composer.current) {
      composer.current.style.height = 'auto';
      composer.current.style.height = `${Math.min(composer.current.scrollHeight, 160)}px`;
    }
  }, [question]);

  const resetChat = () => {
    requestVersion.current += 1;
    setMessages([]);
    setQuestion('');
    setChatting(false);
    setError('');
    setCopied(null);
    setNotice('');
    composer.current?.focus();
  };

  const uploadDataset = async (files) => {
    if (busy || chatting) return;
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
      resetChat();
      setDatasets((current) => [data.dataset, ...current.filter((item) => item.id !== data.dataset.id)]);
      setSelectedId(String(data.dataset.id));
    } catch (err) { setError(err.message); }
    finally { setUploading(false); if (picker.current) picker.current.value = ''; }
  };

  const removeDataset = async () => {
    if (!selectedDataset || busy || chatting) return;
    const target = selectedDataset;
    if (!window.confirm(`Permanently delete "${target.filename}"?\n\nThis removes all ${Number(target.row_count || 0).toLocaleString()} rows and ${target.table_count || 0} sheets from the database. This cannot be undone.`)) return;
    setDeleting(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/analytics/datasets/${target.id}`, { method: 'DELETE', headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(errorMessage(data.detail, 'Could not delete the dataset.'));
      const remaining = datasets.filter((dataset) => String(dataset.id) !== String(target.id));
      resetChat();
      setSummary(null);
      setActiveTable('');
      setPreview(null);
      setShowData(false);
      setDatasets(remaining);
      setSelectedId(remaining[0] ? String(remaining[0].id) : '');
      setNotice(`Deleted ${target.filename}.`);
    } catch (err) { setError(err.message); }
    finally { setDeleting(false); }
  };

  const ask = async (event) => {
    event.preventDefault();
    if (!question.trim() || !selectedId || !activeTable || !summary || Number(summary.schema?.dataset_id) !== Number(selectedId) || chatting || busy) return;
    const prompt = question.trim();
    const version = ++requestVersion.current;
    const nextMessages = [...messages, { role: 'user', content: prompt }];
    setMessages(nextMessages);
    setQuestion('');
    setChatting(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/analytics/chat`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_id: Number(selectedId),
          table_name: activeTable,
          question: prompt,
          history: messages.slice(-6).map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(errorMessage(data.detail, 'Could not ask the dataset.'));
      if (version === requestVersion.current) setMessages([...nextMessages, { role: 'assistant', content: data.answer, sql: data.sql, rows: data.rows || [] }]);
    } catch (err) {
      if (version === requestVersion.current) { setError(err.message); setQuestion(prompt); setMessages(messages); }
    } finally { if (version === requestVersion.current) setChatting(false); }
  };

  const copyAnswer = async (message, index) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(index);
      setNotice('Answer copied to clipboard.');
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 2000);
    } catch { setNotice('Could not copy. Please select the answer text and copy it manually.'); }
  };

  const rateAnswer = (index, feedback) => {
    setMessages((current) => current.map((message, i) => i === index ? { ...message, feedback: message.feedback === feedback ? null : feedback } : message));
    setNotice('Feedback updated for this conversation.');
  };
  const changeTable = (tableName) => {
    resetChat();
    setActiveTable(tableName);
  };
  const datasetReady = Boolean(summary && activeTable && Number(summary.schema?.dataset_id) === Number(selectedId));
  const selectedDataset = datasets.find((dataset) => String(dataset.id) === selectedId);
  const currentTable = summary?.schema?.tables?.find((table) => table.table_name === activeTable);
  const analystStatus = deleting ? 'Deleting dataset' : uploading ? 'Importing your dataset' : chatting ? 'Exploring your data' : loading ? 'Connecting to your workspace' : error ? 'Needs your attention' : selectedDataset ? (datasetReady ? 'Ready to explore' : 'Loading dataset details') : 'Waiting for a dataset';

  return <div className={`analytics-page ${motionPaused ? 'analyst-motion-paused' : ''}`}>
    <header className="analytics-header"><div><span className="analyst-eyebrow">NEXG WORKSPACE</span><h1>Chat with your database<span className="analyst-heading-dot">.</span></h1></div><div className="analyst-header-actions"><span className="analyst-header-note"><Sparkles size={15} /> Neha from NexG Analyst</span><button type="button" className="analyst-icon-button" title={motionPaused ? 'Resume animations' : 'Pause animations'} aria-label={motionPaused ? 'Resume animations' : 'Pause animations'} aria-pressed={motionPaused} onClick={() => setMotionPaused(!motionPaused)}>{motionPaused ? <Play size={16} /> : <Pause size={16} />}</button></div></header>
    <div className="analytics-shell">
      <section className="analytics-chat" aria-label="AI Analyst chat">
        <header className="analyst-chat-header"><div className="analyst-identity"><NehaPortrait className="analyst-avatar" /><div><h2>Neha <span>NEXG ANALYST</span></h2><p><span className={`analyst-status-dot ${error ? 'has-error' : ''}`} />{analystStatus}</p></div></div><button type="button" className="analyst-secondary" onClick={resetChat} disabled={busy}><Plus size={16} /> New chat</button></header>
        <div className="analyst-data-bar"><Database size={15} /><select aria-label="Choose dataset" value={selectedId} disabled={loading || busy || chatting} onChange={(event) => { resetChat(); setSelectedId(event.target.value); }}><option value="">{loading ? 'Loading datasets...' : 'Choose a dataset'}</option>{datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.filename}</option>)}</select>
          <button type="button" className="analyst-text-button" disabled={!datasetReady} aria-expanded={showData} aria-controls="analyst-data-preview" onClick={() => setShowData(!showData)}><Table2 size={15} /> {showData ? 'Hide data' : 'View data'}</button>
          <button type="button" className="analyst-text-button" onClick={() => picker.current?.click()} disabled={busy || loading || chatting}>{uploading ? <Loader2 size={15} className="spin" /> : <Upload size={15} />} {uploading ? 'Uploading...' : 'Upload data'}</button>
          <button type="button" className="analyst-text-button analyst-delete-button" onClick={removeDataset} disabled={!selectedDataset || loading || busy || chatting}>{deleting ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />} {deleting ? 'Deleting...' : 'Delete dataset'}</button>
          <input ref={picker} type="file" accept={ACCEPTED} hidden onChange={(event) => uploadDataset(event.target.files)} />
        </div>
        {showData && selectedId && <section className="analyst-data-preview" id="analyst-data-preview"><div><strong>Dataset preview</strong><select aria-label="Choose table" value={activeTable} disabled={!datasetReady || chatting || busy} onChange={(event) => changeTable(event.target.value)}>{summary?.schema?.tables?.map((table) => <option key={table.table_name} value={table.table_name}>{table.sheet_name}</option>)}</select><button className="analyst-icon-button" aria-label="Close dataset preview" onClick={() => setShowData(false)}><X size={16} /></button></div>{previewLoading || !summary ? <p role="status">Loading preview...</p> : <><p>{preview?.rows?.length || 0} preview rows of {preview?.total_rows || 0}. The analyst can query the full dataset.</p><ResultTable rows={preview?.rows} /></>}</section>}
        {error && <div className="analytics-alert" role="alert"><AlertCircle size={17} /><span>{error}</span><button type="button" className="analyst-icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
        <div ref={log} className={`analytics-chat-log ${messages.length ? 'has-messages' : ''}`} role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions text">
          {!messages.length && <div className="analyst-welcome">
            <div className="neha-welcome-stage"><NehaPortrait className="neha-greeting" /></div>
            <h3>A fresh perspective<br />on <em>your data.</em></h3>
            <p>{selectedDataset ? 'What would you like to discover today?' : 'Your next insight starts with a dataset.'}</p>
            <div className="analyst-suggestions">{SUGGESTIONS.map(({ icon: Icon, title, text }, index) => <button type="button" key={title} className={`analyst-prompt-${index}`} disabled={!datasetReady || loading || busy} onClick={() => { setQuestion(text); composer.current?.focus(); }}><span className="analyst-prompt-icon"><Icon size={19} /></span><strong>{title}</strong><span>{text}</span><ArrowUpRight className="analyst-suggestion-arrow" size={16} /></button>)}</div>
            {!selectedDataset && !loading && <button type="button" className="analyst-secondary" disabled={busy} onClick={() => picker.current?.click()}><FileSpreadsheet size={16} /> Upload dataset</button>}
          </div>}
          {messages.map((message, index) => <article key={index} className={`analytics-message ${message.role}`} aria-label={message.role === 'user' ? 'You' : 'AI Analyst'}>
            {message.role === 'assistant' && <NehaPortrait className="analyst-avatar" />}
            <div className="analyst-message-body"><p>{message.content}</p>{message.sql && <details className="analyst-sql"><summary>View query</summary><pre><code>{message.sql}</code></pre></details>}<ResultTable rows={message.rows} />
              {message.role === 'assistant' && <div className="analyst-message-actions"><button type="button" className="analyst-icon-button" title={copied === index ? 'Copied!' : 'Copy answer'} aria-label={copied === index ? 'Answer copied' : 'Copy answer'} onClick={() => copyAnswer(message, index)}>{copied === index ? <Check size={16} /> : <Copy size={16} />}</button><button type="button" className="analyst-icon-button" title="Like answer" aria-label="Like answer" aria-pressed={message.feedback === 'like'} onClick={() => rateAnswer(index, 'like')}><ThumbsUp size={16} /></button><button type="button" className="analyst-icon-button" title="Dislike answer" aria-label="Dislike answer" aria-pressed={message.feedback === 'dislike'} onClick={() => rateAnswer(index, 'dislike')}><ThumbsDown size={16} /></button>{copied === index && <span>Copied!</span>}</div>}
            </div>
          </article>)}
          {chatting && <div className="analyst-thinking" role="status"><NehaPortrait className="analyst-avatar" /><span>Neha is exploring your data</span><span className="neha-thinking-dots" aria-hidden="true"><i /><i /><i /></span></div>}
        </div>
        <footer className="analyst-composer-area"><form onSubmit={ask} className="analytics-chat-form"><textarea ref={composer} rows={1} aria-label="Message AI Analyst" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={datasetReady ? 'Ask Neha about your data...' : selectedId ? 'Waiting for dataset details...' : 'Choose or upload a dataset to begin...'} disabled={!datasetReady || busy} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} /><div className="analyst-composer-tools"><span><Database size={13} /> {datasetReady ? 'Dataset connected' : selectedId ? 'Dataset not ready' : 'No dataset connected'}</span><button type="submit" title="Send message" aria-label="Send message" disabled={!question.trim() || !datasetReady || chatting || busy}>{chatting ? <Loader2 size={19} className="spin" /> : <ArrowUp size={20} />}</button></div></form><p className="analyst-composer-note">AI can make mistakes. Verify important insights.</p><span className="analyst-notice" role="status">{notice}</span></footer>
      </section>
      <aside className="analyst-context" aria-label="Dataset details">
        <div className="analyst-context-heading"><Database size={16} /><h2>Your data</h2><span>{datasets.length}</span></div>
        {selectedDataset ? <div className="analyst-dataset-detail"><FileSpreadsheet size={24} /><strong>{selectedDataset.filename}</strong><span className="analyst-connected"><Check size={12} /> Connected</span><dl><div><dt>Rows</dt><dd>{Number(selectedDataset.row_count || 0).toLocaleString()}</dd></div><div><dt>Sheets</dt><dd>{selectedDataset.table_count || summary?.schema?.tables?.length || 0}</dd></div></dl><label htmlFor="analyst-active-sheet">Active sheet</label><select id="analyst-active-sheet" value={activeTable} disabled={!summary || chatting || busy} onChange={(event) => changeTable(event.target.value)}>{summary?.schema?.tables?.map((table) => <option key={table.table_name} value={table.table_name}>{table.sheet_name}</option>)}</select>{currentTable && <p>{currentTable.columns?.length || 0} columns · {Number(currentTable.row_count || 0).toLocaleString()} rows</p>}</div> : <div className="analyst-dataset-empty"><FileSpreadsheet size={26} /><strong>{loading ? 'Loading datasets...' : 'No dataset selected'}</strong></div>}
        <div className={`neha-companion ${chatting || uploading ? 'is-working' : ''}`}><NehaPortrait variant="insights" /><div className="neha-companion-status"><span className="analyst-status-dot" /><span>{chatting ? 'Connecting the dots...' : uploading ? 'Getting to know your data...' : 'A little curiosity. A lot of clarity.'}</span></div></div>
      </aside>
    </div>
  </div>;
};

export default DataAnalytics;
