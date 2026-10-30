import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Bell, Check, CheckCheck, ClipboardList, LoaderCircle, MessageSquare, RefreshCw, Wallet } from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import { useNotifications } from '../notificationContext';
import './Notifications.css';

export default function Notifications({ user }) {
  const { notifications, unreadCount, loading, error, refresh, markRead, nextBeforeId } = useNotifications();
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replyFeedback, setReplyFeedback] = useState({});
  const navigate = useNavigate();
  const visible = notifications.filter((item) => filter === 'all' || !item.isRead);
  const read = async (ids) => { setBusy(true); try { await markRead(ids); } finally { setBusy(false); } };
  const sendIssueReply = async (event, item) => {
    event.preventDefault();
    const message = (replyDrafts[item.id] || '').trim();
    if (!message) return;
    setBusy(true); setReplyFeedback((current) => ({ ...current, [item.id]: '' }));
    try {
      const response = await fetch(`${API_BASE_URL}/api/expenses/${item.expenseId}/issue-replies`, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not send your comment.');
      setReplyDrafts((current) => ({ ...current, [item.id]: '' }));
      setReplyFeedback((current) => ({ ...current, [item.id]: 'Your comment was sent to the admin.' }));
      await refresh();
    } catch (err) { setReplyFeedback((current) => ({ ...current, [item.id]: err.message })); }
    finally { setBusy(false); }
  };
  return <div className="notification-page">
    {!user.is_nexg_admin && <nav className="employee-page-nav"><Link to="/">← Dashboard</Link><span>Notifications</span></nav>}
    <header className="notification-hero">
      <div><span className="notification-eyebrow">NEXG TOOLS / {user.is_nexg_admin ? 'TEAM ACTIVITY' : 'YOUR WORKSPACE'}</span><h1>Notifications<span>.</span></h1><p>{user.is_nexg_admin ? 'Team progress and expense replies in one place.' : 'Your assignments, expense issues, and work updates in one place.'}</p></div>
      <div className="notification-counter"><Bell size={26} /><strong>{unreadCount}</strong><span>Unread updates</span></div>
    </header>
    <section className="notification-inbox" aria-label="Notification inbox">
      <div className="notification-toolbar"><div className="notification-tabs" aria-label="Filter notifications"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All updates</button><button aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>Unread <span>{unreadCount}</span></button></div><div className="notification-actions"><button onClick={() => refresh()} aria-label="Refresh notifications"><RefreshCw size={17} /></button><button disabled={busy || !notifications.some((item) => !item.isRead)} onClick={() => read(notifications.filter((item) => !item.isRead).map((item) => item.id))}><CheckCheck size={17} /> Mark displayed as read</button></div></div>
      {error && <div className="notification-error" role="alert">{error} <button onClick={() => refresh()}>Retry</button></div>}
      {loading ? <div className="notification-empty" role="status"><LoaderCircle size={32} /><h2>Loading your updates…</h2></div> : !visible.length ? <div className="notification-empty"><Bell size={38} /><h2>{filter === 'unread' ? 'You’re all caught up' : 'Your inbox is ready'}</h2><p>{filter === 'unread' ? 'Read updates remain in All updates.' : 'New task and expense updates will appear here.'}</p></div> : <ul className="notification-list">{visible.map((item) => {
        const done = item.eventType === 'task_completed';
        const assigned = item.eventType === 'task_assignment';
        const report = item.eventType === 'task_report';
        const expenseIssue = item.eventType === 'expense_issue_raised';
        const expenseReply = item.eventType === 'expense_issue_reply';
        const expenseEdited = item.eventType === 'expense_request_updated';
        const expenseUpdate = expenseIssue || expenseReply || expenseEdited;
        const Icon = expenseReply ? MessageSquare : expenseUpdate ? Wallet : done ? CheckCheck : assigned || report ? ClipboardList : LoaderCircle;
        return <li key={item.id} className={`notification-card ${item.isRead ? '' : 'notification-unread'} ${expenseUpdate ? 'notification-expense' : done ? 'notification-done' : assigned ? 'notification-assigned' : 'notification-progress'}`}>
          <div className="notification-event-icon"><Icon size={22} /></div><div className="notification-card-content"><div className="notification-card-meta"><strong>{expenseIssue ? 'Expense issue raised' : expenseReply ? 'Employee replied to expense issue' : expenseEdited ? 'Employee updated a request' : done ? 'Task completed' : assigned ? 'New assignment' : report ? 'New report' : 'Status update'}</strong>{!item.isRead && <span className="notification-new">New</span>}<time dateTime={new Date(item.createdAt).toISOString()}>{new Date(item.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></div><p>{item.message}</p><div className="notification-card-actions"><button onClick={() => navigate(expenseUpdate ? `/expense-tracker?expenseId=${item.expenseId}` : `${user.is_nexg_admin ? '/team-work' : '/my-tasks'}/${encodeURIComponent(item.taskId)}`)}>{expenseUpdate ? 'View request' : 'View task'} <ArrowUpRight size={15} /></button>{!item.isRead && <button disabled={busy} onClick={() => read([item.id])}><Check size={15} /> Mark as read</button>}</div>{expenseIssue && !user.is_nexg_admin && <form className="notification-issue-reply" onSubmit={(event) => sendIssueReply(event, item)}><label htmlFor={`expense-issue-reply-${item.id}`}>Your comment to the admin</label><textarea id={`expense-issue-reply-${item.id}`} maxLength={1000} rows={3} value={replyDrafts[item.id] || ''} onChange={(event) => setReplyDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Explain or answer the issue raised" /><div><button type="submit" disabled={busy || !(replyDrafts[item.id] || '').trim()}>Send comment</button>{replyFeedback[item.id] && <span role="status">{replyFeedback[item.id]}</span>}</div></form>}</div>
        </li>;
      })}</ul>}
      {nextBeforeId && <button className="notification-load-more" disabled={busy} onClick={async () => { setBusy(true); try { await refresh(nextBeforeId); } finally { setBusy(false); } }}>Load older updates</button>}
    </section>
  </div>;
}
