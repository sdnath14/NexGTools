import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Bell, Check, CheckCheck, ClipboardList, LoaderCircle, RefreshCw } from 'lucide-react';
import { useNotifications } from '../notificationContext';
import './Notifications.css';

export default function Notifications({ user }) {
  const { notifications, unreadCount, loading, error, refresh, markRead, nextBeforeId } = useNotifications();
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const visible = notifications.filter((item) => filter === 'all' || !item.isRead);
  const read = async (ids) => { setBusy(true); try { await markRead(ids); } finally { setBusy(false); } };
  return <div className="notification-page">
    <header className="notification-hero">
      <div><span className="notification-eyebrow">NEXG TOOLS / {user.is_nexg_admin ? 'TEAM ACTIVITY' : 'YOUR WORKSPACE'}</span><h1>Notifications<span>.</span></h1><p>{user.is_nexg_admin ? 'Stay close to your team’s progress, from started to completed.' : 'Your assignments and work updates, together in one place.'}</p></div>
      <div className="notification-counter"><Bell size={26} /><strong>{unreadCount}</strong><span>Unread updates</span></div>
    </header>
    <section className="notification-inbox" aria-label="Notification inbox">
      <div className="notification-toolbar"><div className="notification-tabs" aria-label="Filter notifications"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All updates</button><button aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>Unread <span>{unreadCount}</span></button></div><div className="notification-actions"><button onClick={() => refresh()} aria-label="Refresh notifications"><RefreshCw size={17} /></button><button disabled={busy || !notifications.some((item) => !item.isRead)} onClick={() => read(notifications.filter((item) => !item.isRead).map((item) => item.id))}><CheckCheck size={17} /> Mark displayed as read</button></div></div>
      {error && <div className="notification-error" role="alert">{error} <button onClick={() => refresh()}>Retry</button></div>}
      {loading ? <div className="notification-empty" role="status"><LoaderCircle size={32} /><h2>Loading your updates…</h2></div> : !visible.length ? <div className="notification-empty"><Bell size={38} /><h2>{filter === 'unread' ? 'You’re all caught up' : 'Your inbox is ready'}</h2><p>{filter === 'unread' ? 'Read updates remain in All updates.' : 'New task activity will appear here.'}</p></div> : <ul className="notification-list">{visible.map((item) => {
        const done = item.eventType === 'task_completed';
        const assigned = item.eventType === 'task_assignment';
        const Icon = done ? CheckCheck : assigned ? ClipboardList : LoaderCircle;
        return <li key={item.id} className={`notification-card ${item.isRead ? '' : 'notification-unread'} ${done ? 'notification-done' : assigned ? 'notification-assigned' : 'notification-progress'}`}>
          <div className="notification-event-icon"><Icon size={22} /></div><div className="notification-card-content"><div className="notification-card-meta"><strong>{done ? 'Task completed' : assigned ? 'New assignment' : 'Status update'}</strong>{!item.isRead && <span className="notification-new">New</span>}<time dateTime={new Date(item.createdAt).toISOString()}>{new Date(item.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></div><p>{item.message}</p><div className="notification-card-actions"><button onClick={() => navigate(`/my-tasks?taskId=${encodeURIComponent(item.taskId)}`)}>View task <ArrowUpRight size={15} /></button>{!item.isRead && <button disabled={busy} onClick={() => read([item.id])}><Check size={15} /> Mark as read</button>}</div></div>
        </li>;
      })}</ul>}
      {nextBeforeId && <button className="notification-load-more" disabled={busy} onClick={async () => { setBusy(true); try { await refresh(nextBeforeId); } finally { setBusy(false); } }}>Load older updates</button>}
    </section>
  </div>;
}
