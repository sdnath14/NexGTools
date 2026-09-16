import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { LogOut, ArrowLeft, Bell, FileSpreadsheet, History, Search } from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';

const pageTitles = {
  '/': 'Dashboard',
  '/lead-search': 'Lead Search',
  '/lead-search/history': 'Lead Search History',
  '/lead-search/csv': 'CSV History',
  '/business-search': 'Business Search',
  '/business-search/csv': 'Business CSV History',
  '/business-outreach': 'Business Outreach',
  '/my-tasks': 'My Tasks',
  '/data-library': 'Data Library',
  '/data-analytics': 'Data AI',
  '/used-oil-india': 'Used Oil India Data',
  '/admin': 'Admin',
  '/tender-ai': 'TenderAI',
  '/settings': 'Settings',
};

const Topbar = ({ user, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notifications, setNotifications] = useState([]);
  const seenNotificationIdsRef = useRef(new Set());
  const isDashboard = location.pathname === '/';
  const pageTitle = pageTitles[location.pathname] || 'NexG Tools';
  const isLeadSearch = location.pathname.startsWith('/lead-search');
  const isBusinessSearch = location.pathname.startsWith('/business-search');
  const showsDashboardBack = location.pathname !== '/';
  const initials = user?.name
    ? user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
    : 'NT';

  useEffect(() => {
    if (!user?.is_nexg_admin) return undefined;
    const playNotificationSound = () => {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      oscillator.frequency.setValueAtTime(660, context.currentTime + 0.12);
      gain.gain.setValueAtTime(0.001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.38);
      window.setTimeout(() => context.close(), 550);
    };

    const pollNotifications = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/work-assignments/notifications`, { headers: authHeaders() });
        const data = await response.json();
        if (!response.ok) return;
        const nextNotifications = data.notifications || [];
        const fresh = nextNotifications.filter((item) => !seenNotificationIdsRef.current.has(item.id));
        nextNotifications.forEach((item) => seenNotificationIdsRef.current.add(item.id));
        setNotifications(nextNotifications);
        if (fresh.length) playNotificationSound();
      } catch {
        // Notifications should never disrupt navigation.
      }
    };

    pollNotifications();
    const interval = window.setInterval(pollNotifications, 10000);
    return () => window.clearInterval(interval);
  }, [user?.is_nexg_admin]);

  const clearNotifications = async () => {
    setNotifications([]);
    try {
      await fetch(`${API_BASE_URL}/api/work-assignments/notifications/read`, {
        method: 'POST',
        headers: authHeaders(),
      });
    } catch {
      // The next poll will recover if marking read fails.
    }
  };

  return (
    <header className={`topbar ${isDashboard ? 'topbar-dashboard' : ''}`}>
      <div className="topbar-left">
        {showsDashboardBack && (
          <button className="topbar-nav-btn" onClick={() => navigate('/')}>
            <ArrowLeft size={16} /> Back
          </button>
        )}
        {isDashboard ? <label className="dashboard-tool-search"><Search size={19} /><input aria-label="Search workspace tools" type="search" placeholder="Search workspace tools?" value={searchParams.get('tools') || ''} onChange={(event) => { const next = new URLSearchParams(searchParams); if (event.target.value) next.set('tools', event.target.value); else next.delete('tools'); setSearchParams(next, { replace: true }); }} /></label> : <h2 className="topbar-title">{pageTitle}</h2>}
        {isLeadSearch && (
          <div className="topbar-context-actions">
            {user?.permissions?.includes('exports') && <button className="topbar-nav-btn" onClick={() => navigate('/lead-search/csv')}>
              <FileSpreadsheet size={15} /> CSV
            </button>}
            <button className="topbar-nav-btn" onClick={() => navigate('/lead-search/history')}>
              <History size={15} /> History
            </button>
          </div>
        )}
        {isBusinessSearch && (
          <div className="topbar-context-actions">
            <button className="topbar-nav-btn" onClick={() => navigate('/business-search/csv')}>
              <FileSpreadsheet size={15} /> CSV
            </button>
          </div>
        )}
      </div>
      <div className="topbar-right">
        {user?.is_nexg_admin && <button className="topbar-btn" title={notifications[0]?.message || 'Task notifications'} onClick={clearNotifications}>
          <Bell size={15} /> {notifications.length ? `${notifications.length} New` : 'Alerts'}
        </button>}
        <button className="topbar-btn topbar-btn-logout" title="Logout" onClick={onLogout}>
          <LogOut size={15} /> Logout
        </button>
        <div className="topbar-avatar" title={user?.email || 'User'}>
          {initials}
        </div>
        {isDashboard && <strong className="dashboard-user-name">{user?.name || 'NexG User'}</strong>}
      </div>
    </header>
  );
};

export default Topbar;
