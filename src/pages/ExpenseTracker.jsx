import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, BarChart3, Check, ChevronDown, Clock3, Download, FileText, Pencil, PieChart, ReceiptText, TrendingUp, UploadCloud, UsersRound, Wallet, X } from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './ExpenseTracker.css';

const categories = ['Travel', 'Food', 'Stationery', 'Office Supplies', 'Client Meeting', 'Other'];
const colors = ['#4b9cff', '#ffac3e', '#da72b7', '#9672ee', '#29a574', '#a7b2bf'];
const blank = { category: 'Travel', particulars: '', amount: '', expense_type: 'Reimbursement', payment_method: 'UPI', upi_id: '', account_number: '', ifsc_code: '', attachment: null };
const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const dateLabel = (value) => new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export default function ExpenseTracker({ user }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [viewAll, setViewAll] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null);
  const actionMenuRef = useRef(null);
  const [issueExpense, setIssueExpense] = useState(null);
  const [issueNote, setIssueNote] = useState('');
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
  useEffect(() => { load(); }, [load]);
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

  const total = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const pending = expenses.filter((item) => ['Pending', 'Issue Raised'].includes(item.status)).length;
  const reimbursed = expenses.filter((item) => item.status === 'Reimbursed').reduce((sum, item) => sum + Number(item.amount), 0);
  const categoryTotals = useMemo(() => categories.map((category, index) => ({ category, color: colors[index], total: expenses.filter((item) => item.category === category).reduce((sum, item) => sum + Number(item.amount), 0) })), [expenses]);
  const monthData = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const month = new Date(); month.setDate(1); month.setMonth(month.getMonth() - 5 + index);
    return { label: month.toLocaleDateString('en-IN', { month: 'short' }), total: expenses.filter((item) => { const date = new Date(item.created_at); return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth(); }).reduce((sum, item) => sum + Number(item.amount), 0) };
  }), [expenses]);
  const maxMonth = Math.max(...monthData.map((item) => item.total), 1);
  const donut = total ? categoryTotals.map((item, index) => `${item.color} ${categoryTotals.slice(0, index).reduce((sum, entry) => sum + entry.total, 0) / total * 100}% ${categoryTotals.slice(0, index + 1).reduce((sum, entry) => sum + entry.total, 0) / total * 100}%`).join(', ') : '#e9eef3 0% 100%';

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggleActions = (event, id) => {
    if (activeMenu?.id === id) { setActiveMenu(null); return; }
    const { top, bottom, right } = event.currentTarget.getBoundingClientRect();
    setActiveMenu({ id, top, bottom, right });
  };
  const openEditor = async (id) => {
    setActiveMenu(null); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/expenses/${id}`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load expense.');
      setForm({ ...blank, ...data.expense, amount: String(data.expense.amount), attachment: null });
      setEditingExpense(data.expense);
      setFormOpen(true);
    } catch (err) { setError(err.message); }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!editingExpense || !user?.is_nexg_admin) return;
    setSaving(true); setError('');
    try {
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
      const response = await fetch(`${API_BASE_URL}/api/expenses/${editingExpense.id}`, { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, amount: Number(form.amount), attachment: undefined, attachment_name: form.attachment?.name || '', attachment_type: form.attachment?.type || '', attachment_base64 }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not save expense.');
      setForm(blank); setEditingExpense(null); setFormOpen(false); await load();
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
  const openIssue = (item) => {
    setActiveMenu(null); setError(''); setIssueExpense(item); setIssueNote(item.issue_note || '');
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

  return <div className="expense-page">
    <header className="expense-hero">
      <div className="expense-hero-copy">
        <p className="expense-eyebrow"><span /> NEXG PETROLUBE / FINANCE</p>
        <h1>Expense Tracker<span>.</span></h1>
        <p>Every claim, payment and reimbursement in one clear view.</p>
        <div className="expense-hero-context"><UsersRound size={15} /> {user?.is_nexg_admin ? 'All employee expenses' : 'Your personal expenses'}</div>
      </div>
      <div className="expense-hero-side">
        <span className="expense-hero-side-icon"><ReceiptText size={22} /></span>
        <span className="expense-hero-side-label">Total recorded</span>
        <strong>{loading ? '—' : money(total)}</strong>
        <small>{expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'} on record</small>
      </div>
    </header>
    {error && <div className="expense-error" role="alert">{error}</div>}
    <section className="expense-stats" aria-label="Expense overview">
      {[{ label: 'Total Expenses', value: money(total), note: 'All recorded expenses', icon: Wallet, tone: 'green' }, { label: 'Pending Claims', value: pending, note: 'Awaiting approval', icon: Clock3, tone: 'orange' }, { label: 'Reimbursed', value: money(reimbursed), note: 'Paid claims', icon: FileText, tone: 'blue' }, { label: 'Total Entries', value: expenses.length, note: 'All time', icon: BarChart3, tone: 'purple' }].map((stat) => <article className={`expense-stat ${stat.tone}`} key={stat.label}><span className="expense-stat-icon"><stat.icon size={20} /></span><div><small>{stat.label}</small><strong>{loading ? '—' : stat.value}</strong><span>{stat.note}</span></div></article>)}
    </section>
    <section className="expense-bill-controls" aria-label="Generate expense bill">
      <div className="expense-bill-icon"><FileText size={21} /></div>
      <div className="expense-bill-copy"><strong>Generate an expense bill</strong><span>Download a branded PDF with itemized entries and calculated totals.</span></div>
      <div className="expense-bill-fields"><label>Period <input aria-label="Bill month, blank for all dates" type="month" value={billMonth} onChange={(event) => setBillMonth(event.target.value)} /></label>{user?.is_nexg_admin && <label>User <select aria-label="Bill user" value={billUser} onChange={(event) => setBillUser(event.target.value)}><option value="">All users</option>{billUsers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}<button onClick={downloadBill} disabled={billBusy}><Download size={16} /> {billBusy ? 'Generating…' : 'Generate Bill'}</button></div>
    </section>
    <section className="expense-panel expense-ledger">
      <div className="expense-panel-head">
        <div><span className="expense-section-kicker">ACTIVITY</span><h2>{user?.is_nexg_admin ? 'Admin Expense View' : 'Your Expenses'}</h2><p>{user?.is_nexg_admin ? 'Review claims and resolve payments from one place' : 'Your recorded claims and payment status'}</p></div>
        <button onClick={() => setViewAll((value) => !value)}>{viewAll ? 'Show recent' : 'View all'} <ArrowRight size={15} /></button>
      </div>
      <div className="expense-table-wrap"><table className="expense-table">
        <thead><tr><th>Sl.</th><th>Date</th>{user?.is_nexg_admin && <><th>User</th><th>Rank</th></>}<th>Category</th><th>Particulars</th><th>Amount</th><th>Type</th><th>Status</th><th>Pay Method</th><th>Action</th></tr></thead>
        <tbody>{(viewAll ? expenses : expenses.slice(0, 5)).map((item, index) => {
          const finalStatus = ['Rejected', 'Reimbursed'].includes(item.status);
          return <tr key={item.id}>
            <td>{index + 1}</td><td>{dateLabel(item.created_at)}</td>
            {user?.is_nexg_admin && <><td><strong>{item.submitted_by}</strong></td><td>{item.rank || 'Employee'}</td></>}
            <td><span className="expense-category" style={{ color: colors[categories.indexOf(item.category)] || colors[5] }}>{item.category}</span></td>
            <td className="expense-particulars"><strong>{item.particulars}</strong>{item.issue_note && <small className="expense-issue-note">Issue: {item.issue_note}</small>}</td>
            <td className="expense-amount">{money(item.amount)}</td><td>{item.expense_type}</td>
            <td><span className={`expense-status ${item.status.toLowerCase().replace(/\s+/g, '-')}`}>{item.status === 'Reimbursed' ? 'Paid' : item.status}</span></td>
            <td>{item.payment_method || '-'}</td>
            <td>{(user?.is_nexg_admin || item.attachment_name) ? <div className="expense-actions"><button aria-label={`Actions for ${item.particulars}`} aria-expanded={activeMenu?.id === item.id} onClick={(event) => toggleActions(event, item.id)}>...</button>
              {activeMenu?.id === item.id && createPortal(<div ref={actionMenuRef} className="expense-action-menu">
                {user?.is_nexg_admin && !finalStatus && <>
                  <button onClick={() => openEditor(item.id)}><Pencil size={14} /> Edit expense</button>
                  <button onClick={() => openIssue(item)}><FileText size={14} /> {item.status === 'Issue Raised' ? 'Edit issue' : 'Raise issue'}</button>
                  <button className="expense-menu-danger" onClick={() => setStatus(item.id, 'Rejected')}><X size={14} /> Reject</button>
                  <button className="expense-menu-paid" onClick={() => setStatus(item.id, 'Reimbursed')}><Check size={14} /> Mark Paid</button>
                </>}
                {item.attachment_name && <button onClick={() => { setActiveMenu(null); download(item); }}><Download size={14} /> Download receipt</button>}
                {user?.is_nexg_admin && !item.attachment_name && finalStatus && <span className="expense-menu-locked">Final status - no changes</span>}
              </div>, document.body)}
            </div> : '-'}</td>
          </tr>;
        })}</tbody>
      </table></div>
      {!loading && !expenses.length && <div className="expense-empty">{user?.is_nexg_admin ? 'User expenses will appear here once recorded.' : 'No expenses to display.'}</div>}
    </section>
    <div className="expense-charts"><section className="expense-panel expense-chart-card"><div className="expense-chart-heading"><span className="expense-chart-heading-icon"><PieChart size={18} /></span><div><span className="expense-section-kicker">BREAKDOWN</span><h2>By category</h2></div></div><div className="expense-category-chart"><div className="expense-donut" style={{ background: `conic-gradient(${donut})` }}><div><strong>{money(total)}</strong><small>Total spent</small></div></div><div className="expense-legend">{categoryTotals.map((item) => <div key={item.category}><span className="expense-legend-dot" style={{ background: item.color }} /> <span>{item.category}</span><strong>{total ? Math.round(item.total / total * 100) : 0}%</strong></div>)}</div></div></section><section className="expense-panel expense-chart-card"><div className="expense-chart-heading"><span className="expense-chart-heading-icon green"><TrendingUp size={18} /></span><div><span className="expense-section-kicker">OVERVIEW</span><h2>Monthly trend</h2></div><span className="expense-chart-period">Last 6 months</span></div><div className="expense-month-chart">{monthData.map((item) => <div className="expense-month" key={item.label}><div className="expense-bar-track"><span title={`${item.label}: ${money(item.total)}`} style={{ height: `${item.total ? Math.max(5, item.total / maxMonth * 100) : 2}%` }} /></div><small>{item.label}</small></div>)}</div></section></div>
    {issueExpense && <div className="expense-issue-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setIssueExpense(null); }}>
      <form className="expense-issue-dialog" onSubmit={(event) => { event.preventDefault(); setStatus(issueExpense.id, 'Issue Raised', issueNote); }}>
        <div className="expense-issue-heading"><div><span className="expense-section-kicker">ADMIN ACTION</span><h2>{issueExpense.status === 'Issue Raised' ? 'Edit issue' : 'Raise an issue'}</h2></div><button type="button" aria-label="Close issue form" onClick={() => setIssueExpense(null)}><X size={18} /></button></div>
        <p>Explain what needs attention for {issueExpense.submitted_by}'s expense. This note is visible to the user.</p>
        {error && <div className="expense-error" role="alert">{error}</div>}
        <label>Issue details<textarea required maxLength={500} rows={4} value={issueNote} onChange={(event) => setIssueNote(event.target.value)} placeholder="Describe the missing or incorrect details" /></label>
        <div className="expense-issue-actions"><button type="button" onClick={() => setIssueExpense(null)}>Cancel</button><button className="expense-primary" type="submit">Save issue</button></div>
      </form>
    </div>}
    {formOpen && user?.is_nexg_admin && editingExpense && <div className="expense-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false); }}><aside className="expense-drawer" role="dialog" aria-modal="true" aria-labelledby="expense-form-title"><div className="expense-drawer-head"><h2 id="expense-form-title">Edit {editingExpense.submitted_by || "Employee"} Expense</h2><button aria-label="Close expense form" onClick={() => setFormOpen(false)}><X size={19} /></button></div>{error && <div className="expense-error" role="alert">{error}</div>}<form onSubmit={submit}><label>Category <em>*</em><span className="expense-select"><select value={form.category} onChange={(event) => update('category', event.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</select><ChevronDown size={16} /></span></label><label>Particulars <em>*</em><input required maxLength={500} value={form.particulars} onChange={(event) => update('particulars', event.target.value)} placeholder="What was this expense for?" /></label><label>Expense Amount (₹) <em>*</em><input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => update('amount', event.target.value)} placeholder="0.00" /></label><label>Advance / Reimbursement <em>*</em><span className="expense-select"><select value={form.expense_type} onChange={(event) => update('expense_type', event.target.value)}><option>Reimbursement</option><option>Advance</option></select><ChevronDown size={16} /></span></label><fieldset><legend>Payment Method <em>*</em></legend><label><input type="radio" name="payment" checked={form.payment_method === 'UPI'} onChange={() => update('payment_method', 'UPI')} /> UPI</label><label><input type="radio" name="payment" checked={form.payment_method === 'NEFT'} onChange={() => update('payment_method', 'NEFT')} /> NEFT</label></fieldset>{form.payment_method === 'UPI' ? <label>UPI ID <em>*</em><input required value={form.upi_id} onChange={(event) => update('upi_id', event.target.value)} placeholder="name@bank" /></label> : <><label>Account Number <em>*</em><input required value={form.account_number} onChange={(event) => update('account_number', event.target.value)} placeholder="Enter account number" /></label><label>IFSC Code <em>*</em><input required value={form.ifsc_code} onChange={(event) => update('ifsc_code', event.target.value)} placeholder="Enter IFSC code" /></label></>}<label>Attachment (Optional)<span className="expense-upload"><UploadCloud size={19} /><span>{form.attachment ? form.attachment.name : editingExpense?.attachment_name || 'Upload bill / receipt'}</span><small>PDF, JPG, PNG (Max 5MB)</small><input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => update('attachment', event.target.files?.[0] || null)} /></span></label><div className="expense-form-actions"><button type="button" onClick={() => setFormOpen(false)}>Cancel</button><button className="expense-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button></div></form></aside></div>}
  </div>;
}
