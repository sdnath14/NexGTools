import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Database, Download, FileUp, Loader2, RotateCcw, Search, Trash2 } from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './DataLibrary.css';
import './DataLibraryUpload.css';
import './DataLibraryWorkbook.css';
import './DataLibraryUndo.css';



const ACCEPTED = '.csv,.xls,.xlsx';
const formatBytes = (value) => `${(Number(value || 0) / 1024 / 1024).toFixed(1)} MB`;
const tableColumns = (records) => [...new Set(records.flatMap((record) => Object.keys(record.record_json || {})))];
const displayValue = (value) => value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
export default function DataLibrary() {
  const picker = useRef(null);
  const workbookTableRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [selectedFileIds, setSelectedFileIds] = useState([]);
  const [workbook, setWorkbook] = useState(null);
  const [activeSheetId, setActiveSheetId] = useState(null);
  const [workbookScrollTop, setWorkbookScrollTop] = useState(0);
  // const [activePanel, setActivePanel] = useState('upload');
  const [activePanel, setActivePanel] = useState('search');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [question, setQuestion] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [loadingMoreIndex, setLoadingMoreIndex] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState(null);
  const [error, setError] = useState('');
  const [diagnosingFileId, setDiagnosingFileId] = useState(null);
  const [diagnosticResult, setDiagnosticResult] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const [cellValue, setCellValue] = useState('');
  const [savingCell, setSavingCell] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [undoing, setUndoing] = useState(false);

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
    setSearchResult(null);
    setError('');
  };

  const clearSearch = () => {
    setSearchResult(null);
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
        const payload = await response.text();
        let data = {};
        try { data = payload ? JSON.parse(payload) : {}; } catch { /* Use the user-friendly fallback below. */ }
        if (!response.ok) {
          const message = data.detail || 'Please upload CSV, XLS, or XLSX files only.';
          throw new Error(`${file.name}: ${message}`);
        }
      }
      await loadFiles();
    } catch (uploadError) { setError(uploadError.message); } finally { setUploading(false); if (picker.current) picker.current.value = ''; }
  };

  const deleteSource = async (file) => {
    if (deletingFileId || !window.confirm(`Delete “${file.filename}”? This will permanently remove the uploaded file and its searchable records.`)) return;
    setDeletingFileId(file.id); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/${file.id}`, { method: 'DELETE', headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not delete the uploaded file.');
      setSelectedFileIds((current) => current.filter((id) => id !== file.id));
      setSearchResult(null);
      if (workbook?.file.id === file.id) { setWorkbook(null); setActiveSheetId(null); setUndoStack([]); }
      await loadFiles();
    } catch (deleteError) { setError(deleteError.message); } finally { setDeletingFileId(null); }
  };

  const runDiagnostic = async (file) => {
    if (diagnosingFileId) return;
    setDiagnosingFileId(file.id); setError(''); setDiagnosticResult(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/${file.id}/diagnostics`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not run diagnostics.');
      setDiagnosticResult({ fileId: file.id, filename: file.filename, ...data });
    } catch (diagnosticError) { setError(diagnosticError.message); } finally { setDiagnosingFileId(null); }
  };

  const fixDiagnostic = async (issue) => {
    const file = files.find((item) => item.id === diagnosticResult?.fileId);
    if (!file) return;
    const sheets = await openWorkbook(file);
    const sheet = sheets?.find((item) => item.name === issue.sheet);
    const record = sheet?.records.find((item) => item.record_number === issue.row);
    if (!sheet || !record) return;
    const column = issue.target_column || issue.column;
    setActiveSheetId(sheet.id);
    setWorkbookScrollTop(Math.max(0, sheet.records.findIndex((item) => item.record_number === issue.row) * 31));
    setEditingCell({ sheet: issue.sheet, recordNumber: issue.row, column });
    setCellValue(record.record_json?.[column] ?? '');
  };

  useEffect(() => {
    if (!editingCell || activePanel !== 'workbook') return;
    const timer = window.setTimeout(() => {
      workbookTableRef.current?.querySelector('.library-cell-needs-attention')?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [activePanel, activeSheetId, editingCell, workbookScrollTop]);

  const deleteDuplicateDiagnostic = async (issue) => {
    if (!diagnosticResult || !window.confirm(`Delete duplicate row ${issue.row} from ${issue.sheet}?`)) return;
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/${diagnosticResult.fileId}/records/${encodeURIComponent(issue.sheet)}/${issue.row}`, { method: 'DELETE', headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not delete the duplicate row.');
      setDiagnosticResult((current) => current && ({ ...current, rows_checked: Math.max(0, current.rows_checked - 1), issues: current.issues.filter((item) => !(item.sheet === issue.sheet && item.row === issue.row && item.column === 'Row')) }));
      setWorkbook((current) => current && current.file.id === diagnosticResult.fileId ? ({ ...current, sheets: current.sheets.map((sheet) => sheet.name !== issue.sheet ? sheet : ({ ...sheet, records: sheet.records.filter((record) => record.record_number !== issue.row), row_count: Math.max(0, sheet.row_count - 1) })) }) : current);
      await loadFiles();
    } catch (deleteError) { setError(deleteError.message); }
  };

  const saveCell = async (clear = false) => {
    if (!editingCell || !workbook || savingCell) return;
    const sheet = workbook.sheets.find((item) => item.name === editingCell.sheet);
    if (!sheet) return;
    const previousValue = sheet.records.find((record) => record.record_number === editingCell.recordNumber)?.record_json?.[editingCell.column] ?? null;
    const nextValue = clear || cellValue === '' ? null : cellValue;
    if (previousValue === nextValue) { setEditingCell(null); return; }
    setSavingCell(true); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/${workbook.file.id}/cell`, { method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ sheet_id: sheet.id, record_number: editingCell.recordNumber, column: editingCell.column, value: nextValue }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not update the cell.');
      setWorkbook((current) => current && ({ ...current, sheets: current.sheets.map((item) => item.id !== sheet.id ? item : ({ ...item, records: item.records.map((record) => record.record_number !== editingCell.recordNumber ? record : ({ ...record, record_json: { ...record.record_json, [editingCell.column]: nextValue } })) })) }));
      setUndoStack((current) => [...current, { sheetId: sheet.id, sheetName: sheet.name, recordNumber: editingCell.recordNumber, column: editingCell.column, previousValue }]);
      setEditingCell(null);
    } catch (cellError) { setError(cellError.message); } finally { setSavingCell(false); }
  };

  const undoLastCellChange = async () => {
    if (!workbook || !undoStack.length || undoing || savingCell) return;
    const change = undoStack[undoStack.length - 1];
    setUndoing(true); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/${workbook.file.id}/cell`, { method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ sheet_id: change.sheetId, record_number: change.recordNumber, column: change.column, value: change.previousValue }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not undo the cell change.');
      setWorkbook((current) => current && ({ ...current, sheets: current.sheets.map((sheet) => sheet.id !== change.sheetId ? sheet : ({ ...sheet, records: sheet.records.map((record) => record.record_number !== change.recordNumber ? record : ({ ...record, record_json: { ...record.record_json, [change.column]: change.previousValue } })) })) }));
      setUndoStack((current) => current.slice(0, -1));
      setEditingCell(null);
    } catch (undoError) { setError(undoError.message); } finally { setUndoing(false); }
  };

  useEffect(() => {
    const handleUndoShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && activePanel === 'workbook' && !editingCell) {
        event.preventDefault();
        undoLastCellChange();
      }
    };
    window.addEventListener('keydown', handleUndoShortcut);
    return () => window.removeEventListener('keydown', handleUndoShortcut);
  }, [activePanel, editingCell, undoStack, undoing, savingCell, workbook]);

  const openWorkbook = async (file) => {
    if (file.status !== 'completed') return;
    setError(''); setWorkbook({ file, loading: true, sheets: [] }); setActiveSheetId(null); setActivePanel('workbook');
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/${file.id}/contents`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load document contents.');
      const sheets = data.sheets || [];
      setWorkbook({ file, loading: false, sheets });
      setActiveSheetId(sheets[0]?.id || null); setWorkbookScrollTop(0); setUndoStack([]);
      return sheets;
    } catch (viewError) { setWorkbook(null); setError(viewError.message); return null; }
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
      setSearchResult({
        query: question,
        records,
        total: data.total || 0,
        hasMore: Boolean(data.has_more),
        fileIds: selectedFileIds,
      });
      setQuestion('');
    } catch (askError) { setError(askError.message); } finally { setSearching(false); }
  };

  const loadMore = async () => {
    if (!searchResult || loadingMoreIndex !== null) return;
    setLoadingMoreIndex(true); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/search`, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ query: searchResult.query, limit: 50, offset: searchResult.records.length, file_ids: searchResult.fileIds || [] }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load more results.');
      setSearchResult((current) => current && {
        ...current,
        records: [...current.records, ...(data.records || [])],
        total: data.total || current.total,
        hasMore: Boolean(data.has_more),
      });
    } catch (loadError) { setError(loadError.message); } finally { setLoadingMoreIndex(null); }
  };



  const downloadTemplate = async () => {
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/template`, { headers: authHeaders() });
      if (!response.ok) throw new Error('Could not download the Excel template.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'data-upload-template.xlsx';
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) { setError(downloadError.message); }
  };



  const downloadSearchResults = () => {
    if (!searchResult?.records.length) return;
    const columns = tableColumns(searchResult.records);
    const records = searchResult.records;
    const csvCell = (value) => `"${displayValue(value).replaceAll('"', '""')}"`;
    const csv = [columns.map(csvCell).join(','), ...records.map((record) => columns.map((column) => csvCell(record.record_json?.[column])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `data-library-search-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    URL.revokeObjectURL(url);
  };

  const selectedFiles = files.filter((file) => selectedFileIds.includes(file.id));

  const documentsPanel = <section className="library-upload-grid"><div className="library-card library-documents-panel"><div className="library-card-head"><div><h2>Documents</h2><span>Upload files here, then select the sources you want to search.</span></div><div className="library-documents-actions"><button className="library-upload" onClick={() => picker.current?.click()} disabled={uploading}><FileUp size={18} /> {uploading ? 'Uploading…' : 'Upload file'}</button><button type="button" className="library-refresh" onClick={downloadTemplate}><Download size={17} /> Download template</button><button onClick={loadFiles} className="library-refresh">Refresh</button></div></div>
    {loading ? <div className="library-empty"><Loader2 className="spin" /> Loading documents…</div> : files.length ? <div className="library-files">{files.map((file) => <div key={file.id} className={`library-file ${selectedFileIds.includes(file.id) ? 'selected' : ''}`} onClick={() => file.status === 'completed' && toggleSource(file.id)}><label className="library-source-select"><input type="checkbox" checked={selectedFileIds.includes(file.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSource(file.id)} disabled={file.status !== 'completed'} aria-label={`Search ${file.filename}`} /></label><div className="library-file-text"><Database size={19} /><div><strong>{file.filename}</strong><small>{file.file_type.replace('.', '').toUpperCase()} · {formatBytes(file.file_size)} · {file.records || 0} records</small></div></div><div className="library-file-actions"><span className={`library-status ${file.status}`}>{file.status === 'completed' ? <CheckCircle2 size={15} /> : file.status === 'failed' ? <AlertCircle size={15} /> : <Loader2 className="spin" size={15} />}{file.status}</span>{file.status === 'completed' && <button type="button" className="library-refresh" onClick={(event) => { event.stopPropagation(); runDiagnostic(file); }} disabled={diagnosingFileId !== null}>{diagnosingFileId === file.id ? <Loader2 className="spin" size={15} /> : 'Run diagnostics'}</button>}<button type="button" className="library-delete-source" onClick={(event) => { event.stopPropagation(); deleteSource(file); }} disabled={deletingFileId !== null} aria-label={`Delete ${file.filename}`}>{deletingFileId === file.id ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}</button></div></div>)}</div> : <div className="library-empty"><Database size={28} /> Upload a source to create searchable records.</div>}
  </div></section>;





return (
  <div className="library-page">
    <header className="library-header">
      <div>
        <h1>Data Library</h1>
        <p>
          Upload files, then search exact values in your Excel, CSV, and document rows.
        </p>
      </div>

      <div className="library-header-actions">
        <div className="library-panel-tabs">
          <button
            type="button"
            className={activePanel === 'search' ? 'active' : ''}
            onClick={() => setActivePanel('search')}
          >
            Search data
          </button>

          <button
            type="button"
            className={activePanel === 'upload' ? 'active' : ''}
            onClick={() => setActivePanel('upload')}
          >
            Upload files
          </button>

          <button
            type="button"
            className={activePanel === 'workbook' ? 'active' : ''}
            onClick={() => setActivePanel('workbook')}
          >
            Workbook view
          </button>
        </div>
      </div>

      <input
        ref={picker}
        hidden
        type="file"
        multiple
        accept={ACCEPTED}
        onChange={(event) => upload(event.target.files)}
      />
    </header>

    {error && (
      <div className="library-alert">
        <AlertCircle size={17} />
        {error}
      </div>
    )}

    {activePanel === 'upload' && documentsPanel}

    {activePanel === 'upload' && diagnosticResult && (
      <section className="library-card">
        <div className="library-card-head">
          <div>
            <h2>Diagnostic results: {diagnosticResult.filename}</h2>
            <span>{diagnosticResult.rows_checked} rows checked</span>
          </div>
        </div>
        {diagnosticResult.issues.length ? (
          <div className="library-table-wrap">
            <table>
              <thead><tr><th>Sheet</th><th>Row</th><th>Column</th><th>Value</th><th>Issue</th><th>Action</th></tr></thead>
              <tbody>{diagnosticResult.issues.map((issue, index) => (
                <tr key={`${issue.sheet}-${issue.row}-${issue.column}-${index}`}><td>{issue.sheet}</td><td>{issue.row}</td><td>{issue.column}</td><td>{displayValue(issue.value)}</td><td>{issue.message}</td><td>{issue.target_column ? <button type="button" className="library-diagnostic-delete" onClick={() => deleteDuplicateDiagnostic(issue)}><Trash2 size={14} /> Delete</button> : <button type="button" className="library-refresh" onClick={() => fixDiagnostic(issue)}>Fix</button>}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="library-search-state"><CheckCircle2 size={18} /> No type or duplicate-row issues found.</div>}
      </section>
    )}

    {activePanel === 'search' && (
      <section className="library-search-grid">
        <div className="library-card library-search-panel">
          <div className="library-card-head">
            <div>
              <h2>Search database</h2>
              <span>
                Search exact keywords across your uploaded data. Select sources
                in Upload files, or leave them unselected to search every source.
              </span>
            </div>

            {searchResult && (
              <button
                type="button"
                className="library-refresh"
                onClick={clearSearch}
              >
                Clear search
              </button>
            )}
          </div>

          <form onSubmit={ask} className="library-query">
            <Search className="library-query-icon" size={19} />

            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Search by keyword, name, phone number, or location…"
              aria-label="Search uploaded data"
            />

            <button disabled={!question.trim() || searching}>
              {searching ? (
                <Loader2 className="spin" size={17} />
              ) : (
                <Search size={17} />
              )}
              Search
            </button>
          </form>

          <div className="library-selected-sources">
            <strong>Selected sources:</strong>

            {selectedFiles.length ? (
              selectedFiles.map((file) => (
                <span key={file.id}>{file.filename}</span>
              ))
            ) : (
              <em>All uploaded files</em>
            )}
          </div>

          {searching && (
            <div className="library-search-state">
              <Loader2 className="spin" size={18} />
              Searching your data…
            </div>
          )}

          {!searching && !searchResult && (
            <div className="library-search-state">
              Enter a keyword to find matching rows in your uploaded files.
            </div>
          )}

          {!searching &&
            searchResult &&
            (() => {
              const columns = tableColumns(searchResult.records);

              const records = searchResult.records;

              return (
                <div className="library-results">
                  <div className="library-results-head">
                    <div>
                      <h2>Search results</h2>

                      <span>
                        {searchResult.total} result
                        {searchResult.total === 1 ? '' : 's'} found
                        {searchResult.query
                          ? ` for “${searchResult.query}”`
                          : ''}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="library-download-results"
                      onClick={downloadSearchResults}
                      disabled={!searchResult.records.length}
                    >
                      <Download size={16} />
                      Download CSV
                    </button>
                  </div>

                  {columns.length ? (
                    <div className="library-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            {columns.map((column) => (
                              <th key={column}>{column}</th>
                            ))}
                          </tr>
                        </thead>

                        <tbody>
                          {records.map((record) => (
                            <tr key={record.id}>
                              {columns.map((column) => (
                                <td key={column}>
                                  {displayValue(record.record_json?.[column])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="library-search-state">
                      No matching rows were found.
                    </div>
                  )}

                  {searchResult.hasMore && (
                    <button
                      type="button"
                      className="library-load-more"
                      onClick={loadMore}
                      disabled={loadingMoreIndex !== null}
                    >
                      {loadingMoreIndex ? (
                        <>
                          <Loader2 className="spin" size={15} />
                          Loading more…
                        </>
                      ) : (
                        'Show next 50 results'
                      )}
                    </button>
                  )}
                </div>
              );
            })()}
        </div>
      </section>
    )}

    {activePanel === 'workbook' && (
      <section className="library-card library-workbook">
        <div className="library-card-head">
          <div>
            <h2>{workbook?.file.filename || 'Workbook view'}</h2>
            <span>
              Choose a completed file to view all of its sheets and rows.
            </span>
          </div>

          <div className="library-workbook-actions">
            <select
              className="library-workbook-picker"
              value={workbook?.file.id || ''}
              onChange={(event) => {
                const file = files.find(
                  (item) => item.id === event.target.value
                );

                if (file) openWorkbook(file);
              }}
            >
              <option value="">Choose a workbook…</option>

              {files
                .filter((file) => file.status === 'completed')
                .map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.filename}
                  </option>
                ))}
            </select>

            {workbook && (
              <button
                type="button"
                className="library-refresh"
                onClick={undoLastCellChange}
                disabled={!undoStack.length || undoing || savingCell}
                title="Undo last cell change (Ctrl/Cmd + Z)"
              >
                {undoing ? <Loader2 className="spin" size={15} /> : <RotateCcw size={15} />}
                Undo
              </button>
            )}

            {workbook && (
              <button
                type="button"
                className="library-refresh"
                onClick={downloadWorkbook}
                disabled={downloading}
              >
                {downloading ? (
                  <Loader2 className="spin" size={15} />
                ) : (
                  <Download size={15} />
                )}
                Download original
              </button>
            )}
          </div>
        </div>

        {workbook ? (
          workbook.loading ? (
            <div className="library-empty">
              <Loader2 className="spin" />
              Loading workbook…
            </div>
          ) : workbook.sheets.length ? (
            <>
              <div className="library-sheet-tabs">
                {workbook.sheets.map((sheet) => (
                  <button
                    type="button"
                    key={sheet.id}
                    className={sheet.id === activeSheetId ? 'active' : ''}
                    onClick={() => selectSheet(sheet.id)}
                  >
                    {sheet.name} ({sheet.row_count})
                  </button>
                ))}
              </div>

              {(() => {
                const sheet =
                  workbook.sheets.find(
                    (item) => item.id === activeSheetId
                  ) || workbook.sheets[0];

                const columns = sheet.headers_json || [];
                const rowHeight = 31;

                const start = Math.max(
                  0,
                  Math.floor(workbookScrollTop / rowHeight) - 8
                );

                const end = Math.min(
                  sheet.records.length,
                  start + 36
                );

                const visibleRows = sheet.records.slice(start, end);

                return (
                  <>
                    <div className="library-workbook-summary">
                      All {sheet.row_count} rows are available. Scroll to view
                      them.
                    </div>

                    <div
                      ref={workbookTableRef}
                      className="library-workbook-table"
                      onScroll={(event) =>
                        setWorkbookScrollTop(
                          event.currentTarget.scrollTop
                        )
                      }
                    >
                      <table>
                        <thead>
                          <tr>
                            <th>#</th>

                            {columns.map((column) => (
                              <th key={column}>{column}</th>
                            ))}
                          </tr>
                        </thead>

                        <tbody>
                          {start > 0 && (
                            <tr className="library-spacer-row">
                              <td
                                colSpan={columns.length + 1}
                                style={{
                                  height: start * rowHeight,
                                }}
                              />
                            </tr>
                          )}

                          {visibleRows.map((record) => (
                            <tr key={record.record_number}>
                              <td>{record.record_number}</td>

                              {columns.map((column) => (
                                <td
                                  key={column}
                                  className={`library-editable-cell ${editingCell?.sheet === sheet.name && editingCell.recordNumber === record.record_number && editingCell.column === column ? 'library-cell-needs-attention' : ''}`}
                                  title="Click to edit"
                                  onClick={() => {
                                    setEditingCell({ sheet: sheet.name, recordNumber: record.record_number, column });
                                    setCellValue(record.record_json?.[column] ?? '');
                                  }}
                                >
                                  {editingCell?.sheet === sheet.name &&
                                  editingCell.recordNumber === record.record_number &&
                                  editingCell.column === column ? (
                                    <span className="library-cell-editor">
                                      <input value={cellValue} onChange={(event) => setCellValue(event.target.value)} autoFocus />
                                      <button type="button" onClick={(event) => { event.stopPropagation(); saveCell(); }} disabled={savingCell}>Save</button>
                                      <button type="button" onClick={(event) => { event.stopPropagation(); saveCell(true); }} disabled={savingCell}>Clear</button>
                                    </span>
                                  ) : displayValue(record.record_json?.[column])}
                                </td>
                              ))}
                            </tr>
                          ))}

                          {end < sheet.records.length && (
                            <tr className="library-spacer-row">
                              <td
                                colSpan={columns.length + 1}
                                style={{
                                  height:
                                    (sheet.records.length - end) *
                                    rowHeight,
                                }}
                              />
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </>
          ) : (
            <div className="library-empty">
              No structured rows were found in this file.
            </div>
          )
        ) : (
          <div className="library-empty">
            <Database size={28} />
            Choose a completed document above to open its workbook.
          </div>
        )}
      </section>
    )}
  </div>
);
}
