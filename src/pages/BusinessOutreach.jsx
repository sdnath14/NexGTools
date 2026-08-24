import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bot,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Edit3,
  Filter,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './BusinessOutreach.css';

const tones = [
  { id: 'professional', label: 'Professional', icon: BriefcaseBusiness },
  { id: 'casual', label: 'Casual', icon: MessageSquare },
  { id: 'urgent', label: 'Urgent', icon: Zap },
  { id: 'empathetic', label: 'Empathetic', icon: Check },
];

const tabs = [
  { id: 'leads', label: 'Leads', icon: Database },
  { id: 'generate', label: 'Generate', icon: Sparkles },
  { id: 'editor', label: 'Editor', icon: Edit3 },
];

const campaignTemplates = [
  {
    id: 'garages',
    label: 'Garages',
    goal: 'Introduce our automotive lubricant and used-oil solutions to garages, build trust with the owner or manager, and schedule a short call or visit to discuss regular supply requirements.',
    keyPoints: [
      'Reliable lubricant supply for daily garage operations',
      'Support for used-oil handling and business follow-up',
      'Request a 10-minute call or quick shop visit',
    ],
  },
  {
    id: 'restaurants',
    label: 'Restaurants',
    goal: 'Reach restaurant owners or managers with a practical business introduction, understand their recurring operational supply needs, and schedule a quick conversation for partnership opportunities.',
    keyPoints: [
      'Simple business introduction for restaurant decision makers',
      'Focus on recurring supply, service, or partnership needs',
      'Request a short call at a convenient time',
    ],
  },
];

const emptyLead = { company_name: '', contact_person: '', email: '', phone: '', website: '', category: 'manual' };

const statusClass = (status) => status.toLowerCase();
const contactName = (contact) => contact.contact_person || contact.company_name;
const firstName = (contact) => (contact.contact_person || '').split(' ')[0] || 'there';
const fieldValue = (record, names) => {
  const values = record.record_json || {};
  const normalized = new Map(Object.entries(values).map(([key, value]) => [key.trim().toLowerCase(), value]));
  for (const name of names) {
    const value = normalized.get(name.toLowerCase());
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
};

export default function BusinessOutreach() {
  const [activeTab, setActiveTab] = useState('leads');
  const [contacts, setContacts] = useState([]);
  const [history, setHistory] = useState([]);
  const [draftHistory, setDraftHistory] = useState([]);
  const [providers, setProviders] = useState({ smtp: false, whatsapp: false });
  const [sender, setSender] = useState({ name: '', email: '' });
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tone, setTone] = useState('professional');
  const [campaignGoal, setCampaignGoal] = useState('');
  const [brandName, setBrandName] = useState('');
  const [keyPoints, setKeyPoints] = useState(['']);
  const [channel, setChannel] = useState('email');
  const [subject, setSubject] = useState('Business invitation');
  const [draft, setDraft] = useState(() => localStorage.getItem('nexgtools_business_outreach_draft') || '');
  const [rewritePrompt, setRewritePrompt] = useState('');
  const [newLead, setNewLead] = useState(emptyLead);
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [editLead, setEditLead] = useState(null);
  const [deleteLead, setDeleteLead] = useState(null);
  const [deleteDraft, setDeleteDraft] = useState(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [importFileId, setImportFileId] = useState('');
  const [importSheets, setImportSheets] = useState([]);
  const [selectedImportRows, setSelectedImportRows] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingLead, setSavingLead] = useState(false);
  const [deletingLead, setDeletingLead] = useState(false);
  const [deletingDraft, setDeletingDraft] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadWorkspace = async () => {
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/outreach`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load business outreach.');
      setContacts(data.contacts || []);
      setHistory(data.history || []);
      setDraftHistory(data.drafts || []);
      setProviders(data.providers || { smtp: false, whatsapp: false });
      setSender(data.sender || { name: '', email: '' });
    } catch (loadError) {
      setError(loadError.message || 'Could not load business outreach.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, []);

  const latestStatusByContact = useMemo(() => {
    const statuses = new Map();
    history.forEach((item) => {
      if (!statuses.has(item.company_name)) {
        statuses.set(item.company_name, item.status === 'sent' ? 'Contacted' : 'Failed');
      }
    });
    return statuses;
  }, [history]);

  const leads = useMemo(() => contacts.map((contact) => ({
    ...contact,
    status: latestStatusByContact.get(contact.company_name) || 'New',
  })), [contacts, latestStatusByContact]);

  const filteredLeads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesQuery = !needle || [
        lead.company_name,
        lead.contact_person || '',
        lead.email || '',
        lead.phone || '',
        lead.website || '',
        lead.status,
      ].some((value) => String(value).toLowerCase().includes(needle));
      const matchesStatus = statusFilter === 'all' || lead.status.toLowerCase() === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [leads, query, statusFilter]);

  const selectedLeads = leads.filter((lead) => selectedLeadIds.includes(lead.id));
  const selectedChannelLeads = selectedLeads.filter((lead) => channel === 'email' ? lead.email : lead.phone);
  const selectedMissingChannelLeads = selectedLeads.filter((lead) => channel === 'email' ? !lead.email : !lead.phone);
  const providerReady = channel === 'email' ? providers.smtp : providers.whatsapp;
  const importRows = useMemo(() => importSheets.flatMap((sheet) => (sheet.records || []).map((record) => {
    const company = fieldValue(record, ['LEGAL NAME', 'Trade Name', 'Company', 'Company Name', 'Business Name']);
    return {
      id: `${sheet.id}-${record.record_number}`,
      sheet_id: sheet.id,
      sheet_name: sheet.name,
      record_number: record.record_number,
      company_name: company,
      contact_person: fieldValue(record, ['Contact Person', 'Contact Name', 'Name', 'Owner']),
      email: fieldValue(record, ['E-Mail', 'Email', 'Business Email', 'Mail']),
      phone: fieldValue(record, ['Mobile No.', 'Mobile No', 'Phone (WA)', 'Phone', 'WhatsApp', 'Whatsapp']),
      website: fieldValue(record, ['Website', 'Web Site', 'URL']),
      category: fieldValue(record, ['BUSINESS_CONST', 'Category', 'Business Type']) || 'data_library',
    };
  })).filter((row) => row.company_name && (row.email || row.phone)), [importSheets]);

  const toggleLead = (leadId) => {
    setSelectedLeadIds((current) => current.includes(leadId) ? current.filter((id) => id !== leadId) : [...current, leadId]);
  };

  const removeSelectedLead = (leadId) => {
    setSelectedLeadIds((current) => current.filter((id) => id !== leadId));
  };

  const toggleAllVisible = () => {
    const visibleIds = filteredLeads.map((lead) => lead.id);
    const everyVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedLeadIds.includes(id));
    setSelectedLeadIds((current) => everyVisibleSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]);
  };

  const updateKeyPoint = (index, value) => {
    setKeyPoints((current) => current.map((point, pointIndex) => pointIndex === index ? value : point));
  };

  const addKeyPoint = () => setKeyPoints((current) => [...current, '']);

  const applyCampaignTemplate = (template) => {
    setCampaignGoal(template.goal);
    setKeyPoints(template.keyPoints);
    setNotice(`${template.label} campaign template applied.`);
    setError('');
  };

  const openNewLeadModal = () => {
    setEditLead(null);
    setNewLead(emptyLead);
    setLeadModalOpen(true);
  };

  const openEditLeadModal = (lead) => {
    setEditLead(lead);
    setNewLead({
      company_name: lead.company_name || '',
      contact_person: lead.contact_person || '',
      email: lead.email || '',
      phone: lead.phone || '',
      website: lead.website || '',
      category: lead.category || 'manual',
    });
    setLeadModalOpen(true);
  };

  const closeLeadModal = () => {
    setLeadModalOpen(false);
    setEditLead(null);
    setNewLead(emptyLead);
  };

  const saveLead = async (event) => {
    event.preventDefault();
    setSavingLead(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/outreach/contacts${editLead ? `/${editLead.id}` : ''}`, {
        method: editLead ? 'PATCH' : 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(newLead),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not save lead.');
      setNotice(editLead ? 'Lead updated.' : 'Lead saved.');
      closeLeadModal();
      await loadWorkspace();
      if (data.contact?.id) setSelectedLeadIds((current) => [...new Set([...current, data.contact.id])]);
    } catch (saveError) {
      setError(saveError.message || 'Could not save lead.');
    } finally {
      setSavingLead(false);
    }
  };

  const confirmDeleteLead = async () => {
    if (!deleteLead || deletingLead) return;
    setDeletingLead(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/outreach/contacts/${deleteLead.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not delete lead.');
      setContacts((current) => current.filter((lead) => lead.id !== deleteLead.id));
      removeSelectedLead(deleteLead.id);
      setDeleteLead(null);
      setNotice('Lead deleted.');
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete lead.');
    } finally {
      setDeletingLead(false);
    }
  };

  const openImportModal = async () => {
    setImportModalOpen(true);
    setError('');
    setNotice('');
    setImportLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load Data Library workbooks.');
      const completed = (data.files || []).filter((file) => file.status === 'completed');
      setDocuments(completed);
      if (completed[0]?.id) {
        await openImportWorkbook(completed[0].id);
      } else {
        setImportFileId('');
        setImportSheets([]);
      }
    } catch (loadError) {
      setError(loadError.message || 'Could not load Data Library workbooks.');
    } finally {
      setImportLoading(false);
    }
  };

  const openImportWorkbook = async (fileId) => {
    setImportFileId(fileId);
    setSelectedImportRows([]);
    if (!fileId) {
      setImportSheets([]);
      return;
    }
    setImportLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/${fileId}/contents`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not open workbook.');
      setImportSheets(data.sheets || []);
    } catch (loadError) {
      setImportSheets([]);
      setError(loadError.message || 'Could not open workbook.');
    } finally {
      setImportLoading(false);
    }
  };

  const toggleImportRow = (rowId) => {
    setSelectedImportRows((current) => current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId]);
  };

  const toggleAllImportRows = () => {
    const rowIds = importRows.map((row) => row.id);
    const allSelected = rowIds.length > 0 && rowIds.every((rowId) => selectedImportRows.includes(rowId));
    setSelectedImportRows(allSelected ? [] : rowIds);
  };

  const importSelectedRows = async () => {
    const rows = importRows.filter((row) => selectedImportRows.includes(row.id));
    if (!rows.length) {
      setError('Select at least one workbook row to import.');
      return;
    }
    setImportSaving(true);
    setError('');
    setNotice('');
    let imported = 0;
    try {
      for (const row of rows) {
        const response = await fetch(`${API_BASE_URL}/api/outreach/contacts`, {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(row),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || `Could not import ${row.company_name}.`);
        imported += 1;
      }
      setNotice(`${imported} lead${imported === 1 ? '' : 's'} imported from Data Library.`);
      setImportModalOpen(false);
      setSelectedImportRows([]);
      await loadWorkspace();
    } catch (importError) {
      setError(importError.message || 'Could not import selected workbook rows.');
    } finally {
      setImportSaving(false);
    }
  };

  const requestGeneratedDraft = async ({ rewrite = false } = {}) => {
    if (!selectedLeads.length) {
      setError('Select at least one lead before generating content.');
      setActiveTab('leads');
      return;
    }
    if (!selectedChannelLeads.length) {
      setError(`Select at least one lead with ${channel === 'email' ? 'a business email' : 'a WhatsApp phone number'}.`);
      setActiveTab('leads');
      return;
    }
    if (rewrite && (!rewritePrompt.trim() || !draft.trim())) return;
    const setBusy = rewrite ? setRewriting : setGenerating;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/outreach/generate`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_ids: selectedChannelLeads.map((lead) => lead.id),
          channel,
          tone,
          campaign_goal: campaignGoal,
          brand_name: brandName,
          key_points: keyPoints,
          existing_draft: rewrite ? draft : '',
          rewrite_prompt: rewrite ? rewritePrompt : '',
          sender_name: sender.name || '',
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not generate outreach content.');
      if (channel === 'email' && data.subject) setSubject(data.subject);
      setDraft(data.message || '');
      localStorage.setItem('nexgtools_business_outreach_draft', data.message || '');
      setRewritePrompt('');
      setNotice(rewrite ? 'Draft rewritten with OpenAI.' : 'Draft generated with OpenAI.');
      setActiveTab('editor');
    } catch (generateError) {
      setError(generateError.message || 'Could not generate outreach content.');
    } finally {
      setBusy(false);
    }
  };

  const copyDraft = async () => {
    if (!draft.trim()) return;
    await navigator.clipboard.writeText(draft);
    setNotice('Draft copied.');
  };

  const saveDraft = async () => {
    if (!draft.trim()) {
      setError('Write or generate a draft before saving.');
      return;
    }
    setSavingDraft(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/outreach/drafts`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_ids: selectedChannelLeads.map((lead) => lead.id),
          channel,
          subject,
          message: draft,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not save draft.');
      localStorage.setItem('nexgtools_business_outreach_draft', draft);
      setDraftHistory((current) => [data.draft, ...current.filter((item) => item.id !== data.draft?.id)].filter(Boolean));
      setNotice('Draft saved to history.');
    } catch (saveError) {
      setError(saveError.message || 'Could not save draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  const loadDraftFromHistory = (item) => {
    setChannel(item.channel || 'email');
    setSubject(item.subject || 'Business invitation');
    setDraft(item.message || '');
    localStorage.setItem('nexgtools_business_outreach_draft', item.message || '');
    setSelectedLeadIds((item.contact_ids || []).filter((id) => leads.some((lead) => lead.id === id)));
    setNotice('Draft loaded.');
  };

  const confirmDeleteDraft = async () => {
    if (!deleteDraft || deletingDraft) return;
    setDeletingDraft(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/outreach/drafts/${deleteDraft.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not delete draft.');
      setDraftHistory((current) => current.filter((item) => item.id !== deleteDraft.id));
      setDeleteDraft(null);
      setNotice('Draft deleted.');
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete draft.');
    } finally {
      setDeletingDraft(false);
    }
  };

  const rewriteDraft = () => requestGeneratedDraft({ rewrite: true });

  const sendNow = async () => {
    if (!providerReady) {
      setError(channel === 'email' ? 'Company email is not configured yet.' : 'WhatsApp API is not configured yet.');
      return;
    }
    if (!selectedChannelLeads.length) {
      setError(`Select at least one lead with ${channel === 'email' ? 'a business email' : 'a WhatsApp phone number'}.`);
      setActiveTab('leads');
      return;
    }
    if (!draft.trim()) {
      setError('Generate or write a message before sending.');
      return;
    }
    setSending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/outreach/send`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_ids: selectedChannelLeads.map((lead) => lead.id),
          channel,
          subject,
          message: draft,
          sender_name: sender.name || '',
          reply_to_email: sender.email || '',
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not send outreach.');
      const results = data.results || [];
      const sent = results.filter((result) => result.status === 'sent').length;
      const failedResults = results.filter((result) => result.status === 'failed');
      const skippedResults = results.filter((result) => result.status === 'skipped');
      if (failedResults.length || skippedResults.length) {
        const problemResults = [...failedResults, ...skippedResults].slice(0, 3);
        const details = problemResults.map((result) => {
          const target = result.company_name || result.recipient || `Lead ${result.contact_id}`;
          return `${target}: ${result.detail || result.status}`;
        }).join(' | ');
        setError(`${sent} sent, ${failedResults.length} failed${skippedResults.length ? `, ${skippedResults.length} skipped` : ''}. ${details}`);
      } else {
        setNotice(`${sent} sent.`);
      }
      await loadWorkspace();
    } catch (sendError) {
      setError(sendError.message || 'Could not send outreach.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bo-page">
      <nav className="bo-top-tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return <button key={tab.id} type="button" className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}><Icon size={17} /><span>{tab.label}</span></button>;
        })}
      </nav>

      {(error || notice) && (
        <div className={`bo-alert ${error ? 'error' : 'success'}`}>
          {error ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{error || notice}</span>
          <button type="button" onClick={() => { setError(''); setNotice(''); }}><X size={14} /></button>
        </div>
      )}

      {activeTab === 'leads' && (
        <section className="bo-leads">
          <label className="bo-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search leads by company, contact, or email..." />
          </label>

          <div className="bo-leads-bar">
            <span>{leads.length.toLocaleString()} total leads</span>
            <div>
              <button type="button" className="bo-soft-btn" onClick={() => setStatusFilter((current) => current === 'all' ? 'new' : current === 'new' ? 'contacted' : current === 'contacted' ? 'failed' : 'all')}><Filter size={14} /> {statusFilter === 'all' ? 'Filter' : statusFilter}</button>
              <button type="button" className="bo-soft-btn" onClick={openImportModal}><Database size={14} /> Import Workbook</button>
              <button type="button" className="bo-dark-btn" onClick={openNewLeadModal}><Plus size={14} /> New Lead</button>
              <button type="button" className="bo-soft-btn" onClick={loadWorkspace} disabled={loading}><RefreshCw size={14} /> Refresh</button>
            </div>
          </div>

          <div className="bo-table-wrap">
            <table className="bo-table">
              <thead>
                <tr>
                  <th><input type="checkbox" checked={filteredLeads.length > 0 && filteredLeads.every((lead) => selectedLeadIds.includes(lead.id))} onChange={toggleAllVisible} /></th>
                  <th>Company</th>
                  <th>Contact Person</th>
                  <th>Business Email</th>
                  <th>Phone (WA)</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="7"><span className="bo-empty-inline"><Loader2 className="spin" size={16} /> Loading leads...</span></td></tr>
                ) : filteredLeads.length ? filteredLeads.map((lead) => (
                  <tr key={lead.id} onDoubleClick={() => toggleLead(lead.id)}>
                    <td><input type="checkbox" checked={selectedLeadIds.includes(lead.id)} onChange={() => toggleLead(lead.id)} /></td>
                    <td><span className="bo-initial">{lead.company_name[0]}</span>{lead.company_name}</td>
                    <td>{lead.contact_person || 'Not set'}</td>
                    <td>{lead.email || 'Not set'}</td>
                    <td>{lead.phone || 'Not set'}</td>
                    <td><span className={`bo-status bo-status-${statusClass(lead.status)}`}>{lead.status}</span></td>
                    <td>
                      <div className="bo-row-actions">
                        <button type="button" className="bo-row-edit" onClick={() => openEditLeadModal(lead)} title="Edit lead">
                          <Edit3 size={14} />
                          Edit
                        </button>
                        <button type="button" className="bo-row-delete" onClick={() => setDeleteLead(lead)} title="Delete lead">
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="7"><span className="bo-empty-inline">No real leads found. Import from Data Library workbook or add one manually.</span></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'generate' && (
        <section className="bo-generate">
          <div className="bo-field-group">
            <h2>Target Audience</h2>
            <div className="bo-audience">
              <div className="bo-audience-icon"><UserRound size={15} /></div>
              <div>
                <strong>{selectedLeadIds.length} Leads Selected</strong>
                <span>{selectedChannelLeads.length} reachable by {channel === 'email' ? 'email' : 'WhatsApp'}</span>
                <div className="bo-avatar-row">
                  {selectedLeads.slice(0, 3).map((lead) => <i key={lead.id}>{contactName(lead)[0]}</i>)}
                  {selectedLeadIds.length > 3 && <em>+{selectedLeadIds.length - 3}</em>}
                </div>
              </div>
              <button type="button" onClick={() => setActiveTab('leads')}><Edit3 size={15} /></button>
            </div>
          </div>

          <label className="bo-field-group">
            <span className="bo-required">Required</span>
            <h2>Campaign Goal</h2>
            <input value={campaignGoal} onChange={(event) => setCampaignGoal(event.target.value)} placeholder="e.g., Follow up and schedule a 10-minute discovery call..." />
            <div className="bo-template-row">
              {campaignTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={campaignGoal === template.goal ? 'active' : ''}
                  onClick={() => applyCampaignTemplate(template)}
                >
                  {template.label}
                </button>
              ))}
            </div>
          </label>

          <label className="bo-field-group">
            <h2>Brand / Company Name</h2>
            <input value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="e.g., Usedoil India" />
          </label>

          <div className="bo-field-group">
            <h2>Tone & Style</h2>
            <div className="bo-tone-row">
              {tones.map((item) => {
                const Icon = item.icon;
                return <button key={item.id} type="button" className={tone === item.id ? 'active' : ''} onClick={() => setTone(item.id)}><Icon size={14} /> {item.label}</button>;
              })}
            </div>
          </div>

          <div className="bo-field-group">
            <div className="bo-section-head">
              <h2>Key Points</h2>
              <button type="button" onClick={addKeyPoint}>+ Add Point</button>
            </div>
            <div className="bo-points">
              {keyPoints.map((point, index) => (
                <label key={`${index}-${keyPoints.length}`}>
                  <span>::</span>
                  <input value={point} onChange={(event) => updateKeyPoint(index, event.target.value)} placeholder="Type a real key point here..." />
                </label>
              ))}
            </div>
          </div>

          <button type="button" className="bo-generate-btn" onClick={() => requestGeneratedDraft()} disabled={generating}>
            {generating ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
            {generating ? 'Generating...' : 'Generate Content'}
          </button>
        </section>
      )}

      {activeTab === 'editor' && (
        <section className="bo-editor">
          <div className="bo-channel-tabs">
            <button type="button" className={channel === 'email' ? 'active' : ''} onClick={() => setChannel('email')}><Mail size={14} /> Email</button>
            <button type="button" className={channel === 'whatsapp' ? 'active' : ''} onClick={() => setChannel('whatsapp')}><MessageSquare size={14} /> WhatsApp</button>
          </div>

          <div className="bo-recipients-card">
            <div className="bo-recipients-head">
              <strong>To</strong>
              <span>{selectedChannelLeads.length} selected {channel === 'email' ? 'email' : 'WhatsApp number'}{selectedChannelLeads.length === 1 ? '' : 's'}</span>
              <button type="button" onClick={() => setActiveTab('leads')}><Edit3 size={14} /> Select Leads</button>
            </div>
            {selectedChannelLeads.length ? (
              <div className="bo-recipient-list">
                {selectedChannelLeads.map((lead) => (
                  <span key={lead.id}>
                    <b>{lead.company_name}</b>
                    <em>{channel === 'email' ? lead.email : lead.phone}</em>
                    <button type="button" onClick={() => removeSelectedLead(lead.id)} title="Remove recipient"><X size={12} /></button>
                  </span>
                ))}
              </div>
            ) : (
              <p>Select leads with {channel === 'email' ? 'business emails' : 'WhatsApp phone numbers'} from the Leads tab.</p>
            )}
            {selectedMissingChannelLeads.length > 0 && (
              <small>{selectedMissingChannelLeads.length} selected lead{selectedMissingChannelLeads.length === 1 ? '' : 's'} skipped because {channel === 'email' ? 'email is' : 'WhatsApp number is'} missing.</small>
            )}
          </div>

          <div className="bo-draft-card">
            <div className="bo-draft-head">
              <span><Bot size={18} /></span>
              <div><strong>{draft.trim() ? 'Draft Ready' : 'Draft Empty'}</strong><small>{selectedLeads[0] ? `Prepared for ${selectedLeads[0].company_name}` : 'Select leads and generate content'}</small></div>
              <button type="button" title="Copy draft" onClick={copyDraft} disabled={!draft.trim()}><Copy size={15} /></button>
            </div>
            {channel === 'email' && <input className="bo-subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Email subject" />}
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Generate content or write your message here..." />
            <label className="bo-rewrite">
              <input value={rewritePrompt} onChange={(event) => setRewritePrompt(event.target.value)} placeholder="e.g., Make it shorter and punchier..." />
              <button type="button" onClick={rewriteDraft} disabled={rewriting || !rewritePrompt.trim() || !draft.trim()}>
                {rewriting ? <Loader2 className="spin" size={15} /> : <Sparkles size={15} />}
              </button>
            </label>
          </div>

          <div className="bo-editor-actions">
            <button type="button" className="bo-soft-btn" onClick={saveDraft} disabled={savingDraft || !draft.trim()}>
              {savingDraft ? <Loader2 className="spin" size={15} /> : <Save size={15} />}
              Save Draft
            </button>
            <button type="button" className="bo-dark-btn" onClick={sendNow} disabled={sending || !draft.trim()}>
              {sending ? <Loader2 className="spin" size={15} /> : <Send size={15} />}
              Send Now
            </button>
          </div>

          <div className="bo-draft-history">
            <div className="bo-section-head">
              <h2>Draft History</h2>
              <span>{draftHistory.length} saved</span>
            </div>
            {draftHistory.length ? (
              <div className="bo-draft-history-list">
                {draftHistory.map((item) => (
                  <div className="bo-draft-history-item" key={item.id}>
                  <button type="button" onClick={() => loadDraftFromHistory(item)}>
                    <span>
                      <strong>{item.subject || (item.channel === 'whatsapp' ? 'WhatsApp draft' : 'Business invitation')}</strong>
                      <small>{item.channel === 'email' ? 'Email' : 'WhatsApp'} · {(item.contact_ids || []).length} lead{(item.contact_ids || []).length === 1 ? '' : 's'} · {item.updated_at ? new Date(item.updated_at).toLocaleString() : 'Saved'}</small>
                    </span>
                    <em>{(item.message || '').slice(0, 120)}{(item.message || '').length > 120 ? '...' : ''}</em>
                  </button>
                  <button type="button" className="bo-draft-delete" onClick={() => setDeleteDraft(item)} title="Delete draft">
                    <X size={14} />
                  </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="bo-empty-inline">Saved drafts will appear here.</p>
            )}
          </div>
        </section>
      )}

      {leadModalOpen && (
        <div className="bo-modal-backdrop" role="presentation" onMouseDown={closeLeadModal}>
          <form className="bo-modal" onSubmit={saveLead} onMouseDown={(event) => event.stopPropagation()}>
            <div className="bo-section-head"><h2>{editLead ? 'Edit Lead' : 'New Lead'}</h2><button type="button" onClick={closeLeadModal}><X size={16} /></button></div>
            <label><span>Company</span><input value={newLead.company_name} onChange={(event) => setNewLead((current) => ({ ...current, company_name: event.target.value }))} required /></label>
            <label><span>Contact person</span><input value={newLead.contact_person} onChange={(event) => setNewLead((current) => ({ ...current, contact_person: event.target.value }))} /></label>
            <label><span>Business email</span><input type="email" value={newLead.email} onChange={(event) => setNewLead((current) => ({ ...current, email: event.target.value }))} /></label>
            <label><span>Phone (WA)</span><input value={newLead.phone} onChange={(event) => setNewLead((current) => ({ ...current, phone: event.target.value }))} /></label>
            <label><span>Website</span><input value={newLead.website} onChange={(event) => setNewLead((current) => ({ ...current, website: event.target.value }))} /></label>
            <button className="bo-dark-btn" disabled={savingLead}>{savingLead ? 'Saving...' : editLead ? 'Update Lead' : 'Save Lead'}</button>
          </form>
        </div>
      )}

      {deleteLead && (
        <div className="bo-modal-backdrop" role="presentation" onMouseDown={() => setDeleteLead(null)}>
          <div className="bo-modal bo-confirm-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="bo-section-head">
              <h2>Delete Lead</h2>
              <button type="button" onClick={() => setDeleteLead(null)}><X size={16} /></button>
            </div>
            <p>Delete <strong>{deleteLead.company_name}</strong> from Business Outreach leads?</p>
            <div className="bo-confirm-actions">
              <button type="button" className="bo-soft-btn" onClick={() => setDeleteLead(null)} disabled={deletingLead}>Cancel</button>
              <button type="button" className="bo-danger-btn" onClick={confirmDeleteLead} disabled={deletingLead}>
                {deletingLead ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}
                Delete Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteDraft && (
        <div className="bo-modal-backdrop" role="presentation" onMouseDown={() => setDeleteDraft(null)}>
          <div className="bo-modal bo-confirm-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="bo-section-head">
              <h2>Delete Draft</h2>
              <button type="button" onClick={() => setDeleteDraft(null)}><X size={16} /></button>
            </div>
            <p>Delete this saved draft?</p>
            <div className="bo-confirm-actions">
              <button type="button" className="bo-soft-btn" onClick={() => setDeleteDraft(null)} disabled={deletingDraft}>Cancel</button>
              <button type="button" className="bo-danger-btn" onClick={confirmDeleteDraft} disabled={deletingDraft}>
                {deletingDraft ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}
                Delete Draft
              </button>
            </div>
          </div>
        </div>
      )}

      {importModalOpen && (
        <div className="bo-modal-backdrop" role="presentation" onMouseDown={() => setImportModalOpen(false)}>
          <div className="bo-modal bo-import-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="bo-section-head">
              <h2>Import From Data Library</h2>
              <button type="button" onClick={() => setImportModalOpen(false)}><X size={16} /></button>
            </div>

            <label>
              <span>Completed workbook</span>
              <select value={importFileId} onChange={(event) => openImportWorkbook(event.target.value)}>
                <option value="">Choose workbook</option>
                {documents.map((file) => (
                  <option key={file.id} value={file.id}>{file.filename}</option>
                ))}
              </select>
            </label>

            <div className="bo-import-summary">
              {importLoading ? <span><Loader2 className="spin" size={15} /> Loading workbook...</span>
                : importRows.length ? <span>{importRows.length} importable rows with company and email/phone</span>
                  : <span>No importable rows found. Rows need company plus email or WhatsApp phone.</span>}
              <button type="button" onClick={toggleAllImportRows} disabled={!importRows.length}>{selectedImportRows.length === importRows.length && importRows.length ? 'Clear' : 'Select all'}</button>
            </div>

            <div className="bo-import-table-wrap">
              <table className="bo-table bo-import-table">
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={importRows.length > 0 && selectedImportRows.length === importRows.length} onChange={toggleAllImportRows} /></th>
                    <th>Company</th>
                    <th>Contact</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Sheet</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.slice(0, 200).map((row) => (
                    <tr key={row.id}>
                      <td><input type="checkbox" checked={selectedImportRows.includes(row.id)} onChange={() => toggleImportRow(row.id)} /></td>
                      <td>{row.company_name}</td>
                      <td>{row.contact_person || 'Not set'}</td>
                      <td>{row.email || 'Not set'}</td>
                      <td>{row.phone || 'Not set'}</td>
                      <td>{row.sheet_name}</td>
                    </tr>
                  ))}
                  {!importRows.length && (
                    <tr><td colSpan="6"><span className="bo-empty-inline">Choose a completed Data Library workbook to preview importable leads.</span></td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {importRows.length > 200 && <small className="bo-helper">Showing first 200 importable rows. Select all imports every importable row.</small>}
            <button type="button" className="bo-dark-btn" onClick={importSelectedRows} disabled={!selectedImportRows.length || importSaving}>
              {importSaving ? 'Importing...' : `Import ${selectedImportRows.length} Lead${selectedImportRows.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
