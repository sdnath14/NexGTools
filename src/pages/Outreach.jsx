import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Mail, MessageCircle, RefreshCw, Search, Send, Users } from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './Outreach.css';

const DEFAULT_EMAIL = `Hello {{company_name}},\n\nWe would like to introduce our company and explore a potential business collaboration with you. Please let us know a convenient time to connect.\n\nBest regards,`;
const DEFAULT_WHATSAPP = `Hello {{company_name}}, we would like to invite you to discuss a potential business collaboration. Please let us know a convenient time to connect.`;

const Outreach = () => {
  const [contacts, setContacts] = useState([]);
  const [history, setHistory] = useState([]);
  const [providers, setProviders] = useState({ smtp: false, whatsapp: false });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [channel, setChannel] = useState('email');
  const [subject, setSubject] = useState('Business collaboration invitation');
  const [message, setMessage] = useState(DEFAULT_EMAIL);
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
    } catch (loadError) {
      setError(loadError.message || 'Could not load outreach contacts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadWorkspace(); }, []);

  const eligibleContacts = useMemo(
    () => contacts.filter((contact) => channel === 'email' ? contact.email : contact.phone),
    [contacts, channel],
  );
  const visibleContacts = useMemo(() => {
    const value = filter.trim().toLowerCase();
    if (!value) return contacts;
    return contacts.filter((contact) => [contact.company_name, contact.search_name, contact.email, contact.phone]
      .some((field) => String(field || '').toLowerCase().includes(value)));
  }, [contacts, filter]);
  const allEligibleSelected = eligibleContacts.length > 0 && eligibleContacts.every((contact) => selectedIds.has(contact.id));

  const changeChannel = (nextChannel) => {
    setChannel(nextChannel);
    setMessage(nextChannel === 'email' ? DEFAULT_EMAIL : DEFAULT_WHATSAPP);
    setSelectedIds(new Set());
    setNotice('');
  };

  const toggleContact = (id) => {
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
        body: JSON.stringify({ contact_ids: [...selectedIds], channel, subject, message }),
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
              <div><h2>Scraped contacts</h2><p>Company name, original search, email, and phone.</p></div>
              <label className="outreach-search"><Search size={15} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter contacts" /></label>
            </div>
            <label className="outreach-select-all"><input type="checkbox" checked={allEligibleSelected} onChange={toggleAll} disabled={!eligibleContacts.length} /> Select all available for {channel}</label>
            <div className="outreach-contact-list">
              {loading ? <div className="outreach-empty">Loading contacts…</div> : visibleContacts.length ? visibleContacts.map((contact) => {
                const eligible = channel === 'email' ? Boolean(contact.email) : Boolean(contact.phone);
                return (
                  <label className={`outreach-contact ${selectedIds.has(contact.id) ? 'selected' : ''} ${!eligible ? 'disabled' : ''}`} key={contact.id}>
                    <input type="checkbox" checked={selectedIds.has(contact.id)} disabled={!eligible} onChange={() => toggleContact(contact.id)} />
                    <span className="outreach-contact-main"><strong>{contact.company_name}</strong><small>Searched: {contact.search_name || 'Lead search'}</small></span>
                    <span className="outreach-contact-values"><span><Mail size={13} /> {contact.email || 'No email'}</span><span><MessageCircle size={13} /> {contact.phone || 'No phone'}</span></span>
                  </label>
                );
              }) : <div className="outreach-empty">No scraped contacts yet. Scrape a selected lead website to add contacts here.</div>}
            </div>
          </section>

          <section className="outreach-card composer-card">
            <div className="outreach-card-head"><div><h2>Business invitation</h2><p>{selectedIds.size} recipient{selectedIds.size === 1 ? '' : 's'} selected</p></div></div>
            <div className="outreach-channel-picker">
              <button className={channel === 'email' ? 'active' : ''} onClick={() => changeChannel('email')}><Mail size={16} /> Company SMTP</button>
              <button className={channel === 'whatsapp' ? 'active' : ''} onClick={() => changeChannel('whatsapp')}><MessageCircle size={16} /> WhatsApp API</button>
            </div>
            <div className={`outreach-provider ${providers[channel === 'email' ? 'smtp' : 'whatsapp'] ? 'ready' : ''}`}>
              {providers[channel === 'email' ? 'smtp' : 'whatsapp'] ? 'Provider configured' : 'Provider credentials are not configured on the server'}
            </div>
            {channel === 'email' && <label className="outreach-field"><span>Subject</span><input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>}
            <label className="outreach-field"><span>Editable message</span><textarea rows="12" value={message} onChange={(event) => setMessage(event.target.value)} /></label>
            <small className="outreach-token-help">Use <code>{'{{company_name}}'}</code> to personalize each invitation.</small>
            <button className="outreach-send" onClick={sendInvitations} disabled={!selectedIds.size || !message.trim() || sending || !providers[channel === 'email' ? 'smtp' : 'whatsapp']}><Send size={17} /> {sending ? 'Sending…' : `Send via ${channel === 'email' ? 'SMTP' : 'WhatsApp'}`}</button>
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
