import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Database, Download, FileUp, Loader2, Search } from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './DataLibrary.css';
import './DataLibraryWorkbook.css';

const ACCEPTED = '.csv,.xls,.xlsx,.pdf,.docx,.txt,.md';
const formatBytes = (value) => `${(Number(value || 0) / 1024 / 1024).toFixed(1)} MB`;
const tableColumns = (records) => [...new Set(records.flatMap((record) => Object.keys(record.record_json || {})))];
const displayValue = (value) => value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);

export default function DataLibrary() {
  const picker = useRef(null);
  const [files, setFiles] = useState([]);
  const [selectedFileIds, setSelectedFileIds] = useState([]);
  const [workbook, setWorkbook] = useState(null);
  const [activeSheetId, setActiveSheetId] = useState(null);
  const [workbookScrollTop, setWorkbookScrollTop] = useState(0);
  const [activePanel, setActivePanel] = useState('search');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loadingMoreIndex, setLoadingMoreIndex] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const loadFiles = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load documents.');
      setFiles(data.files || []);
    } catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  };
  useEffect(() => { loadFiles(); const timer = setInterval(loadFiles, 5000); return () => clearInterval(timer); }, []);

  const toggleSource = (fileId) => {
    setSelectedFileIds((current) => current.includes(fileId) ? current.filter((id) => id !== fileId) : [...current, fileId]);
    setMessages([]);
    setError('');
  };

  const clearChat = () => {
    setMessages([]);
    setQuestion('');
    setError('');
  };

  const upload = async (selected) => {
    if (!selected?.length) return;
    setUploading(true); setError('');
    try {
      for (const file of selected) {
        const body = new FormData(); body.append('file', file);
        const response = await fetch(`${API_BASE_URL}/api/documents`, { method: 'POST', headers: authHeaders(), body });
        const data = await response.json();
        if (!response.ok) throw new Error(`${file.name}: ${data.detail || 'Upload failed.'}`);
      }
      await loadFiles();
    } catch (uploadError) { setError(uploadError.message); } finally { setUploading(false); if (picker.current) picker.current.value = ''; }
  };

  const openWorkbook = async (file) => {
    if (file.status !== 'completed') return;
    setError(''); setWorkbook({ file, loading: true, sheets: [] }); setActiveSheetId(null); setActivePanel('workbook');
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/${file.id}/contents`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load document contents.');
      const sheets = data.sheets || [];
      setWorkbook({ file, loading: false, sheets });
      setActiveSheetId(sheets[0]?.id || null); setWorkbookScrollTop(0);
    } catch (viewError) { setWorkbook(null); setError(viewError.message); }
  };

  const selectSheet = (sheetId) => {
    setActiveSheetId(sheetId);
    setWorkbookScrollTop(0);
  };

  const downloadWorkbook = async () => {
    if (!workbook || downloading) return;
    setDownloading(true); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/${workbook.file.id}/download`, { headers: authHeaders() });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Could not download the original file.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = workbook.file.filename; link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) { setError(downloadError.message); } finally { setDownloading(false); }
  };

  const ask = async (event) => {
    event.preventDefault(); if (!question.trim() || searching) return;
    setSearching(true); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/search`, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ query: question, limit: 50, file_ids: selectedFileIds }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not search the uploaded data.');
      const records = data.records || [];
      setMessages((current) => [...current, {
        question,
        answer: records.length ? `Found ${data.total} keyword match${data.total === 1 ? '' : 'es'} in your uploaded data. Showing ${records.length}.` : 'No matching rows were found in your uploaded data.',
        sources: records,
        total: data.total || 0,
        hasMore: Boolean(data.has_more),
        fileIds: selectedFileIds,
      }]);
      setQuestion('');
    } catch (askError) { setError(askError.message); } finally { setSearching(false); }
  };

  const loadMore = async (index) => {
    const message = messages[index];
    if (!message || loadingMoreIndex !== null) return;
    setLoadingMoreIndex(index); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/search`, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ query: message.question, limit: 50, offset: message.sources.length, file_ids: message.fileIds || [] }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load more results.');
      setMessages((current) => current.map((item, itemIndex) => itemIndex !== index ? item : {
        ...item,
        sources: [...item.sources, ...(data.records || [])],
        hasMore: Boolean(data.has_more),
        answer: `Found ${data.total} keyword matches in your uploaded data. Showing ${item.sources.length + (data.records || []).length}.`,
      }));
    } catch (loadError) { setError(loadError.message); } finally { setLoadingMoreIndex(null); }
  };

  return <div className="library-page">
    <header className="library-header"><div><h1>Data Library</h1><p>Search the exact values in your uploaded Excel, CSV, and document rows.</p></div><div className="library-header-actions"><div className="library-panel-tabs"><button type="button" className={activePanel === 'search' ? 'active' : ''} onClick={() => setActivePanel('search')}>Search data</button><button type="button" className={activePanel === 'workbook' ? 'active' : ''} onClick={() => setActivePanel('workbook')}>Workbook view</button></div><button className="library-upload" onClick={() => picker.current?.click()} disabled={uploading}><FileUp size={18} /> {uploading ? 'Uploading…' : 'Upload data'}</button></div><input ref={picker} hidden type="file" multiple accept={ACCEPTED} onChange={(event) => upload(event.target.files)} /></header>
    {error && <div className="library-alert"><AlertCircle size={17} /> {error}</div>}
    {activePanel === 'search' && <section className="library-grid">
      <div className="library-card"><div className="library-card-head"><div><h2>Documents</h2><span>Select sources to search, or leave all unselected to search every source.</span></div><button onClick={loadFiles} className="library-refresh">Refresh</button></div>
        {loading ? <div className="library-empty"><Loader2 className="spin" /> Loading documents…</div> : files.length ? <div className="library-files">{files.map((file) => <div key={file.id} className={`library-file ${selectedFileIds.includes(file.id) ? 'selected' : ''}`} onClick={() => file.status === 'completed' && toggleSource(file.id)}><label className="library-source-select"><input type="checkbox" checked={selectedFileIds.includes(file.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSource(file.id)} disabled={file.status !== 'completed'} aria-label={`Search ${file.filename}`} /></label><div className="library-file-text"><Database size={19} /><div><strong>{file.filename}</strong><small>{file.file_type.replace('.', '').toUpperCase()} · {formatBytes(file.file_size)} · {file.records || 0} records</small></div></div><span className={`library-status ${file.status}`}>{file.status === 'completed' ? <CheckCircle2 size={15} /> : file.status === 'failed' ? <AlertCircle size={15} /> : <Loader2 className="spin" size={15} />}{file.status}</span></div>)}</div> : <div className="library-empty"><Database size={28} /> Upload a source to create searchable records.</div>}
      </div>
      <div className="library-card library-answer"><div className="library-card-head"><div><h2>Search uploaded data</h2><span>Keyword matches only — results come directly from your stored rows.</span></div><button type="button" className="library-refresh" onClick={clearChat} disabled={!messages.length}>Clear chat</button></div>
        <div className="library-chat">{!messages.length && <div className="library-chat-empty">Enter a name, phone number, location, or any value from your Excel file.</div>}{messages.map((message, index) => { const columns = tableColumns(message.sources || []); return <div className="library-turn" key={`${message.question}-${index}`}><div className="library-bubble user">{message.question}</div><div className="library-bubble assistant">{message.answer}</div>{columns.length > 0 && <div className="library-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{message.sources.map((record) => <tr key={record.id}>{columns.map((column) => <td key={column}>{displayValue(record.record_json?.[column])}</td>)}</tr>)}</tbody></table></div>}{message.hasMore && <button type="button" className="library-refresh" onClick={() => loadMore(index)} disabled={loadingMoreIndex !== null}>{loadingMoreIndex === index ? <><Loader2 className="spin" size={15} /> Loading more…</> : 'Need more results? Show next 50'}</button>}</div>; })}{searching && <div className="library-bubble assistant"><Loader2 className="spin" size={16} /> Searching your data…</div>}</div>
        <form onSubmit={ask} className="library-query telegram-composer"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(event); } }} placeholder="Search your uploaded Excel data…" rows="1" /><button aria-label="Send search" disabled={!question.trim() || searching}>{searching ? <Loader2 className="spin" size={17} /> : <Search size={17} />}</button></form>
      </div>
    </section>}
    {activePanel === 'workbook' && <section className="library-card library-workbook"><div className="library-card-head"><div><h2>{workbook?.file.filename || 'Workbook view'}</h2><span>Choose a completed file to view all of its sheets and rows.</span></div><div className="library-workbook-actions"><select className="library-workbook-picker" value={workbook?.file.id || ''} onChange={(event) => { const file = files.find((item) => item.id === event.target.value); if (file) openWorkbook(file); }}><option value="">Choose a workbook…</option>{files.filter((file) => file.status === 'completed').map((file) => <option key={file.id} value={file.id}>{file.filename}</option>)}</select>{workbook && <button type="button" className="library-refresh" onClick={downloadWorkbook} disabled={downloading}>{downloading ? <Loader2 className="spin" size={15} /> : <Download size={15} />} Download original</button>}</div></div>{workbook ? (workbook.loading ? <div className="library-empty"><Loader2 className="spin" /> Loading workbook…</div> : workbook.sheets.length ? <><div className="library-sheet-tabs">{workbook.sheets.map((sheet) => <button type="button" key={sheet.id} className={sheet.id === activeSheetId ? 'active' : ''} onClick={() => selectSheet(sheet.id)}>{sheet.name} ({sheet.row_count})</button>)}</div>{(() => { const sheet = workbook.sheets.find((item) => item.id === activeSheetId) || workbook.sheets[0]; const columns = sheet.headers_json || []; const rowHeight = 31; const start = Math.max(0, Math.floor(workbookScrollTop / rowHeight) - 8); const end = Math.min(sheet.records.length, start + 36); const visibleRows = sheet.records.slice(start, end); return <><div className="library-workbook-summary">All {sheet.row_count} rows are available. Scroll to view them.</div><div className="library-workbook-table" onScroll={(event) => setWorkbookScrollTop(event.currentTarget.scrollTop)}><table><thead><tr><th>#</th>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{start > 0 && <tr className="library-spacer-row"><td colSpan={columns.length + 1} style={{ height: start * rowHeight }} /></tr>}{visibleRows.map((record) => <tr key={record.record_number}><td>{record.record_number}</td>{columns.map((column) => <td key={column}>{displayValue(record.record_json?.[column])}</td>)}</tr>)}{end < sheet.records.length && <tr className="library-spacer-row"><td colSpan={columns.length + 1} style={{ height: (sheet.records.length - end) * rowHeight }} /></tr>}</tbody></table></div></>; })()}</> : <div className="library-empty">No structured rows were found in this file.</div>) : <div className="library-empty"><Database size={28} /> Choose a completed document above to open its workbook.</div>}</section>}
  </div>;
}
