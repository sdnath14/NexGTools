import { useEffect, useState } from 'react';
import { KeyRound, RefreshCcw, Search, UserPlus, Users } from 'lucide-react';
import { ADMIN_TOKEN_KEY, API_BASE_URL, adminHeaders, authHeaders } from '../auth';
import '../AdminPage.css';
import './EmployeeDB.css';

const emptyUser = { name: '', email: '', password: '', role_id: '' };
const headers = () => ({ 'Content-Type': 'application/json', ...authHeaders(), ...adminHeaders() });
async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers: headers() });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not complete the request.');
  return data;
}

export default function EmployeeDB({ onAdminUnlocked }) {
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [draft, setDraft] = useState(emptyUser);
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadDirectory = async () => {
    const [roleData, userData] = await Promise.all([request('/api/admin/roles'), request('/api/admin/users-with-roles')]);
    setRoles(roleData.roles || []);
    setUsers(userData.users || []);
  };

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        if (!localStorage.getItem(ADMIN_TOKEN_KEY)) return;
        await request('/api/admin/me');
        if (!active) return;
        setUnlocked(true);
        onAdminUnlocked?.(true);
        await loadDirectory();
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    check();
    return () => { active = false; };
  }, []);

  const unlock = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const data = await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
      localStorage.setItem(ADMIN_TOKEN_KEY, data.admin_token);
      setPassword(''); setUnlocked(true); onAdminUnlocked?.(true);
      await loadDirectory();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const createUser = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/api/admin/users', { method: 'POST', body: JSON.stringify({ ...draft, name: draft.name.trim(), email: draft.email.trim(), role_id: Number(draft.role_id) }) });
      setDraft(emptyUser); setNotice('User created and role assigned.');
      await loadDirectory();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const assignRole = async (userId, roleId) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`/api/admin/users/${userId}/role`, { method: 'PUT', body: JSON.stringify({ role_id: Number(roleId) }) });
      await loadDirectory(); setNotice('Role updated.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const refresh = async () => {
    setBusy(true); setError('');
    try { await loadDirectory(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const visibleUsers = users.filter((user) => `${user.name} ${user.email} ${user.role || ''}`.toLowerCase().includes(query.toLowerCase()));
  const field = (key) => ({ value: draft[key], onChange: (event) => setDraft((current) => ({ ...current, [key]: event.target.value })) });

  if (loading) return <div className="admin-loading">Loading Employee DB...</div>;
  if (!unlocked) return <div className="admin-lock-page"><form className="admin-lock-card" onSubmit={unlock}>
    <div className="admin-lock-icon"><KeyRound size={28} /></div><h1>Employee DB</h1><p>Unlock admin access to manage employee accounts.</p>
    <label>Admin password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
    {error && <p className="admin-inline-error" role="alert">{error}</p>}
    <button disabled={busy}>{busy ? 'Unlocking...' : 'Unlock Employee DB'}</button>
  </form></div>;

  return <div className="admin-page employee-db">
    <header className="admin-hero"><div><span>Team management</span><h1>Employee DB</h1><p>Create employee login accounts and assign their workspace roles.</p></div><button type="button" className="admin-refresh-btn" onClick={refresh} disabled={busy}><RefreshCcw size={17} />Refresh</button></header>
    {error && <p className="admin-error" role="alert">{error}</p>}
    {notice && <p className="employee-db-notice" role="status">{notice}</p>}
    <div className="employee-db-layout">
      <form className="employee-db-form" onSubmit={createUser}>
        <h2><UserPlus size={20} /> Add employee / user</h2><p>Create a login and choose an existing role.</p>
        <fieldset disabled={busy}>
          <label>Name<input {...field('name')} autoComplete="name" placeholder="Full name" maxLength={255} required /></label>
          <label>Email<input {...field('email')} type="email" autoComplete="email" placeholder="employee@company.com" maxLength={255} required /></label>
          <label>Initial password<input {...field('password')} type="password" autoComplete="new-password" placeholder="At least 6 characters" minLength={6} required /></label>
          <label>Assigned role<select {...field('role_id')} required><option value="" disabled>Select role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
          <button className="admin-save-btn" type="submit" disabled={!roles.length}><UserPlus size={17} />{busy ? 'Saving...' : 'Add user'}</button>
        </fieldset>
        {!roles.length && <p>Create a role in the admin panel before adding a user.</p>}
      </form>
      <section className="employee-db-directory">
        <div className="employee-db-directory-head"><h2><Users size={20} /> Users <span>{users.length}</span></h2><label className="employee-db-search"><Search size={16} /><input aria-label="Search employees" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email or role" /></label></div>
        <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Assigned role</th></tr></thead><tbody>{visibleUsers.map((user) => <tr key={user.id}><td><strong>{user.name}</strong></td><td>{user.email}</td><td>{user.is_nexg_admin ? <span className="employee-db-admin">NexG Admin</span> : <select aria-label={`Role for ${user.name}`} value={user.role_id || ''} disabled={busy} onChange={(event) => assignRole(user.id, event.target.value)}><option value="" disabled>No role assigned</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select>}</td></tr>)}</tbody></table></div>
        {!visibleUsers.length && <div className="admin-empty">{query ? 'No matching users.' : 'No users yet.'}</div>}
      </section>
    </div>
  </div>;
}
