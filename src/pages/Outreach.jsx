import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Mail, MessageCircle, RefreshCw, Search, Send, Users } from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './Outreach.css';

const DEFAULT_EMAIL = `Hello {{company_name}},\n\nWe would like to introduce our company and explore a potential business collaboration with you. Please let us know a convenient time to connect.\n\nBest regards,`;
const DEFAULT_WHATSAPP = `Hello {{company_name}}, we would like to invite you to discuss a potential business collaboration. Please let us know a convenient time to connect.`;

const OUTREACH_TEMPLATES = {
  general: {
    label: 'General business',
    subject: 'Business collaboration invitation',
    email: DEFAULT_EMAIL,
    whatsapp: DEFAULT_WHATSAPP,
  },
  garage: {
    label: 'Garage',
    subject: 'Used oil handling enquiry',
    email: `Hello {{company_name}},\n\nI hope this message finds you well. I am interested in understanding your process regarding the amount of used oil produced during car servicing and how it is managed or disposed of.\n\nCould you please provide details on your used oil handling and environmental practices?\n\nThank you for your assistance.\n\nTeam UsedOilIndia`,
    whatsapp: `Hello {{company_name}}, could you please provide details on the used oil produced during car servicing and your handling, disposal, and environmental practices?\n\nThank you for your assistance.\nTeam UsedOilIndia`,
  },
  hotels: {
    label: 'Hotels',
    subject: 'Used cooking oil handling enquiry',
    email: `Hello {{company_name}},\n\nWe would like to understand how your hotel manages used cooking oil from its kitchen operations, including collection, storage, and disposal.\n\nCould you please share details of your current process and sustainability practices?\n\nThank you for your assistance.\n\nTeam UsedOilIndia`,
    whatsapp: `Hello {{company_name}}, could you share how your hotel collects, stores, and disposes of used cooking oil from kitchen operations?\n\nThank you.\nTeam UsedOilIndia`,
  },
  restaurants: {
    label: 'Restaurants',
    subject: 'Used cooking oil collection enquiry',
    email: `Hello {{company_name}},\n\nWe are interested in learning how your restaurant manages used cooking oil, including the quantity generated and its collection or disposal process.\n\nCould you please share details of your current practices?\n\nThank you for your assistance.\n\nTeam UsedOilIndia`,
    whatsapp: `Hello {{company_name}}, could you share how much used cooking oil your restaurant generates and how it is collected or disposed of?\n\nThank you.\nTeam UsedOilIndia`,
  },
  manufacturing: {
    label: 'Manufacturing',
    subject: 'Industrial used oil management enquiry',
    email: `Hello {{company_name}},\n\nWe would like to understand your process for managing used industrial oil, including storage, recycling, and authorized disposal.\n\nCould you please provide details of your current oil-management and environmental practices?\n\nThank you for your assistance.\n\nTeam UsedOilIndia`,
    whatsapp: `Hello {{company_name}}, could you provide details of how your facility stores, recycles, or disposes of used industrial oil?\n\nThank you.\nTeam UsedOilIndia`,
  },
};

const Outreach = () => {
  const [contacts, setContacts] = useState([]);
  const [history, setHistory] = useState([]);
  const [providers, setProviders] = useState({ smtp: false, whatsapp: false });
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [replyToEmail, setReplyToEmail] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [channel, setChannel] = useState('email');
  const [subject, setSubject] = useState('Business collaboration invitation');
  const [message, setMessage] = useState(DEFAULT_EMAIL);
  const [templateId, setTemplateId] = useState('general');
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState('contacts');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadWorkspace = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/outreach`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load outreach contacts.');
      setContacts(data.contacts || []);
      setHistory(data.history || []);
      setProviders(data.providers || {});
      setSenderName((current) => current || data.sender?.name || '');
      setSenderEmail(data.sender?.email || '');
      setReplyToEmail((current) => current || data.sender?.email || '');
    } catch (loadError) {
      setError(loadError.message || 'Could not load outreach contacts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadWorkspace(); }, []);

  const eligibleContacts = useMemo(
    () => contacts.filter((contact) => (
      channel === 'email'
        ? Boolean(contact.email)
        : !contact.email && Boolean(contact.phone)
    )),
    [contacts, channel],
  );
  const visibleContacts = useMemo(() => {
    const value = filter.trim().toLowerCase();
    if (!value) return eligibleContacts;
    return eligibleContacts.filter((contact) => [contact.company_name, contact.search_name, contact.email, contact.phone]
      .some((field) => String(field || '').toLowerCase().includes(value)));
  }, [eligibleContacts, filter]);
  const allEligibleSelected = eligibleContacts.length > 0 && eligibleContacts.every((contact) => selectedIds.has(contact.id));
  const selectedContacts = useMemo(
    () => contacts.filter((contact) => selectedIds.has(contact.id)),
    [contacts, selectedIds],
  );
  const selectedRecipientCount = selectedContacts.filter(
    (contact) => channel === 'email' ? contact.email : contact.phone,
  ).length;
  const selectedCompanyLabel = selectedContacts.length === 1
    ? selectedContacts[0].company_name
    : selectedContacts.length > 1
      ? `${selectedContacts.length} companies`
      : 'a company';

  const applyTemplate = (nextTemplateId, nextChannel = channel) => {
    const template = OUTREACH_TEMPLATES[nextTemplateId] || OUTREACH_TEMPLATES.general;
    setTemplateId(nextTemplateId);
    setSubject(template.subject);
    setMessage(template[nextChannel]);
  };

  const changeChannel = (nextChannel) => {
    setChannel(nextChannel);
    setMessage((OUTREACH_TEMPLATES[templateId] || OUTREACH_TEMPLATES.general)[nextChannel]);
    setSelectedIds(new Set());
    setNotice('');
  };

  const toggleContact = (id) => {
    const contact = contacts.find((item) => item.id === id);
    if (!selectedIds.has(id) && contact?.category && OUTREACH_TEMPLATES[contact.category]) {
      applyTemplate(contact.category);
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds(allEligibleSelected ? new Set() : new Set(eligibleContacts.map((contact) => contact.id)));
  };

  const sendInvitations = async () => {
    if (!selectedIds.size || !message.trim() || sending) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/outreach/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          contact_ids: [...selectedIds], channel, subject, message,
          sender_name: senderName, reply_to_email: replyToEmail,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not send invitations.');
      const sent = (data.results || []).filter((result) => result.status === 'sent').length;
      const failed = (data.results || []).filter((result) => result.status === 'failed').length;
      setNotice(`${sent} invitation${sent === 1 ? '' : 's'} sent${failed ? `; ${failed} failed` : ''}.`);
      setSelectedIds(new Set());
      await loadWorkspace();
    } catch (sendError) {
      setError(sendError.message || 'Could not send invitations.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="outreach-page">
      <header className="outreach-header">
        <div><h1>Company Outreach</h1><p>Select contacts captured from lead searches and website scrapes, then send business invitations.</p></div>
        <button type="button" className="outreach-secondary" onClick={loadWorkspace} disabled={loading}><RefreshCw size={16} /> Refresh</button>
      </header>

      <div className="outreach-tabs">
        <button className={tab === 'contacts' ? 'active' : ''} onClick={() => setTab('contacts')}><Users size={16} /> Contacts ({contacts.length})</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><MessageCircle size={16} /> Communication history ({history.length})</button>
      </div>

      {error && <div className="outreach-alert error"><AlertCircle size={16} /> {error}</div>}
      {notice && <div className="outreach-alert success"><CheckCircle2 size={16} /> {notice}</div>}

      {tab === 'contacts' ? (
        <div className="outreach-grid">
          <section className="outreach-card contacts-card">
            <div className="outreach-card-head">
              <div>
                <h2>{channel === 'email' ? 'Companies with email' : 'WhatsApp-only companies'}</h2>
                <p>{channel === 'email' ? 'All companies with an available email address.' : 'Companies without email that have a phone or WhatsApp number.'}</p>
              </div>
              <div className="outreach-contact-channel-filter" role="group" aria-label="Filter contacts by outreach channel">
                <button type="button" className={channel === 'email' ? 'active email' : ''} onClick={() => changeChannel('email')}><Mail size={15} /> Email</button>
                <button type="button" className={channel === 'whatsapp' ? 'active whatsapp' : ''} onClick={() => changeChannel('whatsapp')}><MessageCircle size={15} /> WhatsApp</button>
              </div>
              <label className="outreach-search"><Search size={15} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter contacts" /></label>
            </div>
            <label className="outreach-select-all"><input type="checkbox" checked={allEligibleSelected} onChange={toggleAll} disabled={!eligibleContacts.length} /> Select all {channel === 'email' ? 'email contacts' : 'WhatsApp contacts'}</label>
            <div className="outreach-contact-list">
              {loading ? <div className="outreach-empty">Loading contacts…</div> : visibleContacts.length ? visibleContacts.map((contact) => {
                return (
                  <label className={`outreach-contact ${selectedIds.has(contact.id) ? 'selected' : ''}`} key={contact.id}>
                    <input type="checkbox" checked={selectedIds.has(contact.id)} onChange={() => toggleContact(contact.id)} />
                    <span className="outreach-contact-main">
                      <strong>{contact.company_name}</strong>
                      <small>{OUTREACH_TEMPLATES[contact.category]?.label || 'General business'} · Searched: {contact.search_name || 'Lead search'}</small>
                    </span>
                    <span className="outreach-contact-values">
                      {channel === 'email' ? <span><Mail size={13} /> {contact.email}</span> : <span><MessageCircle size={13} /> {contact.phone}</span>}
                    </span>
                  </label>
                );
              }) : <div className="outreach-empty">{filter.trim() ? 'No contacts match this filter.' : channel === 'email' ? 'No companies with email addresses are available.' : 'No companies without email and with a WhatsApp number are available.'}</div>}
            </div>
          </section>

          <section className={`outreach-card composer-card ${channel}`}>
            <div className="outreach-compose-title">
              {channel === 'email' ? <Mail size={18} /> : <MessageCircle size={18} />}
              <div>
                <strong>{channel === 'email' ? 'Mailing' : 'WhatsApp message'} to {selectedCompanyLabel}</strong>
                <small>{OUTREACH_TEMPLATES[templateId].label}</small>
              </div>
            </div>
            <div className={`outreach-provider ${providers[channel === 'email' ? 'smtp' : 'whatsapp'] ? 'ready' : ''}`}>
              {providers[channel === 'email' ? 'smtp' : 'whatsapp'] ? 'Provider configured' : 'Provider credentials are not configured on the server'}
            </div>
            <div className="outreach-compose-sheet">
              <label className="outreach-template-picker">
                <span>Template Name</span>
                <select value={templateId} onChange={(event) => applyTemplate(event.target.value)}>
                  {Object.entries(OUTREACH_TEMPLATES).map(([id, template]) => (
                    <option value={id} key={id}>{template.label}</option>
                  ))}
                </select>
              </label>
              {channel === 'email' ? (
                <>
                  <div className="outreach-compose-row">
                    <span>From</span>
                    <input value={senderName} onChange={(event) => setSenderName(event.target.value)} placeholder="Your name or company name" aria-label="Sender name" />
                    <small>{senderEmail || 'SMTP email not configured'}</small>
                  </div>
                  <div className="outreach-compose-row">
                    <span>Reply to</span>
                    <input type="email" value={replyToEmail} onChange={(event) => setReplyToEmail(event.target.value)} placeholder="your-company@example.com" aria-label="Reply-to email" />
                  </div>
                </>
              ) : null}
              <div className="outreach-compose-row outreach-to-row">
                <span>To</span>
                <div className="outreach-recipient-chips">
                  {selectedContacts.length ? selectedContacts.map((contact) => (
                    <span className={`outreach-recipient-chip ${!(channel === 'email' ? contact.email : contact.phone) ? 'missing' : ''}`} key={contact.id} title={channel === 'email' ? contact.email : contact.phone}>
                      <strong>{contact.company_name}</strong>
                      <small>{(channel === 'email' ? contact.email : contact.phone) || `No ${channel === 'email' ? 'email' : 'number'}`}</small>
                      <button type="button" onClick={() => toggleContact(contact.id)} aria-label={`Remove ${contact.company_name}`}>×</button>
                    </span>
                  )) : <em>Select a company from the contact list</em>}
                </div>
              </div>
              {channel === 'email' ? <input className="outreach-compose-subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Email subject" aria-label="Email subject" /> : null}
              <textarea className="outreach-compose-message" rows="13" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write your message" aria-label="Message" />
              <div className="outreach-compose-footer">
                <button className="outreach-send" onClick={sendInvitations} disabled={!selectedRecipientCount || !message.trim() || sending || !providers[channel === 'email' ? 'smtp' : 'whatsapp']}><Send size={17} /> {sending ? 'Sending…' : `Send via ${channel === 'email' ? 'Email' : 'WhatsApp'}`}</button>
                <small>Use <code>{'{{company_name}}'}</code> to personalize each invitation.</small>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <section className="outreach-card history-card">
          <div className="outreach-card-head"><div><h2>Communication history</h2><p>Stored delivery attempts for email and WhatsApp.</p></div></div>
          <div className="outreach-history-list">
            {history.length ? history.map((item) => <div className="outreach-history-row" key={item.id}><span className={`outreach-history-icon ${item.channel}`}>{item.channel === 'email' ? <Mail size={16} /> : <MessageCircle size={16} />}</span><span><strong>{item.company_name}</strong><small>{item.recipient}</small></span><span className="outreach-history-message">{item.subject || item.message}</span><span className={`outreach-status ${item.status}`}>{item.status}</span><time>{new Date(item.created_at).toLocaleString()}</time></div>) : <div className="outreach-empty">No invitations have been sent yet.</div>}
          </div>
        </section>
      )}
    </div>
  );
};

export default Outreach;
