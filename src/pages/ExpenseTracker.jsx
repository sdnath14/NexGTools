import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Check, ChevronDown, Clock3, Download, FileText, Plus, UploadCloud, Wallet, X } from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './ExpenseTracker.css';

const categories = ['Travel', 'Food', 'Office Supplies', 'Client Meeting', 'Other'];
const colors = ['#4b9cff', '#ffac3e', '#9672ee', '#29a574', '#a7b2bf'];
const blank = { category: 'Travel', particulars: '', amount: '', expense_type: 'Reimbursement', payment_method: 'UPI', upi_id: '', account_number: '', ifsc_code: '', attachment: null };
const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const dateLabel = (value) => new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export default function ExpenseTracker({ user }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [viewAll, setViewAll] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null);
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

  const total = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const pending = expenses.filter((item) => item.status === 'Pending').length;
  const reimbursed = expenses.filter((item) => item.status === 'Reimbursed').reduce((sum, item) => sum + Number(item.amount), 0);
  const categoryTotals = useMemo(() => categories.map((category, index) => ({ category, color: colors[index], total: expenses.filter((item) => item.category === category).reduce((sum, item) => sum + Number(item.amount), 0) })), [expenses]);
  const monthData = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const month = new Date(); month.setDate(1); month.setMonth(month.getMonth() - 5 + index);
    return { label: month.toLocaleDateString('en-IN', { month: 'short' }), total: expenses.filter((item) => { const date = new Date(item.created_at); return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth(); }).reduce((sum, item) => sum + Number(item.amount), 0) };
  }), [expenses]);
  const maxMonth = Math.max(...monthData.map((item) => item.total), 1);
  const donut = total ? categoryTotals.map((item, index) => `${item.color} ${categoryTotals.slice(0, index).reduce((sum, entry) => sum + entry.total, 0) / total * 100}% ${categoryTotals.slice(0, index + 1).reduce((sum, entry) => sum + entry.total, 0) / total * 100}%`).join(', ') : '#e9eef3 0% 100%';

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
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
      const response = await fetch(`${API_BASE_URL}/api/expenses`, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, amount: Number(form.amount), attachment: undefined, attachment_name: form.attachment?.name || '', attachment_type: form.attachment?.type || '', attachment_base64 }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not save expense.');
      setForm(blank); setFormOpen(false); await load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  const setStatus = async (id, status) => {
    setActiveMenu(null); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/expenses/${id}/status`, { method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not update status.');
      await load();
    } catch (err) { setError(err.message); }
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
    <header className="expense-heading"><div><p className="expense-eyebrow">NexGTools / Finance</p><h1>Expense Tracker</h1><p>Track expenses, manage reimbursements and payment details.</p></div>{!user?.is_nexg_admin && <button className="expense-primary" onClick={() => { setError(''); setFormOpen(true); }}><Plus size={17} /> Add New Expense</button>}</header>
    <div className="expense-bill-controls"><div><strong>Expense bill</strong><span>Download a PDF with itemized expenses and calculated totals.</span></div><label>Period <input aria-label="Bill month, blank for all dates" type="month" value={billMonth} onChange={(event) => setBillMonth(event.target.value)} /></label>{user?.is_nexg_admin && <label>User <select aria-label="Bill user" value={billUser} onChange={(event) => setBillUser(event.target.value)}><option value="">All users</option>{billUsers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}<button onClick={downloadBill} disabled={billBusy}><Download size={16} /> {billBusy ? 'Generating…' : 'Generate Bill'}</button></div>
    {error && <div className="expense-error" role="alert">{error}</div>}
    <section className="expense-stats" aria-label="Expense overview">
      {[{ label: 'Total Expenses', value: money(total), note: 'All recorded expenses', icon: Wallet, tone: 'green' }, { label: 'Pending Claims', value: pending, note: 'Awaiting approval', icon: Clock3, tone: 'orange' }, { label: 'Reimbursed', value: money(reimbursed), note: 'Paid claims', icon: FileText, tone: 'blue' }, { label: 'Total Entries', value: expenses.length, note: 'All time', icon: BarChart3, tone: 'purple' }].map((stat) => <article className={`expense-stat ${stat.tone}`} key={stat.label}><span className="expense-stat-icon"><stat.icon size={20} /></span><div><small>{stat.label}</small><strong>{loading ? '—' : stat.value}</strong><span>{stat.note}</span></div></article>)}
    </section>
    <section className="expense-panel"><div className="expense-panel-head"><h2>Recent Expenses</h2><button onClick={() => setViewAll((value) => !value)}>{viewAll ? 'Show recent' : 'View All'} <span>→</span></button></div><div className="expense-table-wrap"><table className="expense-table"><thead><tr><th>#</th><th>Date</th><th>Particulars</th><th>Category</th><th>Amount</th><th>Type</th><th>Payment Method</th><th>Status</th><th>Actions</th></tr></thead><tbody>{(viewAll ? expenses : expenses.slice(0, 5)).map((item, index) => <tr key={item.id}><td>{index + 1}</td><td>{dateLabel(item.created_at)}</td><td><strong>{item.particulars}</strong><small>{item.submitted_by}</small></td><td><span className="expense-category" style={{ color: colors[categories.indexOf(item.category)] || colors[4] }}>{item.category}</span></td><td className="expense-amount">{money(item.amount)}</td><td>{item.expense_type}</td><td>{item.payment_method}</td><td><span className={`expense-status ${item.status.toLowerCase()}`}>{item.status}</span></td><td><div className="expense-actions"><button aria-label={`Actions for ${item.particulars}`} onClick={() => setActiveMenu(activeMenu === item.id ? null : item.id)}>•••</button>{activeMenu === item.id && <div className="expense-action-menu">{item.attachment_name && <button onClick={() => { setActiveMenu(null); download(item); }}><Download size={14} /> Download receipt</button>}{user?.is_nexg_admin && ['Pending', 'Approved', 'Rejected', 'Reimbursed'].filter((status) => status !== item.status).map((status) => <button key={status} onClick={() => setStatus(item.id, status)}><Check size={14} /> Mark {status}</button>)}</div>}</div></td></tr>)}</tbody></table></div>{!loading && !expenses.length && <div className="expense-empty">{user?.is_nexg_admin ? 'User expenses will appear here once submitted.' : 'No expenses yet. Add the first one to start tracking.'}</div>}</section>
    <div className="expense-charts"><section className="expense-panel"><h2>Category Wise Expenses</h2><div className="expense-category-chart"><div className="expense-donut" style={{ background: `conic-gradient(${donut})` }}><div><strong>{money(total)}</strong><small>Total</small></div></div><div className="expense-legend">{categoryTotals.map((item) => <div key={item.category}><span className="expense-legend-dot" style={{ background: item.color }} /> <span>{item.category}</span><strong>{total ? Math.round(item.total / total * 100) : 0}%</strong></div>)}</div></div></section><section className="expense-panel"><h2>Monthly Trend</h2><div className="expense-month-chart">{monthData.map((item) => <div className="expense-month" key={item.label}><div className="expense-bar-track"><span title={`${item.label}: ${money(item.total)}`} style={{ height: `${item.total ? Math.max(5, item.total / maxMonth * 100) : 2}%` }} /></div><small>{item.label}</small></div>)}</div></section></div>
    {!user?.is_nexg_admin && formOpen && <div className="expense-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false); }}><aside className="expense-drawer" role="dialog" aria-modal="true" aria-labelledby="expense-form-title"><div className="expense-drawer-head"><h2 id="expense-form-title">Add New Expense</h2><button aria-label="Close expense form" onClick={() => setFormOpen(false)}><X size={19} /></button></div>{error && <div className="expense-error" role="alert">{error}</div>}<form onSubmit={submit}><label>Category <em>*</em><span className="expense-select"><select value={form.category} onChange={(event) => update('category', event.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</select><ChevronDown size={16} /></span></label><label>Particulars <em>*</em><input required maxLength={500} value={form.particulars} onChange={(event) => update('particulars', event.target.value)} placeholder="What was this expense for?" /></label><label>Expense Amount (₹) <em>*</em><input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => update('amount', event.target.value)} placeholder="0.00" /></label><label>Advance / Reimbursement <em>*</em><span className="expense-select"><select value={form.expense_type} onChange={(event) => update('expense_type', event.target.value)}><option>Reimbursement</option><option>Advance</option></select><ChevronDown size={16} /></span></label><fieldset><legend>Payment Method <em>*</em></legend><label><input type="radio" name="payment" checked={form.payment_method === 'UPI'} onChange={() => update('payment_method', 'UPI')} /> UPI</label><label><input type="radio" name="payment" checked={form.payment_method === 'NEFT'} onChange={() => update('payment_method', 'NEFT')} /> NEFT</label></fieldset>{form.payment_method === 'UPI' ? <label>UPI ID <em>*</em><input required value={form.upi_id} onChange={(event) => update('upi_id', event.target.value)} placeholder="name@bank" /></label> : <><label>Account Number <em>*</em><input required value={form.account_number} onChange={(event) => update('account_number', event.target.value)} placeholder="Enter account number" /></label><label>IFSC Code <em>*</em><input required value={form.ifsc_code} onChange={(event) => update('ifsc_code', event.target.value)} placeholder="Enter IFSC code" /></label></>}<label>Attachment (Optional)<span className="expense-upload"><UploadCloud size={19} /><span>{form.attachment ? form.attachment.name : 'Upload bill / receipt'}</span><small>PDF, JPG, PNG (Max 5MB)</small><input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => update('attachment', event.target.files?.[0] || null)} /></span></label><div className="expense-form-actions"><button type="button" onClick={() => setFormOpen(false)}>Cancel</button><button className="expense-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Expense'}</button></div></form></aside></div>}
  </div>;
}
