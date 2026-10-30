import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, HandCoins, MapPin, ReceiptText, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Download, Eye, FileText, Pencil, PieChart, Plus, Search, SlidersHorizontal, Trash2, TrendingUp, UploadCloud, UsersRound, Wallet, X } from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './ExpenseTracker.css';
import { expenseSummary } from '../expenseSummary';

const categories = ['Travel', 'Food', 'Stationery', 'Office Supplies', 'Business Development', 'Loading/Unloading', 'Other'];
const colors = ['#b92c28', '#dfa62d', '#514d45', '#9d7852', '#59705a', '#557ca2', '#8766a0', '#b6afa2'];
const blank = { client_name: '', location: '', category: 'Travel', particulars: '', amount: '', expense_type: 'Reimbursement', payment_method: 'UPI', upi_id: '', account_number: '', ifsc_code: '', attachment: null };
const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const dateLabel = (value) => new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const statusOptions = ['All', 'Pending', 'Approved', 'Rejected', 'Reimbursed', 'Issue Raised'];
const pageSize = 8;

function ExpenseAttachment({ item, onDownload }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const previewUrl = useRef(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); };
  }, []);
  const view = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/expenses/${item.id}/attachment`, { headers: authHeaders() });
      if (!response.ok) throw new Error(response.status === 404 ? 'The attachment is no longer available.' : 'Could not load attachment.');
      const blob = await response.blob();
      if (!active.current) return;
      const type = blob.type.split(';')[0];
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(type)) throw new Error('Preview is unavailable for this file. Use Download receipt.');
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(blob);
      setPreview({ url: previewUrl.current, type });
    } catch (err) { if (active.current) setError(err.message); }
    finally { if (active.current) setBusy(false); }
  };
  return <div className="expense-attachment">
    <div className="expense-attachment-actions"><button type="button" className="expense-generate" onClick={view} disabled={busy}><Eye size={16} /> {busy ? 'Loading…' : 'View attachment'}</button><button type="button" className="expense-generate" onClick={() => onDownload(item)}><Download size={16} /> Download receipt</button></div>
    {error && <p role="alert">{error}</p>}
    {preview && (preview.type === 'application/pdf' ? <iframe title={`Receipt for ${item.particulars}`} src={preview.url} /> : <img src={preview.url} alt={`Receipt for ${item.particulars}`} />)}
  </div>;
}

export default function ExpenseTracker({ user }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const openedExpenseId = useRef(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyType, setHistoryType] = useState('Advance');
  const [savedMessage, setSavedMessage] = useState('');
  const [editingExpense, setEditingExpense] = useState(null);
  const [details, setDetails] = useState(null);
  const [deleteGroup, setDeleteGroup] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState(blank);
  const [advanceReason, setAdvanceReason] = useState('client');
  const [extraItems, setExtraItems] = useState([]);
  const [activeItem, setActiveItem] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [expandedBatches, setExpandedBatches] = useState([]);
  const [expandedCards, setExpandedCards] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortBy, setSortBy] = useState('date');
  const [sortAscending, setSortAscending] = useState(false);
  const [page, setPage] = useState(1);
  const [activeMenu, setActiveMenu] = useState(null);
  const actionMenuRef = useRef(null);
  const [issueExpense, setIssueExpense] = useState(null);
  const [issueNote, setIssueNote] = useState('');
  const [noteAction, setNoteAction] = useState('Issue Raised');
  const [billMonth, setBillMonth] = useState('');
  const [billUser, setBillUser] = useState('');
  const [billBusy, setBillBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/expenses`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load expenses.');
      setExpenses(data.expenses || []);
      setError('');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    load();
    const refresh = () => { if (!document.hidden) load(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [load]);
  useLayoutEffect(() => {
    const menu = actionMenuRef.current;
    if (!activeMenu || !menu) return;
    const top = activeMenu.bottom + menu.offsetHeight + 6 > window.innerHeight - 8
      ? activeMenu.top - menu.offsetHeight - 6 : activeMenu.bottom + 6;
    menu.style.top = `${Math.max(8, Math.min(top, window.innerHeight - menu.offsetHeight - 8))}px`;
    menu.style.left = `${Math.max(8, Math.min(activeMenu.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8))}px`;
  }, [activeMenu]);
  useEffect(() => {
    if (!activeMenu) return undefined;
    const close = () => setActiveMenu(null);
    const closeOutside = (event) => {
      if (!actionMenuRef.current?.contains(event.target) && !event.target.closest('.expense-actions')) close();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('pointerdown', closeOutside);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('pointerdown', closeOutside);
    };
  }, [activeMenu]);

  const summary = useMemo(() => expenseSummary(expenses), [expenses]);
  const total = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const reportCategories = useMemo(() => [...new Set([...categories, ...expenses.map((item) => item.category).filter(Boolean)])], [expenses]);
  const categoryTotals = useMemo(() => reportCategories.map((category, index) => ({ category, color: colors[index % colors.length], total: expenses.filter((item) => item.category === category).reduce((sum, item) => sum + Number(item.amount), 0) })), [expenses, reportCategories]);
  const monthData = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const month = new Date(); month.setDate(1); month.setMonth(month.getMonth() - 5 + index);
    return { label: month.toLocaleDateString('en-IN', { month: 'short' }), total: expenses.filter((item) => { const date = new Date(item.created_at); return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth(); }).reduce((sum, item) => sum + Number(item.amount), 0) };
  }), [expenses]);
  const maxMonth = Math.max(...monthData.map((item) => item.total), 1);
  const donut = total ? categoryTotals.map((item, index) => `${item.color} ${categoryTotals.slice(0, index).reduce((sum, entry) => sum + entry.total, 0) / total * 100}% ${categoryTotals.slice(0, index + 1).reduce((sum, entry) => sum + entry.total, 0) / total * 100}%`).join(', ') : '#e9eef3 0% 100%';
  const expenseGroups = useMemo(() => {
    const groups = [];
    const byBatch = new Map();
    expenses.forEach((item) => {
      if (!item.batch_id) { groups.push({ id: `expense-${item.id}`, items: [item] }); return; }
      let group = byBatch.get(item.batch_id);
      if (!group) { group = { id: item.batch_id, items: [] }; byBatch.set(item.batch_id, group); groups.push(group); }
      group.items.push(item);
    });
    return groups;
  }, [expenses]);
  const requestHistory = useMemo(() => Object.fromEntries(['Advance', 'Reimbursement'].map((type) => [type, expenseGroups.filter((group) => group.items[0].expense_type === type).sort((a, b) => new Date(b.items[0].created_at) - new Date(a.items[0].created_at))])), [expenseGroups]);
  const latestRequests = useMemo(() => [requestHistory.Advance[0], requestHistory.Reimbursement[0]].filter(Boolean).sort((a, b) => new Date(b.items[0].created_at) - new Date(a.items[0].created_at)), [requestHistory]);
  const scopedGroups = useMemo(() => expenseGroups.filter((group) => {
    const first = group.items[0];
    const query = searchTerm.trim().toLowerCase();
    return (!billMonth || first.created_at?.startsWith(billMonth))
      && (!billUser || !user?.is_nexg_admin || String(first.user_id) === billUser)
      && (categoryFilter === 'All' || first.category === categoryFilter)
      && (!query || group.items.some((item) => [item.category, item.particulars, item.submitted_by, item.expense_type].some((value) => String(value || '').toLowerCase().includes(query))));
  }), [expenseGroups, billMonth, billUser, user?.is_nexg_admin, categoryFilter, searchTerm]);
  const statusCounts = useMemo(() => Object.fromEntries(statusOptions.map((status) => [status, status === 'All' ? scopedGroups.length : scopedGroups.filter((group) => group.items.some((item) => item.status === status)).length])), [scopedGroups]);
  const filteredGroups = useMemo(() => scopedGroups.filter((group) => statusFilter === 'All' || group.items.some((item) => item.status === statusFilter)).sort((a, b) => {
    const value = (group) => {
      const first = group.items[0];
      if (sortBy === 'date') return new Date(first.created_at).getTime();
      if (sortBy === 'amount') return group.items.reduce((sum, item) => sum + Number(item.amount), 0);
      if (sortBy === 'particulars') return first.particulars.toLowerCase();
      if (sortBy === 'status') return first.status.toLowerCase();
      if (sortBy === 'type') return first.expense_type.toLowerCase();
      if (sortBy === 'payment') return first.payment_method.toLowerCase();
      return String(first.category || '').toLowerCase();
    };
    const left = value(a);
    const right = value(b);
    const comparison = typeof left === 'number' ? left - right : left.localeCompare(right);
    return (sortAscending ? comparison : -comparison) || b.items[0].id - a.items[0].id;
  }), [scopedGroups, statusFilter, sortBy, sortAscending]);
  const pageCount = Math.max(1, Math.ceil(filteredGroups.length / pageSize));
  const visibleGroups = filteredGroups.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { setPage(1); }, [statusFilter, searchTerm, categoryFilter, billMonth, billUser, sortBy, sortAscending]);
  const sortTable = (field) => { setSortAscending((current) => sortBy === field ? !current : true); setSortBy(field); };
  const monthRangeLabel = billMonth ? (() => { const [year, month] = billMonth.split('-').map(Number); const start = new Date(year, month - 1, 1); const end = new Date(year, month, 0); return `${dateLabel(start)} – ${dateLabel(end)}`; })() : 'All dates';

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const updateExtraItem = (index, key, value) => setExtraItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  const reviewExpense = () => {
    setError('');
    const items = [form, ...extraItems];
    const incomplete = items.findIndex((item) => !item.particulars.trim() || !/^\d+(?:\.\d{1,2})?$/.test(String(item.amount)) || Number(item.amount) <= 0 || Number(item.amount) > 9999999999);
    if (incomplete !== -1) { setActiveItem(incomplete); setError(`Enter particulars and a valid amount for item ${incomplete + 1}.`); return; }
    if (form.payment_method === 'UPI' && !form.upi_id.trim()) { setError('Enter a UPI ID.'); return; }
    if (form.payment_method === 'NEFT' && (!form.account_number.trim() || !form.ifsc_code.trim())) { setError('Enter the account number and IFSC code.'); return; }
    if (form.attachment?.size > 5 * 1024 * 1024) { setError('Attachment must be at most 5 MB.'); return; }
    setActiveItem(null);
    setReviewOpen(true);
  };
  const toggleActions = (event, id) => {
    if (activeMenu?.id === id) { setActiveMenu(null); return; }
    const { top, bottom, right } = event.currentTarget.getBoundingClientRect();
    setActiveMenu({ id, top, bottom, right });
  };
  const viewDetails = useCallback(async (group) => {
    setActiveMenu(null);
    setError('');
    setDetails({ loading: true, items: [], group });
    try {
      const items = await Promise.all(group.items.map(async (item) => {
        const [response, repliesResponse, historyResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/expenses/${item.id}`, { headers: authHeaders() }),
          fetch(`${API_BASE_URL}/api/expenses/${item.id}/issue-replies`, { headers: authHeaders() }),
          user?.is_nexg_admin ? fetch(`${API_BASE_URL}/api/expenses/${item.id}/edit-history`, { headers: authHeaders() }) : null,
        ]);
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Could not load expense details.');
        const replyData = await repliesResponse.json();
        if (!repliesResponse.ok) throw new Error(replyData.detail || 'Could not load issue comments.');
        const historyData = historyResponse ? await historyResponse.json() : null;
        if (historyResponse && !historyResponse.ok) throw new Error(historyData.detail || 'Could not load request updates.');
        return { ...data.expense, issue_replies: replyData.replies || [], edit_history: historyData?.updates || [] };
      }));
      setDetails((current) => current ? { loading: false, items, group } : null);
    } catch (err) { setDetails(null); setError(err.message); }
  }, [user?.is_nexg_admin]);
  useEffect(() => {
    const expenseId = Number(new URLSearchParams(search).get('expenseId'));
    if (!expenseId || loading || openedExpenseId.current === expenseId) return;
    const group = expenseGroups.find((entry) => entry.items.some((item) => item.id === expenseId));
    if (group) { openedExpenseId.current = expenseId; viewDetails(group); }
    else { openedExpenseId.current = expenseId; setError('Request not found.'); }
  }, [search, loading, expenseGroups, viewDetails]);
  useEffect(() => {
    if (!details) return undefined;
    const close = (event) => { if (event.key === 'Escape') setDetails(null); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [details]);
  const openEditor = async (id) => {
    setActiveMenu(null); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/expenses/${id}`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load expense.');
      setForm({ ...blank, ...data.expense, amount: String(data.expense.amount), attachment: null });
      setAdvanceReason(data.expense.client_name ? 'client' : 'purpose');
      setExtraItems([]);
      setActiveItem(0);
      setReviewOpen(false);
      setEditingExpense(data.expense);
      setDetails(null);
      setFormOpen(true);
    } catch (err) { setError(err.message); }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (user?.is_nexg_admin && !editingExpense) return;
    if (form.expense_type === 'Advance' && (!form.particulars.trim() || !form.location.trim() || (advanceReason === 'client' && !form.client_name.trim()))) { setError(advanceReason === 'client' ? 'Enter the client name, job and location.' : 'Enter the purpose and location.'); return; }
    setSaving(true); setError('');
    try {
      const sessionResponse = await fetch(`${API_BASE_URL}/api/auth/me`, { headers: authHeaders() });
      const session = await sessionResponse.json();
      if (!sessionResponse.ok) throw new Error('Your login expired. Sign in again before saving.');
      if (String(session.user.id) !== String(user.id)) {
        throw new Error('Your login changed in another tab. Refresh this page and sign in with your employee account before saving.');
      }
      if (!editingExpense && session.user.is_nexg_admin) {
        throw new Error('You are signed in as an administrator. Sign in with your employee account to submit expenses.');
      }
      let attachment_base64 = '';
      if (form.attachment) {
        if (form.attachment.size > 5 * 1024 * 1024) throw new Error('Attachment must be at most 5 MB.');
        attachment_base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
          reader.onerror = () => reject(new Error('Could not read attachment.'));
          reader.readAsDataURL(form.attachment);
        });
      }
      const payload = { ...form, particulars: form.particulars.trim(), amount: Number(form.amount), attachment: undefined, attachment_name: form.attachment?.name || '', attachment_type: form.attachment?.type || '', attachment_base64 };
      if (extraItems.length && !editingExpense) payload.items = [{ particulars: form.particulars, amount: Number(form.amount) }, ...extraItems.map((item) => ({ particulars: item.particulars, amount: Number(item.amount) }))];
      const response = await fetch(`${API_BASE_URL}/api/expenses${editingExpense ? `/${editingExpense.id}` : extraItems.length ? '/batch' : ''}`, { method: editingExpense ? 'PUT' : 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not save expense.');
      setSavedMessage(`${form.expense_type} request ${editingExpense ? 'updated' : 'saved'}.`); setForm(blank); setExtraItems([]); setActiveItem(0); setReviewOpen(false); setEditingExpense(null); setFormOpen(false); await load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  const setStatus = async (id, status, issue_note = '') => {
    setActiveMenu(null); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/expenses/${id}/status`, { method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ status, issue_note }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not update status.');
      setIssueExpense(null); setIssueNote('');
      await load();
    } catch (err) { setError(err.message); }
  };
  const openIssue = (item, action = 'Issue Raised') => {
    setNoteAction(action);
    setActiveMenu(null); setError(''); setIssueExpense(item); setIssueNote(action === 'Rejected' ? '' : item.issue_note || '');
  };
  const confirmDelete = (group) => { setDetails(null); setDeleteError(''); setDeleteGroup(group); };
  const deleteRequest = async () => {
    if (!deleteGroup) return;
    setDeleting(true); setDeleteError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/expenses/${deleteGroup.items[0].id}`, { method: 'DELETE', headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not delete request.');
      setDeleteGroup(null); setDetails(null); setSavedMessage('Request deleted.'); await load();
    } catch (err) { setDeleteError(err.message); }
    finally { setDeleting(false); }
  };
  const download = async (item) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/expenses/${item.id}/attachment`, { headers: authHeaders() });
      if (!response.ok) throw new Error('Could not download attachment.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = item.attachment_name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err.message); }
  };
  const downloadBill = async () => {
    setBillBusy(true); setError('');
    try {
      const params = new URLSearchParams();
      if (billMonth) params.set('month', billMonth);
      if (user?.is_nexg_admin && billUser) params.set('user_id', billUser);
      const response = await fetch(`${API_BASE_URL}/api/expenses/bill?${params}`, { headers: authHeaders() });
      if (!response.ok) { const data = await response.json(); throw new Error(data.detail || 'Could not generate bill.'); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `expense-bill-${billMonth || 'all'}${billUser ? `-user-${billUser}` : ''}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err.message); }
    finally { setBillBusy(false); }
  };
  const billUsers = [...new Map(expenses.map((item) => [item.user_id, item.submitted_by])).entries()];

  const startRequest = (type) => {
    setError(''); setSavedMessage(''); setEditingExpense(null); setAdvanceReason('client'); setForm({ ...blank, expense_type: type, category: type === 'Advance' ? 'Other' : 'Travel' });
    setExtraItems([]); setActiveItem(0); setReviewOpen(false); setHistoryOpen(false); setFormOpen(true);
  };
  useEffect(() => {
    if (!formOpen) return;
    const close = (event) => { if (event.key === 'Escape' && !saving) { setFormOpen(false); setError(''); } };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [formOpen, saving]);

  return <div className={`expense-page ${!user?.is_nexg_admin ? 'expense-request-page' : ''}`}>
    {!user?.is_nexg_admin && !formOpen && !historyOpen && <section className="request-home" aria-labelledby="requests-title">
      <header className="request-home-header"><button className="request-home-back" type="button" onClick={() => navigate('/')}><ArrowLeft size={20} /> Back</button><h1 id="requests-title">Requests</h1><button type="button" onClick={() => { setError(''); setHistoryType('Advance'); setHistoryOpen(true); }}>Request history <ChevronRight size={15} /></button></header>
      {savedMessage && <div className="request-success" role="status"><Check size={18} />{savedMessage}</div>}
      {error && <div className="expense-error" role="alert">{error}</div>}
      <div className="request-home-content">
        <div className="request-choices">
          <button className="request-choice reimbursement" type="button" onClick={() => startRequest('Reimbursement')}><ReceiptText size={38} strokeWidth={1.35} /><span>Reimbursement</span></button>
          <button className="request-choice advance" type="button" onClick={() => startRequest('Advance')}><HandCoins size={40} strokeWidth={1.35} /><span>Advance</span></button>
        </div>
        <section className="request-latest" aria-labelledby="request-latest-title"><h2 id="request-latest-title">Latest requests</h2>
          {loading ? <p className="request-latest-empty">Loading your recent requests…</p> : latestRequests.length ? <div className="request-latest-list">{latestRequests.map((group) => {
            const first = group.items[0];
            const statuses = [...new Set(group.items.map((item) => item.status))];
            const status = statuses.length === 1 ? statuses[0] : 'Mixed';
            const amount = group.items.reduce((sum, item) => sum + Number(item.amount), 0);
            const canManage = group.items.every((item) => ['Pending', 'Issue Raised'].includes(item.status));
            return <article className="request-latest-card" key={group.id}><div className="request-latest-top"><span className={`request-latest-type ${first.expense_type.toLowerCase()}`}>{first.expense_type}</span><span className={`expense-status ${status.toLowerCase().replace(/\s+/g, '-')}`}>{status === 'Reimbursed' ? 'Paid' : status}</span></div><h3>{group.items.length === 1 ? first.particulars : `${first.particulars} + ${group.items.length - 1} more`}</h3><div className="request-latest-meta"><span>{dateLabel(first.created_at)}</span><strong>{money(amount)}</strong></div><div className="request-manage-actions"><button type="button" onClick={() => viewDetails(group)}>View details <ChevronRight size={15} /></button>{canManage && <><button type="button" onClick={() => group.items.length === 1 ? openEditor(first.id) : viewDetails(group)}><Pencil size={14} /> Edit</button><button type="button" className="request-delete" onClick={() => confirmDelete(group)}><Trash2 size={14} /> Delete</button></>}</div></article>;
          })}</div> : <p className="request-latest-empty">Your latest advance or reimbursement will appear here.</p>}
        </section>
      </div>
    </section>}
    {!user?.is_nexg_admin && historyOpen && !formOpen && <section className="request-history" aria-labelledby="request-history-title">
      <button className="request-back" type="button" onClick={() => { setHistoryOpen(false); setError(''); }}><ArrowLeft size={20} /> Requests</button>
      <div className="request-history-heading"><h1 id="request-history-title">History Records</h1><p>Review your past advance requests and reimbursement claims.</p></div>
      {savedMessage && <div className="request-success" role="status"><Check size={18} />{savedMessage}</div>}
      {error && <div className="expense-error" role="alert">{error}</div>}
      <fieldset className="request-history-choices"><legend className="request-history-sr-only">History type</legend>{['Advance', 'Reimbursement'].map((type) => <label className={`request-history-choice ${historyType === type ? 'selected' : ''}`} key={type}><input type="radio" name="request-history-type" value={type} checked={historyType === type} onChange={() => setHistoryType(type)} /><span>{type}</span></label>)}</fieldset>
      <div className="request-history-details" aria-live="polite"><h2>{historyType} History</h2>{loading ? <p className="request-history-empty">Loading requests…</p> : requestHistory[historyType].length ? <div className="request-history-table-wrap"><table className="request-history-table"><thead><tr><th>Date</th><th>Request ID</th><th>{historyType === 'Advance' ? 'Reason' : 'Particulars'}</th><th>Amount</th><th>Status</th><th>Details</th></tr></thead><tbody>{requestHistory[historyType].map((group) => {
        const first = group.items[0];
        const statuses = [...new Set(group.items.map((item) => item.status))];
        const amount = group.items.reduce((sum, item) => sum + Number(item.amount), 0);
        const canManage = group.items.every((item) => ['Pending', 'Issue Raised'].includes(item.status));
        return <tr key={group.id}><td data-label="Date">{dateLabel(first.created_at)}</td><td data-label="Request ID" className="request-history-id">{historyType === 'Advance' ? 'ADV' : 'RMB'}-{String(first.id).padStart(5, '0')}</td><td data-label={historyType === 'Advance' ? 'Reason' : 'Particulars'} className="request-history-reason">{group.items.length === 1 ? first.particulars : `${first.particulars} + ${group.items.length - 1} more`}</td><td data-label="Amount" className="request-history-amount">{money(amount)}</td><td data-label="Status"><span className={`expense-status ${statuses.length === 1 ? statuses[0].toLowerCase().replace(/\s+/g, '-') : 'mixed'}`}>{statuses.length === 1 ? (statuses[0] === 'Reimbursed' ? 'Paid' : statuses[0]) : 'Mixed'}</span></td><td className="request-history-action"><div className="request-manage-actions"><button type="button" className="request-history-view" onClick={() => viewDetails(group)}>View details <ChevronRight size={15} /></button>{canManage && <><button type="button" onClick={() => group.items.length === 1 ? openEditor(first.id) : viewDetails(group)}><Pencil size={14} /> Edit</button><button type="button" className="request-delete" onClick={() => confirmDelete(group)}><Trash2 size={14} /> Delete</button></>}</div></td></tr>;
      })}</tbody></table></div> : <p className="request-history-empty">No {historyType.toLowerCase()} requests yet.</p>}</div>
    </section>}
    {user?.is_nexg_admin && <>
    <header className="expense-hero">
      <div className="expense-hero-copy">
        <p className="expense-eyebrow"><span /> NEXG PETROLUBE / FINANCE</p>
        <h1>Expense Tracker</h1>
        <p>Claims, advances and payments</p>
        <div className="expense-hero-context"><UsersRound size={15} /> {user?.is_nexg_admin ? 'All employee expenses' : 'Your personal expenses'}</div>
      </div>
      <div className="expense-hero-side">
        <span className="expense-hero-side-label">Total recorded</span>
        <strong>{loading ? '—' : money(total)}</strong>
        {!user?.is_nexg_admin && <button className="expense-primary" onClick={() => { setHistoryOpen(false); setSavedMessage(''); }}><Plus size={17} /> New request</button>}
      </div>
      <dl className="expense-overview" aria-label="Expense overview">
        {[
          ['Entries', summary.entries], ['Unpaid', money(summary.unpaid)],
          ['Reimbursement due', money(summary.reimbursementDue)], ['Advance unpaid', money(summary.advanceDue)],
          ['Reimbursement paid', money(summary.reimbursed)], ['Advance taken', money(summary.advanceTaken)],
          ['Rejected', money(summary.rejected)], ['Issues raised', summary.issues],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{loading ? '—' : value}</dd></div>)}
      </dl>
    </header>
    {error && <div className="expense-error" role="alert">{error}</div>}
    <section className="expense-panel expense-ledger">
      <div className="expense-ledger-title">
        <div className="expense-ledger-heading"><span className="expense-ledger-icon"><Wallet size={24} /></span><div><h2>{user?.is_nexg_admin ? 'Admin Expense View' : 'Your Expenses'}</h2><p>{user?.is_nexg_admin ? 'Review claims and resolve payments from one place' : 'Your recorded claims and payment status'}</p></div></div>
        <div className="expense-ledger-controls">{user?.is_nexg_admin && <select aria-label="Bill user" value={billUser} onChange={(event) => setBillUser(event.target.value)}><option value="">All users</option>{billUsers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>}<label className="expense-period"><CalendarDays size={18} /><span>{monthRangeLabel}</span><ChevronDown size={16} /><input aria-label="Expense month, blank for all dates" type="month" value={billMonth} onChange={(event) => setBillMonth(event.target.value)} /></label>{billMonth && <button className="expense-clear-period" type="button" onClick={() => setBillMonth('')} aria-label="Show all dates"><X size={16} /></button>}<button className="expense-generate" type="button" onClick={downloadBill} disabled={billBusy}><Download size={18} /> {billBusy ? 'Generating...' : 'Generate Bill'}</button></div>
      </div>
      <div className="expense-ledger-body"><div className="expense-ledger-toolbar"><div className="expense-filter-tabs" aria-label="Filter by status">{statusOptions.filter((status) => ['All', 'Pending', 'Approved', 'Rejected'].includes(status) || statusCounts[status] > 0 || statusFilter === status).map((status) => <button key={status} type="button" className={statusFilter === status ? 'active' : ''} onClick={() => setStatusFilter(status)}>{status !== 'All' && <span className={`expense-filter-dot ${status.toLowerCase().replace(/\s+/g, '-')}`} />}{status === 'Reimbursed' ? 'Paid' : status} ({statusCounts[status]})</button>)}</div><div className="expense-search-controls"><label className="expense-search"><Search size={19} /><input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by category, particulars..." aria-label="Search expenses" /></label><div className="expense-category-filter"><button type="button" className={categoryFilter !== 'All' ? 'is-filtered' : ''} aria-label="Filter by category" aria-expanded={filterOpen} onClick={() => setFilterOpen((current) => !current)}><SlidersHorizontal size={19} /></button>{filterOpen && <div className="expense-category-popover"><label>Category<select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setFilterOpen(false); }}><option>All</option>{reportCategories.map((category) => <option key={category}>{category}</option>)}</select></label></div>}</div></div></div>
      <div className="expense-table-wrap"><table className="expense-table">
        <thead><tr><th>#</th><th><button type="button" onClick={() => sortTable('date')}>Date <ChevronsUpDown size={13} /></button></th>{user?.is_nexg_admin && <th>User</th>}<th><button type="button" onClick={() => sortTable('category')}>Category <ChevronsUpDown size={13} /></button></th><th><button type="button" onClick={() => sortTable('particulars')}>Particulars <ChevronsUpDown size={13} /></button></th><th><button type="button" onClick={() => sortTable('amount')}>Amount <ChevronsUpDown size={13} /></button></th><th><button type="button" onClick={() => sortTable('type')}>Type <ChevronsUpDown size={13} /></button></th><th><button type="button" onClick={() => sortTable('status')}>Status <ChevronsUpDown size={13} /></button></th><th><button type="button" onClick={() => sortTable('payment')}>Payment Method <ChevronsUpDown size={13} /></button></th><th>Action</th></tr></thead>
        <tbody>{visibleGroups.flatMap((group, groupIndex) => (user?.is_nexg_admin && expandedBatches.includes(group.id) ? group.items : group.items.slice(0, 1)).map((item, rowIndex, shownItems) => {
          const finalStatus = ['Rejected', 'Reimbursed'].includes(item.status);
          const combinedUserRow = !user?.is_nexg_admin && group.items.length > 1;
          const groupStatus = combinedUserRow && group.items.some((entry) => entry.status !== item.status) ? 'Mixed' : item.status;
          return <React.Fragment key={item.id}><tr>
            <td><span className="expense-row-number">{user?.is_nexg_admin ? expenses.indexOf(item) + 1 : (page - 1) * pageSize + groupIndex + 1}</span></td><td><span className="expense-date-cell"><CalendarDays size={18} /><span><strong>{dateLabel(item.created_at)}</strong><small>{new Date(item.created_at).toLocaleDateString('en-IN', { weekday: 'short' })}</small></span></span></td>
            {user?.is_nexg_admin && <td className="expense-user-cell"><strong>{item.submitted_by}</strong><small>{item.rank || 'Employee'}</small></td>}
            <td><span className="expense-category" style={{ color: colors[reportCategories.indexOf(item.category) % colors.length] || colors[5] }}>{item.category}</span></td>
            <td className="expense-particulars">{combinedUserRow ? <div className="expense-particular-list">{group.items.map((entry, index) => <div key={entry.id}><strong>{index + 1}. {entry.particulars}</strong><small>{money(entry.amount)} · {entry.status === 'Reimbursed' ? 'Paid' : entry.status}</small>{entry.issue_note && <small className="expense-issue-note">{entry.status === 'Rejected' ? 'Rejection reason' : 'Issue'}: {entry.issue_note}</small>}</div>)}</div> : <div className="expense-particular-list"><div><strong>{item.particulars}</strong>{item.issue_note && <small className="expense-issue-note">{item.status === 'Rejected' ? 'Rejection reason' : 'Issue'}: {item.issue_note}</small>}</div></div>}</td>
            <td className="expense-amount"><strong>{money(combinedUserRow ? group.items.reduce((sum, entry) => sum + Number(entry.amount), 0) : item.amount)}</strong>{combinedUserRow && <small>({group.items.length} items)</small>}</td><td><span className={`expense-type ${item.expense_type.toLowerCase()}`}>{item.expense_type}</span></td>
            <td><span className={`expense-status ${groupStatus.toLowerCase().replace(/\s+/g, '-')}`}>{groupStatus === 'Reimbursed' ? 'Paid' : groupStatus}</span></td>
            <td><span className="expense-payment">{item.payment_method || '-'}</span></td>
            <td><div className="expense-actions"><button aria-label={`Actions for ${item.particulars}`} aria-expanded={activeMenu?.id === item.id} onClick={(event) => toggleActions(event, item.id)}>...</button>
              {activeMenu?.id === item.id && createPortal(<div ref={actionMenuRef} className="expense-action-menu">
                <button onClick={() => viewDetails(group)}><Eye size={14} /> View details</button>
                {user?.is_nexg_admin && !finalStatus && <>
                  <button onClick={() => openEditor(item.id)}><Pencil size={14} /> Edit expense</button>
                  <button onClick={() => openIssue(item)}><FileText size={14} /> {item.status === 'Issue Raised' ? 'Edit issue' : 'Raise issue'}</button>
                  <button className="expense-menu-danger" onClick={() => openIssue(item, 'Rejected')}><X size={14} /> Reject</button>
                  <button className="expense-menu-paid" onClick={() => setStatus(item.id, 'Reimbursed')}><Check size={14} /> Mark Paid</button>
                </>}
                {item.attachment_name && <button onClick={() => { setActiveMenu(null); download(item); }}><Download size={14} /> Download receipt</button>}
                {user?.is_nexg_admin && !item.attachment_name && finalStatus && <span className="expense-menu-locked">Final status - no changes</span>}
              </div>, document.body)}
            </div></td>
          </tr>{user?.is_nexg_admin && group.items.length > 1 && rowIndex === shownItems.length - 1 && <tr className="expense-batch-row"><td colSpan={10}><button type="button" onClick={() => setExpandedBatches((current) => current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id])}>{expandedBatches.includes(group.id) ? 'Show less' : `Load more (${group.items.length - 1} more particulars)`}</button></td></tr>}</React.Fragment>;
        }))}</tbody>
      </table></div>
      <div className="expense-mobile-list">{visibleGroups.map((group) => {
        const first = group.items[0];
        const statuses = [...new Set(group.items.map((item) => item.status))];
        const groupTotal = group.items.reduce((sum, item) => sum + Number(item.amount), 0);
        const expanded = expandedCards.includes(group.id);
        const singleEditable = user?.is_nexg_admin && group.items.length === 1 && !['Rejected', 'Reimbursed'].includes(first.status);
        return <article className="expense-mobile-card" key={group.id}>
          <div className="expense-mobile-top"><span className="expense-mobile-id">EXP-{String(first.id).padStart(5, '0')}</span><div className="expense-mobile-badges">{statuses.map((status) => <span key={status} className={`expense-mobile-badge ${status.toLowerCase().replace(/\s+/g, '-')}`}>{status === 'Reimbursed' ? 'Paid' : status}</span>)}</div></div>
          <h3>{user?.is_nexg_admin ? first.submitted_by : first.category}</h3>
          <p className="expense-mobile-date">{dateLabel(first.created_at)}{user?.is_nexg_admin && first.rank ? ` · ${first.rank}` : ''}</p>
          <p className="expense-mobile-meta">{user?.is_nexg_admin && <><span>{first.category}</span> · </>}{first.expense_type} · {first.payment_method}</p>
          <div className="expense-mobile-summary">{group.items.slice(0, expanded ? group.items.length : 2).map((item) => <div key={item.id}><span>{item.particulars}</span><strong>{money(item.amount)}</strong></div>)}{!expanded && group.items.length > 2 && <small>+{group.items.length - 2} more particulars</small>}</div>
          {!expanded && group.items.filter((item) => item.issue_note).map((item) => <p className="expense-mobile-issue" key={`note-${item.id}`}><strong>{item.particulars}</strong> · {item.status === 'Rejected' ? 'Rejection reason' : 'Issue'}: {item.issue_note}</p>)}
          <div className="expense-mobile-total"><span>{group.items.length} {group.items.length === 1 ? 'particular' : 'particulars'} · Total</span><strong>{money(groupTotal)}</strong></div>
          {expanded && <div className="expense-mobile-details"><p>Expense details</p>{group.items.map((item) => <div className="expense-mobile-detail" key={item.id}><div><strong>{item.particulars}</strong><span>{money(item.amount)} · {item.status === 'Reimbursed' ? 'Paid' : item.status}</span>{item.issue_note && <span className="expense-mobile-issue">{item.status === 'Rejected' ? 'Rejection reason' : 'Issue'}: {item.issue_note}</span>}</div>{user?.is_nexg_admin && !['Rejected', 'Reimbursed'].includes(item.status) && <div className="expense-mobile-detail-actions"><button type="button" onClick={() => openEditor(item.id)}>Edit</button><button type="button" onClick={() => openIssue(item)}>Raise issue</button><button type="button" onClick={() => setStatus(item.id, 'Reimbursed')}>Mark paid</button><button type="button" className="danger" onClick={() => openIssue(item, 'Rejected')}>Reject</button></div>}{item.attachment_name && <button type="button" className="expense-mobile-receipt" onClick={() => download(item)}><Download size={14} /> Download receipt</button>}</div>)}</div>}
          <div className="expense-mobile-actions"><button type="button" aria-label={`View details for expense ${first.id}`} onClick={() => viewDetails(group)}><Eye size={20} /> View details</button><button type="button" aria-label={`${expanded ? 'Collapse' : 'Expand'} items for expense ${first.id}`} aria-expanded={expanded} onClick={() => setExpandedCards((current) => current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id])}><ChevronDown size={20} /></button>{singleEditable && <><button type="button" aria-label={`Edit expense ${first.id}`} onClick={() => openEditor(first.id)}><Pencil size={19} /></button><button type="button" className="danger" aria-label={`Reject expense ${first.id}`} onClick={() => openIssue(first, 'Rejected')}><X size={21} /></button></>}</div>
        </article>;
      })}</div>
      {!loading && !filteredGroups.length && <div className="expense-empty">{expenses.length ? 'No expenses match these filters.' : user?.is_nexg_admin ? 'User expenses will appear here once recorded.' : 'No expenses yet. Add your first expense to start tracking.'}</div>}
      <div className="expense-ledger-footer"><span>Showing {filteredGroups.length ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, filteredGroups.length)} of {filteredGroups.length} records</span><div className="expense-pagination"><button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={17} /></button><span>{page}</span><button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}><ChevronRight size={17} /></button></div></div>
      </div>
    </section>
    <div className="expense-charts"><section className="expense-panel expense-chart-card"><div className="expense-chart-heading"><span className="expense-chart-heading-icon"><PieChart size={18} /></span><div><span className="expense-section-kicker">BREAKDOWN</span><h2>By category</h2></div></div><div className="expense-category-chart"><div className="expense-donut" style={{ background: `conic-gradient(${donut})` }}><div><strong>{money(total)}</strong><small>Total spent</small></div></div><div className="expense-legend">{categoryTotals.map((item) => <div key={item.category}><span className="expense-legend-dot" style={{ background: item.color }} /> <span>{item.category}</span><strong>{total ? Math.round(item.total / total * 100) : 0}%</strong></div>)}</div></div></section><section className="expense-panel expense-chart-card"><div className="expense-chart-heading"><span className="expense-chart-heading-icon green"><TrendingUp size={18} /></span><div><span className="expense-section-kicker">OVERVIEW</span><h2>Monthly trend</h2></div><span className="expense-chart-period">Last 6 months</span></div><div className="expense-month-chart">{monthData.map((item) => <div className="expense-month" key={item.label}><div className="expense-bar-track"><span title={`${item.label}: ${money(item.total)}`} style={{ height: `${item.total ? Math.max(5, item.total / maxMonth * 100) : 2}%` }} /></div><small>{item.label}</small></div>)}</div></section></div>
    </>}
    {details && <div className="expense-issue-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetails(null); }}>
      <section className={`expense-issue-dialog expense-details-dialog ${!user?.is_nexg_admin ? 'request-details-dialog' : ''}`} role="dialog" aria-modal="true" aria-labelledby="expense-details-title" aria-busy={details.loading}>
        <div className="expense-issue-heading"><div><h2 id="expense-details-title">{user?.is_nexg_admin ? 'Expense details' : `${details.items[0]?.expense_type || 'Request'} details`}</h2>{!user?.is_nexg_admin && !details.loading && <small>{details.items.length} {details.items.length === 1 ? 'entry' : 'entries'} in this request</small>}</div><button type="button" autoFocus aria-label="Close expense details" onClick={() => setDetails(null)}><X size={20} /></button></div>
        {details.loading ? <p role="status">Loading expense details…</p> : <>
          {user?.is_nexg_admin ? <p>{details.items.length} {details.items.length === 1 ? 'entry' : 'entries'} · Total {money(details.items.reduce((sum, item) => sum + Number(item.amount), 0))}</p> : <div className="request-details-total"><span>Total requested</span><strong>{money(details.items.reduce((sum, item) => sum + Number(item.amount), 0))}</strong><span className={`expense-status ${details.items.every((item) => item.status === details.items[0].status) ? details.items[0].status.toLowerCase().replace(/\s+/g, '-') : 'mixed'}`}>{details.items.every((item) => item.status === details.items[0].status) ? (details.items[0].status === 'Reimbursed' ? 'Paid' : details.items[0].status) : 'Mixed'}</span></div>}
          {details.items.map((item) => <article className="expense-details-item" key={item.id}>
            <h3>{!user?.is_nexg_admin && <span className="request-details-item-id">{item.expense_type === 'Advance' ? 'ADV' : 'RMB'}-{String(item.id).padStart(5, '0')}</span>}{user?.is_nexg_admin && <>EXP-{String(item.id).padStart(5, '0')} · </>}{item.particulars}</h3>
            <dl>{[
              ['Submitted by', item.submitted_by], ['Date', dateLabel(item.created_at)],
              ...(item.expense_type === 'Advance' ? [...(item.client_name ? [['Client name', item.client_name]] : []), ['Location', item.location]] : []),
              [item.expense_type === 'Advance' ? (item.client_name ? 'Job' : 'Purpose') : 'Particulars', item.particulars], ['Category', item.category], ['Amount', money(item.amount)], ['Type', item.expense_type],
              ['Status', item.status === 'Reimbursed' ? 'Paid' : item.status], ['Payment method', item.payment_method],
              ...(item.payment_method === 'UPI' ? [['UPI ID', item.upi_id]] : [['Account number', item.account_number], ['IFSC code', item.ifsc_code]]),
              [item.status === 'Rejected' ? 'Rejection reason' : 'Issue note', item.issue_note || (item.status === 'Rejected' ? 'No reason recorded' : 'No issue raised')],
              ['Receipt', item.attachment_name || 'No receipt attached'],
            ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
            {item.attachment_name && <ExpenseAttachment item={item} onDownload={download} />}
            {!!item.issue_replies?.length && <div className="expense-issue-replies"><h4>Employee comments</h4>{item.issue_replies.map((reply) => <div key={reply.id}><strong>{reply.author}</strong><time dateTime={new Date(reply.createdAt).toISOString()}>{new Date(reply.createdAt).toLocaleString()}</time><p>{reply.message}</p></div>)}</div>}
            {user?.is_nexg_admin && !!item.edit_history?.length && <section className="expense-edit-history" aria-label="Employee update history"><h4>Employee updates</h4>{item.edit_history.map((update) => <div className="expense-edit-entry" key={update.id}><div className="expense-edit-heading"><strong>{update.actor}</strong><time dateTime={new Date(update.createdAt).toISOString()}>{new Date(update.createdAt).toLocaleString()}</time></div><div className="expense-edit-table" role="table" aria-label="Previous and updated values"><div className="expense-edit-row expense-edit-header" role="row"><span role="columnheader">Field</span><span role="columnheader">Previous value</span><span role="columnheader">Updated value</span></div>{update.changes.map((change, index) => <div className="expense-edit-row" role="row" key={`${change.field}-${index}`}><strong role="cell">{change.field}</strong><span role="cell">{change.previous || '—'}</span><span role="cell">{change.updated || '—'}</span></div>)}</div></div>)}</section>}
            {!user?.is_nexg_admin && ['Pending', 'Issue Raised'].includes(item.status) && <div className="request-details-actions"><button type="button" onClick={() => openEditor(item.id)}><Pencil size={15} /> Edit this item</button></div>}
          </article>)}
          {!user?.is_nexg_admin && details.group?.items.every((item) => ['Pending', 'Issue Raised'].includes(item.status)) && <div className="request-details-delete"><button type="button" onClick={() => confirmDelete(details.group)}><Trash2 size={15} /> Delete {details.group.items.length > 1 ? 'entire request' : 'request'}</button></div>}
        </>}
      </section>
    </div>}
    {deleteGroup && <div className="expense-issue-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setDeleteGroup(null); }}><section className="expense-issue-dialog request-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="request-delete-title" aria-describedby="request-delete-description"><div className="expense-issue-heading"><h2 id="request-delete-title">Delete request?</h2><button type="button" aria-label="Cancel deletion" disabled={deleting} onClick={() => setDeleteGroup(null)}><X size={20} /></button></div><p id="request-delete-description">{deleteGroup.items.length > 1 ? `This will permanently delete all ${deleteGroup.items.length} items in this request.` : 'This request will be permanently deleted.'}</p>{deleteError && <div className="expense-error" role="alert">{deleteError}</div>}<div className="expense-issue-actions"><button type="button" disabled={deleting} onClick={() => setDeleteGroup(null)}>Cancel</button><button type="button" className="request-delete-confirm" disabled={deleting} onClick={deleteRequest}>{deleting ? 'Deleting…' : 'Delete request'}</button></div></section></div>}
    {issueExpense && <div className="expense-issue-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setIssueExpense(null); }}>
      <form className="expense-issue-dialog" onSubmit={(event) => { event.preventDefault(); setStatus(issueExpense.id, noteAction, issueNote); }}>
        <div className="expense-issue-heading"><div><span className="expense-section-kicker">ADMIN ACTION</span><h2>{noteAction === 'Rejected' ? 'Reject expense' : issueExpense.status === 'Issue Raised' ? 'Edit issue' : 'Raise an issue'}</h2></div><button type="button" aria-label="Close issue form" onClick={() => setIssueExpense(null)}><X size={18} /></button></div>
        <p>{noteAction === 'Rejected' ? 'Explain why this expense is rejected.' : `Explain what needs attention for ${issueExpense.submitted_by}'s expense.`} This reason is visible to the user.</p>
        {error && <div className="expense-error" role="alert">{error}</div>}
        <label>{noteAction === 'Rejected' ? 'Rejection reason' : 'Issue details'}<textarea required maxLength={500} rows={4} value={issueNote} onChange={(event) => setIssueNote(event.target.value)} placeholder="Describe the missing or incorrect details" /></label>
        <div className="expense-issue-actions"><button type="button" onClick={() => setIssueExpense(null)}>Cancel</button><button className="expense-primary" type="submit">{noteAction === 'Rejected' ? 'Reject expense' : 'Save issue'}</button></div>
      </form>
    </div>}
    {formOpen && (!user?.is_nexg_admin || editingExpense) && <div className={`expense-overlay ${!user?.is_nexg_admin ? 'request-form-page' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false); }}>
      <aside className="expense-drawer" role={user?.is_nexg_admin ? 'dialog' : undefined} aria-modal={user?.is_nexg_admin ? true : undefined} aria-labelledby="expense-form-title">
        <div className="expense-drawer-head"><button className="request-back" type="button" disabled={saving} aria-label="Back to requests" onClick={() => { setFormOpen(false); setError(''); }}><ArrowLeft size={22} /></button><h2 id="expense-form-title">{editingExpense ? `Edit ${form.expense_type}` : reviewOpen ? 'Review reimbursement' : form.expense_type}</h2></div>
        {error && <div className="expense-error" role="alert">{error}</div>}
        <form onSubmit={submit}>
          {form.expense_type === 'Advance' ? <>
            <fieldset className="request-reason"><legend>Advance for <em>*</em></legend><label><input type="radio" name="advance-reason" checked={advanceReason === 'client'} onChange={() => { setAdvanceReason('client'); setForm((current) => ({ ...current, particulars: '' })); }} /> Client Name</label><label><input type="radio" name="advance-reason" checked={advanceReason === 'purpose'} onChange={() => { setAdvanceReason('purpose'); setForm((current) => ({ ...current, client_name: '', particulars: '' })); }} /> Purpose</label></fieldset>
            {advanceReason === 'client' ? <><label>Client Name<input required maxLength={255} value={form.client_name} onChange={(event) => update('client_name', event.target.value)} placeholder="Enter client name" /></label><label>Job<input required maxLength={500} value={form.particulars} onChange={(event) => update('particulars', event.target.value)} placeholder="Enter job" /></label></> : <label>Purpose<input required maxLength={500} value={form.particulars} onChange={(event) => update('particulars', event.target.value)} placeholder="What is this advance for?" /></label>}
            <label>Location<span className="request-location"><input required maxLength={255} value={form.location} onChange={(event) => update('location', event.target.value)} placeholder="Location" /><MapPin size={18} /></span></label>
            <label>Amount<span className="request-amount"><span>₹</span><input required aria-label="Amount in rupees" type="number" min="0.01" max="9999999999" step="0.01" value={form.amount} onChange={(event) => update('amount', event.target.value)} placeholder="0.00" /></span></label>
            <fieldset className="request-payment"><legend>Payment Method</legend>
              <div className="request-payment-row"><label><input type="radio" name="advance-payment" checked={form.payment_method === 'UPI'} onChange={() => update('payment_method', 'UPI')} /> UPI</label><input aria-label="VPA / UPI ID" required={form.payment_method === 'UPI'} disabled={form.payment_method !== 'UPI'} value={form.upi_id} onChange={(event) => update('upi_id', event.target.value)} placeholder="VPA/UPI ID" /></div>
              <div className="request-payment-row"><label><input type="radio" name="advance-payment" checked={form.payment_method === 'NEFT'} onChange={() => update('payment_method', 'NEFT')} /> NEFT</label><input aria-label="Bank account number" required={form.payment_method === 'NEFT'} disabled={form.payment_method !== 'NEFT'} value={form.account_number} onChange={(event) => update('account_number', event.target.value)} placeholder="Bank account number" /></div>
              {form.payment_method === 'NEFT' && <label className="request-ifsc">IFSC Code<input required maxLength={40} value={form.ifsc_code} onChange={(event) => update('ifsc_code', event.target.value.toUpperCase())} placeholder="Enter IFSC code" /></label>}
            </fieldset>
            <div className="expense-form-actions"><button className="expense-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div>
          </> : reviewOpen && !editingExpense ? <>
            <section className="expense-bill-preview" aria-label="Expense bill details">
              <div className="expense-bill-preview-head"><span>EXPENSE BILL</span><strong>{money([form, ...extraItems].reduce((sum, item) => sum + Number(item.amount || 0), 0))}</strong><small>{[form, ...extraItems].length} {extraItems.length ? 'expenses' : 'expense'} | {new Date().toLocaleDateString('en-IN')}</small></div>
              <dl className="expense-bill-preview-facts"><div><dt>Submitted by</dt><dd>{user?.name}</dd></div><div><dt>Category</dt><dd>{form.category}</dd></div><div><dt>Type</dt><dd>{form.expense_type}</dd></div><div><dt>Payment method</dt><dd>{form.payment_method}</dd></div><div><dt>{form.payment_method === 'UPI' ? 'UPI ID' : 'Account number'}</dt><dd>{form.payment_method === 'UPI' ? form.upi_id : form.account_number}</dd></div>{form.payment_method === 'NEFT' && <div><dt>IFSC code</dt><dd>{form.ifsc_code}</dd></div>}{form.attachment && <div><dt>Receipt</dt><dd>{form.attachment.name}</dd></div>}</dl>
              <div className="expense-bill-preview-items"><h3>Particulars</h3>{[form, ...extraItems].map((item, index) => <div key={index}><span><small>{index + 1}.</small> {item.particulars}</span><strong>{money(item.amount)}</strong></div>)}</div>
              <div className="expense-bill-preview-total"><span>Total</span><strong>{money([form, ...extraItems].reduce((sum, item) => sum + Number(item.amount || 0), 0))}</strong></div>
            </section>
            <div className="expense-form-actions"><button type="button" onClick={() => { setReviewOpen(false); setActiveItem(extraItems.length); }}>Back to edit</button><button className="expense-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Expenses'}</button></div>
          </> : <>
            <label>Category <em>*</em><span className="expense-select"><select value={form.category} onChange={(event) => update('category', event.target.value)}>{editingExpense && !categories.includes(form.category) && <option>{form.category}</option>}{categories.map((category) => <option key={category}>{category}</option>)}</select><ChevronDown size={16} /></span></label>
            <div className="expense-items-list">{[form, ...extraItems].map((item, index) => <section className={`expense-item-fields ${activeItem === index ? 'is-open' : ''}`} key={index}>
              <div className="expense-item-heading"><button type="button" className="expense-item-toggle" aria-expanded={activeItem === index} onClick={() => setActiveItem(index)}><span>{item.particulars || `Particular ${index + 1}`}<small>{activeItem === index ? `Item ${index + 1}` : item.amount ? money(item.amount) : 'Needs details'}</small></span><ChevronDown size={16} /></button>{index > 0 && <button type="button" className="expense-item-remove" aria-label={`Remove particular ${index + 1}`} onClick={() => { setExtraItems((current) => current.filter((_, itemIndex) => itemIndex !== index - 1)); setActiveItem(0); }}><X size={16} /></button>}</div>
              {activeItem === index && <div className="expense-item-inputs"><label>Particulars <em>*</em><input required maxLength={500} value={item.particulars} onChange={(event) => index === 0 ? update('particulars', event.target.value) : updateExtraItem(index - 1, 'particulars', event.target.value)} placeholder="What was this expense for?" /></label><label>Expense Amount (INR) <em>*</em><input required type="number" min="0.01" step="0.01" value={item.amount} onChange={(event) => index === 0 ? update('amount', event.target.value) : updateExtraItem(index - 1, 'amount', event.target.value)} placeholder="0.00" /></label></div>}
            </section>)}</div>
            {!editingExpense && extraItems.length < 19 && <button type="button" className="expense-add-particular" onClick={() => { setExtraItems((current) => [...current, { particulars: '', amount: '' }]); setActiveItem(extraItems.length + 1); }}><Plus size={16} /> Add another particular</button>}
            <fieldset><legend>Payment Method <em>*</em></legend><label><input type="radio" name="payment" checked={form.payment_method === 'UPI'} onChange={() => update('payment_method', 'UPI')} /> UPI</label><label><input type="radio" name="payment" checked={form.payment_method === 'NEFT'} onChange={() => update('payment_method', 'NEFT')} /> NEFT</label></fieldset>
            {form.payment_method === 'UPI' ? <label>UPI ID <em>*</em><input required value={form.upi_id} onChange={(event) => update('upi_id', event.target.value)} placeholder="name@bank" /></label> : <><label>Account Number <em>*</em><input required value={form.account_number} onChange={(event) => update('account_number', event.target.value)} placeholder="Enter account number" /></label><label>IFSC Code <em>*</em><input required value={form.ifsc_code} onChange={(event) => update('ifsc_code', event.target.value)} placeholder="Enter IFSC code" /></label></>}
            <label>Attachment (Optional)<span className="expense-upload"><UploadCloud size={19} /><span>{form.attachment ? form.attachment.name : editingExpense?.attachment_name || 'Upload bill / receipt'}</span><small>PDF, JPG, PNG (Max 5MB)</small><input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => update('attachment', event.target.files?.[0] || null)} /></span></label>
            <div className="expense-form-actions"><button type="button" onClick={() => setFormOpen(false)}>Cancel</button>{editingExpense ? <button className="expense-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button> : <button type="button" className="expense-primary" onClick={reviewExpense}>Review &amp; Save</button>}</div>
          </>}
        </form>
      </aside>
    </div>}
  </div>;
}
