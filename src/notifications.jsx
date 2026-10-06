import React, { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL, authHeaders } from './auth';
import { NotificationContext } from './notificationContext';

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextBeforeId, setNextBeforeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const active = useRef(true);
  const paginationStarted = useRef(false);
  const revision = useRef(0);
  const refresh = useCallback(async (beforeId = null) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const requestRevision = revision.current;
    try {
      const response = await fetch(`${API_BASE_URL}/api/work-assignments/notifications${beforeId ? `?before_id=${beforeId}` : ''}`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load notifications.');
      if (!active.current || requestRevision !== revision.current) return;
      setNotifications((current) => {
        const merged = new Map([...current, ...data.notifications].map((item) => [item.id, item]));
        return [...merged.values()].sort((a, b) => b.id - a.id);
      });
      setUnreadCount(data.unreadCount);
      if (beforeId || !paginationStarted.current) {
        setNextBeforeId(data.nextBeforeId);
        paginationStarted.current = true;
      }
      setError('');
    } catch (err) {
      if (active.current) setError(err.message || 'Could not load notifications.');
    } finally {
      inFlight.current = false;
      if (active.current) setLoading(false);
      if (active.current && requestRevision !== revision.current) refresh();
    }
  }, []);
  useEffect(() => {
    active.current = true;
    const reload = () => { if (!document.hidden) refresh(); };
    refresh();
    const timer = window.setInterval(reload, 10000);
    window.addEventListener('nexg-notifications-refresh', reload);
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', reload);
    return () => {
      active.current = false;
      window.clearInterval(timer);
      window.removeEventListener('nexg-notifications-refresh', reload);
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', reload);
    };
  }, [refresh]);
  const markRead = async (ids) => {
    if (!ids.length) return;
    try {
      for (let index = 0; index < ids.length; index += 500) {
        const response = await fetch(`${API_BASE_URL}/api/work-assignments/notifications/read`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ ids: ids.slice(index, index + 500) }),
        });
        if (!response.ok) throw new Error('Could not mark notifications as read. Please retry.');
      }
      revision.current += 1;
      const idSet = new Set(ids);
      setUnreadCount((current) => Math.max(0, current - notifications.filter((item) => idSet.has(item.id) && !item.isRead).length));
      setNotifications((current) => current.map((item) => idSet.has(item.id) ? { ...item, isRead: true } : item));
      await refresh();
      return true;
    } catch (err) { setError(err.message); return false; }
  };
  return <NotificationContext.Provider value={{ notifications, unreadCount, loading, error, refresh, markRead, nextBeforeId }}>{children}</NotificationContext.Provider>;
}
