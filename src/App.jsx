import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Dashboard from './pages/Dashboard';
import LeadSearch from './pages/LeadSearch';
import BusinessSearch from './pages/BusinessSearch';
import BusinessSearchHistory from './pages/BusinessSearchHistory';
import CsvHistory from './pages/CsvHistory';
import SearchHistory from './pages/SearchHistory';
import AdminPage from './pages/AdminPage';
import AuthPage from './pages/AuthPage';
import { ADMIN_TOKEN_KEY, API_BASE_URL, AUTH_TOKEN_KEY, adminHeaders, authHeaders } from './auth';
import './App.css';

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

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
    return <div className="app-loading">Loading NextG Tools...</div>;
  }

  if (!user) {
    return <AuthPage onAuthenticated={setUser} />;
  }

  return (
    <Router>
      <div className={`app-layout ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} isAdmin={isAdmin} />
        <div className="app-main">
          <Topbar user={user} onLogout={logout} />
          <main className="app-content">
            <Routes>
              <Route path="/" element={<Dashboard user={user} />} />
              <Route path="/lead-search" element={<LeadSearch />} />
              <Route path="/lead-search/csv" element={<CsvHistory />} />
              <Route path="/search-history" element={<SearchHistory />} />
              <Route path="/business-search" element={<BusinessSearch />} />
              <Route path="/business-search/history" element={<BusinessSearchHistory />} />
              <Route path="/admin" element={<AdminPage onAdminUnlocked={setIsAdmin} />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;
