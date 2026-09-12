import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Dashboard from './pages/Dashboard';
import LeadSearch from './pages/LeadSearch';
import SearchHistory from './pages/SearchHistory';
import BusinessSearch from './pages/BusinessSearch';
import CsvHistory from './pages/CsvHistory';
import AdminPage from './pages/AdminPage';
import AuthPage from './pages/AuthPage';
import SettingsPage from './pages/SettingsPage';
import DataLibrary from './pages/DataLibrary';
import DataAnalytics from './pages/DataAnalytics';
import BusinessOutreach from './pages/BusinessOutreach';
import UsedOilIndia from './pages/UsedOilIndia';
import WorkAssignments from './pages/WorkAssignments';
import { ADMIN_TOKEN_KEY, API_BASE_URL, AUTH_TOKEN_KEY, adminHeaders, authHeaders } from './auth';
import { applyAppearance, loadAppearance, saveAppearance } from './appearance';
import './App.css';

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [appearance, setAppearance] = useState(loadAppearance);

  useEffect(() => {
    applyAppearance(appearance);
    if (appearance.theme !== 'system') return undefined;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemTheme = () => applyAppearance(appearance);
    media.addEventListener('change', handleSystemTheme);
    return () => media.removeEventListener('change', handleSystemTheme);
  }, [appearance]);

  const updateAppearance = (nextAppearance) => {
    setAppearance(nextAppearance);
    saveAppearance(nextAppearance);
  };

  useEffect(() => {
    const loadUser = async () => {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) {
        setAuthChecked(true);
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: authHeaders(),
        });
        const data = await response.json();
        if (!response.ok) throw new Error('Session expired.');
        setUser(data.user);
        const adminToken = localStorage.getItem(ADMIN_TOKEN_KEY);
        if (adminToken) {
          const adminResponse = await fetch(`${API_BASE_URL}/api/admin/me`, {
            headers: {
              ...authHeaders(),
              ...adminHeaders(),
            },
          });
          setIsAdmin(adminResponse.ok);
          if (!adminResponse.ok) localStorage.removeItem(ADMIN_TOKEN_KEY);
        }
      } catch {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        setUser(null);
        setIsAdmin(false);
      } finally {
        setAuthChecked(true);
      }
    };
    loadUser();
  }, []);

  const logout = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: authHeaders(),
      });
    } finally {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      setUser(null);
      setIsAdmin(false);
    }
  };

  if (!authChecked) {
    return <div className="app-loading">Loading NexG Tools...</div>;
  }

  if (!user) {
    return <AuthPage onAuthenticated={setUser} />;
  }

  const hasPermission = (permission) => user.is_nexg_admin || user.permissions?.includes(permission);

  return (
    <Router>
      <div className={`app-layout ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} permissions={user.permissions || []} isNexgAdmin={user.is_nexg_admin} />
        <div className="app-main">
          <Topbar user={user} onLogout={logout} />
          <main className="app-content">
            <Routes>
              <Route path="/" element={<Dashboard user={user} />} />
              <Route path="/lead-search" element={hasPermission('lead_search') ? <LeadSearch /> : <Navigate to="/" replace />} />
              <Route path="/lead-search/history" element={hasPermission('lead_search_history') ? <SearchHistory /> : <Navigate to="/" replace />} />
              <Route path="/lead-search/csv" element={hasPermission('exports') ? <CsvHistory type="lead_search" /> : <Navigate to="/" replace />} />
              <Route path="/business-search" element={hasPermission('business_search') ? <BusinessSearch /> : <Navigate to="/" replace />} />
              <Route path="/business-search/csv" element={hasPermission('exports') ? <CsvHistory type="business_search" /> : <Navigate to="/" replace />} />
              <Route path="/business-outreach" element={hasPermission('outreach') ? <BusinessOutreach /> : <Navigate to="/" replace />} />
              <Route path="/work-assignments" element={hasPermission('work_assignments') ? <WorkAssignments /> : <Navigate to="/" replace />} />
              <Route path="/data-library" element={hasPermission('data_library') ? <DataLibrary /> : <Navigate to="/" replace />} />
              <Route path="/data-analytics" element={hasPermission('data_analytics') ? <DataAnalytics /> : <Navigate to="/" replace />} />
              <Route path="/used-oil-india" element={hasPermission('used_oil_india') ? <UsedOilIndia /> : <Navigate to="/" replace />} />
              <Route path="/settings" element={hasPermission('settings') ? <SettingsPage appearance={appearance} onAppearanceChange={updateAppearance} /> : <Navigate to="/" replace />} />
              <Route path="/admin" element={<AdminPage onAdminUnlocked={setIsAdmin} />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;
