import React from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { LogOut, ArrowLeft, FileSpreadsheet, History, Search } from 'lucide-react';

const pageTitles = {
  '/': 'Dashboard',
  '/lead-search': 'Lead Search',
  '/lead-search/history': 'Lead Search History',
  '/lead-search/csv': 'CSV History',
  '/business-search': 'Business Search',
  '/business-search/csv': 'Business CSV History',
  '/business-outreach': 'Business Outreach',
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
  const isDashboard = location.pathname === '/';
  const pageTitle = pageTitles[location.pathname] || 'NexG Tools';
  const isLeadSearch = location.pathname.startsWith('/lead-search');
  const isBusinessSearch = location.pathname.startsWith('/business-search');
  const showsDashboardBack = location.pathname !== '/';
  const initials = user?.name
    ? user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
    : 'NT';

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
