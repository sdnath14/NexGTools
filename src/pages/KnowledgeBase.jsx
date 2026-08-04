import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Database, Download, File, Loader2, MessageSquare, Plus, Send, Trash2, UploadCloud } from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './KnowledgeBase.css';

const ACCEPTED = '.pdf,.xls,.xlsx,.csv,.txt,.md,.docx';
const ANSWER_PREVIEW_LENGTH = 900;

const parseTableRow = (line) => line
  .trim()
  .replace(/^\|/, '')
  .replace(/\|$/, '')
  .split(/(?<!\\)\|/)
  .map((cell) => cell.replace(/\\\|/g, '|').trim());

const isTableSeparator = (line) => {
  const cells = parseTableRow(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
};

const hasMarkdownTable = (content = '') => {
  const lines = content.split(/\r?\n/);
  return lines.some((line, index) => line.includes('|') && isTableSeparator(lines[index + 1] || ''));
};

const parseMarkdownContent = (content = '') => {
  const lines = content.split(/\r?\n/);
  const blocks = [];
  let textLines = [];
  const flushText = () => {
    if (textLines.some((line) => line.trim())) blocks.push({ type: 'text', lines: textLines });
    textLines = [];
  };

  for (let index = 0; index < lines.length;) {
    if (lines[index].includes('|') && isTableSeparator(lines[index + 1] || '')) {
      flushText();
      const headers = parseTableRow(lines[index]);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: 'table', headers, rows });
    } else {
      textLines.push(lines[index]);
      index += 1;
    }
  }
  flushText();
  return blocks;
};

const exportAnswerCsv = (content) => {
  const table = parseMarkdownContent(content).find((block) => block.type === 'table');
  if (!table) return;
  const escapeCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [table.headers, ...table.rows]
    .map((row) => table.headers.map((_, index) => escapeCell(row[index] || '')).join(','))
    .join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `knowledge-result-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const MarkdownAnswer = ({ content }) => {
  const blocks = parseMarkdownContent(content);

  return <div className="kb-answer-content">{blocks.map((block, index) => block.type === 'table' ? (
    <div className="kb-answer-table-wrap" key={`table-${index}`}><table className="kb-answer-table">
      <thead><tr>{block.headers.map((header, cellIndex) => <th key={cellIndex}>{header}</th>)}</tr></thead>
      <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{block.headers.map((_, cellIndex) => <td key={cellIndex}>{row[cellIndex] || '—'}</td>)}</tr>)}</tbody>
    </table></div>
  ) : (
    <p key={`text-${index}`}>{block.lines.join('\n').trim()}</p>
  ))}</div>;
};

const KnowledgeBase = () => {
  const inputRef = useRef(null);
  const [documents, setDocuments] = useState([]);
  const [records, setRecords] = useState([]);
  const [recordsPerSheetLimit, setRecordsPerSheetLimit] = useState(250);
  const [selected, setSelected] = useState([]);
  const [messages, setMessages] = useState([]);
  const [expandedMessages, setExpandedMessages] = useState(new Set());
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyResults, setHistoryResults] = useState([]);
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('chat');

  const loadDocuments = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/knowledge/documents`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load the knowledge base.');
      setDocuments(data.documents || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadRecords = useCallback(async (documentIds = []) => {
    try {
      const query = documentIds.length ? `?document_ids=${encodeURIComponent(documentIds.join(','))}` : '';
      const response = await fetch(`${API_BASE_URL}/api/knowledge/records${query}`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load records.');
      setRecords(data.records || []);
      setRecordsPerSheetLimit(data.per_sheet_limit || 250);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/knowledge/conversations`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load conversations.');
      // Ignore the unused legacy "shared" conversation. It has no messages and
      // otherwise leaves the chat looking selected while showing the welcome screen.
      const availableConversations = (data.conversations || []).filter(
        (conversation) => conversation.id !== 'shared' || conversation.message_count > 0,
      );
      setConversations(availableConversations);
      setActiveConversationId((currentId) => {
        if (currentId && availableConversations.some((conversation) => conversation.id === currentId)) return currentId;
        return availableConversations[0]?.id || null;
      });
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  const loadConversation = useCallback(async (conversationId) => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/knowledge/conversations/${conversationId}/messages`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load conversation history.');
      setMessages(data.messages || []);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  useEffect(() => { loadDocuments(); loadRecords(); loadConversations(); }, [loadDocuments, loadRecords, loadConversations]);
  useEffect(() => { loadConversation(activeConversationId); }, [activeConversationId, loadConversation]);

  useEffect(() => {
    const query = historyQuery.trim();
    if (!activeConversationId || query.length < 2) {
      setHistoryResults([]);
      return undefined;
    }
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/knowledge/conversations/${activeConversationId}/search?q=${encodeURIComponent(query)}`, { headers: authHeaders() });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Could not search conversation history.');
        setHistoryResults(data.messages || []);
      } catch (searchError) {
        setError(searchError.message);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [historyQuery, activeConversationId]);

  const waitForUpload = async (jobId) => {
    for (let attempt = 0; attempt < 900; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      const response = await fetch(`${API_BASE_URL}/api/knowledge/uploads/${jobId}`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not check upload status.');
      if (data.job?.status === 'completed') return data.job.document;
      if (data.job?.status === 'failed') throw new Error(data.job.error || 'Document indexing failed.');
    }
    throw new Error('Document indexing is still running. Refresh the document list in a few minutes.');
  };

  const uploadFiles = async (files) => {
    if (!files.length) return;
    setIsUploading(true);
    setError('');
    try {
      for (const file of files) {
        setUploadMessage(`Uploading ${file.name}…`);
        const form = new FormData();
        form.append('file', file);
        const response = await fetch(`${API_BASE_URL}/api/knowledge/documents`, {
          method: 'POST',
          headers: authHeaders(),
          body: form,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(`${file.name}: ${data.detail || 'Upload failed.'}`);
        if (data.job?.id) {
          setUploadMessage(`Indexing ${file.name} in the background…`);
          await waitForUpload(data.job.id);
        }
      }
      await loadDocuments();
      await loadRecords();
      setActiveTab('records');
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setIsUploading(false);
      setUploadMessage('');
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeDocument = async (documentId) => {
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/knowledge/documents/${documentId}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not delete document.');
      setSelected((current) => current.filter((id) => id !== documentId));
      await loadDocuments();
      await loadRecords(selected.filter((id) => id !== documentId));
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const ask = async (event) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || isAsking) return;
    const clientMessageId = `local-${Date.now()}`;
    setMessages((current) => [...current, { role: 'user', content: text, clientMessageId, seen: false }]);
    setQuestion('');
    setIsAsking(true);
    setError('');
    try {
      let conversationId = activeConversationId;
      if (!conversationId) {
        const conversationResponse = await fetch(`${API_BASE_URL}/api/knowledge/conversations`, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: '{}' });
        const conversationData = await conversationResponse.json();
        if (!conversationResponse.ok) throw new Error(conversationData.detail || 'Could not create conversation.');
        conversationId = conversationData.conversation.id;
        setActiveConversationId(conversationId);
      }
      const response = await fetch(`${API_BASE_URL}/api/knowledge/ask`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        // Chat is deliberately company-wide: table checkboxes only filter the
        // Records view and never narrow the knowledge available to the assistant.
        body: JSON.stringify({ question: text, document_ids: [], conversation_id: conversationId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not answer the question.');
      setMessages((current) => [
        ...current.map((message) => message.clientMessageId === clientMessageId ? { ...message, seen: true } : message),
        { role: 'assistant', content: data.answer, sources: data.sources || [] },
      ]);
      loadConversations();
    } catch (askError) {
      setError(askError.message);
    } finally {
      setIsAsking(false);
    }
  };

  const clearConversation = async () => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }
    if (!window.confirm('Clear this conversation history?')) return;
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/knowledge/conversations/${activeConversationId}/messages`, {
        method: 'DELETE', headers: authHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not clear conversation history.');
      setMessages([]);
      setHistoryQuery('');
      setHistoryResults([]);
    } catch (clearError) {
      setError(clearError.message);
    }
  };

  const createConversation = async () => {
    setActiveConversationId(null);
    setMessages([]);
    setHistoryQuery('');
    setHistoryResults([]);
  };

  const selectConversation = (conversationId) => {
    setActiveConversationId(conversationId);
    setHistoryQuery('');
    setHistoryResults([]);
  };

  const jumpToHistoryMessage = (messageId) => {
    document.getElementById(`memory-message-${messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHistoryResults([]);
  };

  const toggleSelected = (documentId) => {
    setSelected((current) => {
      const next = current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId];
      loadRecords(next);
      return next;
    });
  };

  const recordGroups = Object.values(records.reduce((groups, record) => {
    const sheetName = record.metadata?.sheet_name || 'Document content';
    const key = `${record.document_id || record.filename || 'document'}:${sheetName}`;
    if (!groups[key]) groups[key] = { key, filename: record.filename || 'Document', sheetName, records: [], columns: [] };
    groups[key].records.push(record);
    for (const column of Object.keys(record.fields || {})) {
      if (!groups[key].columns.includes(column)) groups[key].columns.push(column);
    }
    return groups;
  }, {}));
  const displayValue = (value) => {
    if (value === null || value === undefined || value === '') return '—';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  };

  return (
    <div className="kb-page">
      <header className="kb-header">
        <div className="kb-heading-icon"><BookOpen size={24} /></div>
        <div><h1>Knowledge Base</h1><p>Upload company data and ask questions grounded in your documents.</p></div>
      </header>
      {error && <div className="kb-error">{error}</div>}
      <nav className="kb-tabs" aria-label="Knowledge Base sections">
        <button className={activeTab === 'chat' ? 'kb-tab-active' : ''} onClick={() => setActiveTab('chat')}><MessageSquare size={17} /> AI Chat</button>
        <button className={activeTab === 'records' ? 'kb-tab-active' : ''} onClick={() => setActiveTab('records')}><Database size={17} /> Document Records <span>{records.length}</span></button>
      </nav>

      {activeTab === 'chat' && <section className="kb-chat-workspace">
          <aside className="kb-conversation-sidebar">
            <button className="kb-new-conversation" onClick={createConversation}><Plus size={16} /> New chat</button>
            <div className="kb-recent-heading">Recents</div>
            <div className="kb-conversation-list">{conversations.map((conversation) => <button className={conversation.id === activeConversationId ? 'kb-conversation-active' : ''} key={conversation.id} onClick={() => selectConversation(conversation.id)} aria-label={`Open conversation: ${conversation.title}`}><MessageSquare size={15} /><strong>{conversation.title}</strong></button>)}</div>
          </aside>
          <div className="kb-chat kb-chat-content">
          <div className="kb-chat-topbar">
            <div><h2>Company Knowledge Assistant</h2><span>{documents.length} company resource{documents.length === 1 ? '' : 's'} connected</span></div>
            <div><button onClick={clearConversation} title="Clear conversation"><Trash2 size={16} /> Clear chat</button><button onClick={() => setActiveTab('records')}><Database size={16} /> Manage knowledge</button></div>
          </div>
          <div className="kb-history-search">
            <input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Search this conversation…" aria-label="Search conversation history" />
            {historyResults.length > 0 && <div className="kb-history-results">{historyResults.map((message) => <button key={message.id} onClick={() => jumpToHistoryMessage(message.id)}><strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong><span>{message.content}</span></button>)}</div>}
          </div>
          <div className="kb-messages">
            {!messages.length && <div className="kb-welcome">
              <div className="kb-assistant-mark"><BookOpen size={28} /></div>
              <h3>How can I help with your company data?</h3>
              <p>Ask about companies, contact information, telephone numbers, fax numbers, emails, or any indexed business record.</p>
              {!!documents.length && <div className="kb-suggestions">
                <button onClick={() => setQuestion('Give me a brief summary of the company records.')}>Summarize company records</button>
                <button onClick={() => setQuestion('Find records with telephone numbers and email addresses.')}>Find contact details</button>
                <button onClick={() => setQuestion('How many company records are available?')}>Count available records</button>
              </div>}
            </div>}
            {messages.map((message, index) => (
              <div className={`kb-message kb-message-${message.role}`} id={message.id ? `memory-message-${message.id}` : undefined} key={message.id || `${message.role}-${index}`}>
                {message.role === 'assistant' && <div className="kb-avatar"><BookOpen size={16} /></div>}
                <div className="kb-bubble">
                  {message.role === 'assistant' ? <MarkdownAnswer content={message.content.length > ANSWER_PREVIEW_LENGTH && !hasMarkdownTable(message.content) && !expandedMessages.has(message.id || index)
                    ? `${message.content.slice(0, ANSWER_PREVIEW_LENGTH)}…`
                    : message.content} /> : message.content}
                  {message.role === 'assistant' && hasMarkdownTable(message.content) && <button className="kb-export-answer" onClick={() => exportAnswerCsv(message.content)}><Download size={15} /> Export CSV</button>}
                  {message.role === 'assistant' && message.content.length > ANSWER_PREVIEW_LENGTH && !hasMarkdownTable(message.content) && <button className="kb-read-more" onClick={() => setExpandedMessages((current) => { const next = new Set(current); const key = message.id || index; next.has(key) ? next.delete(key) : next.add(key); return next; })}>{expandedMessages.has(message.id || index) ? 'Show less' : 'Read more'}</button>}
                  {message.role === 'user' && (message.seen || messages[index + 1]?.role === 'assistant') && <small className="kb-seen">✓✓ Seen</small>}
                </div>
              </div>
            ))}
            {isAsking && <div className="kb-message kb-message-assistant kb-typing"><div className="kb-avatar"><BookOpen size={16} /></div><div className="kb-bubble"><span className="kb-typing-dots"><i></i><i></i><i></i></span><small>AI is typing…</small></div></div>}
          </div>
          <form className="kb-composer" onSubmit={ask}>
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={documents.length ? 'Ask a question about your data…' : 'Upload a source before asking a question…'} disabled={!documents.length || isAsking} rows={2} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
            <button disabled={!question.trim() || !documents.length || isAsking}><Send size={18} /></button>
          </form>
          <div className="kb-chat-disclaimer">Answers are restricted to your indexed company knowledge.</div>
          </div>
      </section>}

      {activeTab === 'records' && <div className="kb-records-layout">
        <aside className="kb-library">
          <div className="kb-panel-head"><div><h2>Data sources</h2><span>{documents.length} documents indexed</span></div></div>
          <button className="kb-upload" onClick={() => inputRef.current?.click()} disabled={isUploading}>
            {isUploading ? <Loader2 className="kb-spin" size={24} /> : <UploadCloud size={24} />}
            <strong>{isUploading ? (uploadMessage || 'Indexing files…') : 'Upload company data'}</strong>
            <small>PDF, Excel, CSV, Word, text or Markdown</small>
          </button>
          <input ref={inputRef} type="file" accept={ACCEPTED} multiple hidden onChange={(event) => uploadFiles([...event.target.files])} />
          <p className="kb-filter-note">Select documents to filter this table. AI Chat always uses every indexed company resource.</p>
          <div className="kb-documents">
            {isLoading ? <div className="kb-empty"><Loader2 className="kb-spin" /> Loading…</div> : documents.length ? documents.map((document) => (
              <div className={`kb-document ${selected.includes(document.id) ? 'kb-document-selected' : ''}`} key={document.id}>
                <label><input type="checkbox" checked={selected.includes(document.id)} onChange={() => toggleSelected(document.id)} /><File size={18} /><span><strong>{document.filename}</strong><small>{document.chunks} indexed chunks · {document.uploaded_at ? new Date(document.uploaded_at).toLocaleDateString() : 'Indexed'}</small></span></label>
                <button title="Delete source" onClick={() => removeDocument(document.id)}><Trash2 size={16} /></button>
              </div>
            )) : <div className="kb-empty">Upload your first source to begin.</div>}
          </div>
        </aside>
        <section className="kb-records-panel">
          <div className="kb-panel-head"><div><h2>Document records</h2><span>Up to {recordsPerSheetLimit} rows per sheet shown · all rows indexed for AI</span></div></div>
          {records.length ? <div className="kb-record-groups">{recordGroups.map((group) => (
            <section className="kb-record-group" key={group.key}>
              <div className="kb-record-group-head"><File size={16} /><strong>{group.filename} — {group.sheetName}</strong><span>{group.records.length} rows shown</span></div>
              <div className="kb-records-table-wrap"><table className="kb-records-table">
                <thead><tr><th>#</th>{group.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                <tbody>{group.records.map((record, index) => <tr key={record.id}><td>{index + 1}</td>{group.columns.map((column) => <td key={column} title={displayValue(record.fields?.[column])}>{displayValue(record.fields?.[column])}</td>)}</tr>)}</tbody>
              </table></div>
            </section>
          ))}</div> : <div className="kb-empty kb-records-empty"><Database size={28} /> No document records available.</div>}
        </section>
      </div>}
    </div>
  );
};

export default KnowledgeBase;
