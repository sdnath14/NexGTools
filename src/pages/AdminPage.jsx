import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Database, KeyRound, RefreshCcw, Save, ShieldCheck, Table2, Trash2, UserPlus } from 'lucide-react';
import '../AdminPage.css';
import { ADMIN_TOKEN_KEY, API_BASE_URL, adminHeaders, authHeaders } from '../auth';

const permissionLabel = (permission) => ({
  outreach: 'Business Outreach',
  work_assignments: 'Work Assignments',
  data_analytics: 'Business Analytics Platform',
  data_library: 'Data Library',
}[permission] || permission.replaceAll('_', ' '));

const compactValue = (value) => {
  if (value === null || value === undefined || value === '') return 'Not set';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const AdminPage = ({ onAdminUnlocked }) => {
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState([]);
  const [activeTable, setActiveTable] = useState('');
  const [tableData, setTableData] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draftValues, setDraftValues] = useState({});
  const [deletingId, setDeletingId] = useState(null);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '' });
  const [roles, setRoles] = useState([]);
  const [workspaceUsers, setWorkspaceUsers] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [newRole, setNewRole] = useState({ name: '', permissions: [] });
  const [editingRole, setEditingRole] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [employeeDraft, setEmployeeDraft] = useState(null);
  const [taskDraft, setTaskDraft] = useState({ employee_id: '', title: '', notes: '', due_date: '', priority: 'Medium' });
  const [success, setSuccess] = useState('');

  const selectedOverview = useMemo(
    () => overview.find((table) => table.name === activeTable),
    [activeTable, overview],
  );

  const requestHeaders = () => ({
    'Content-Type': 'application/json',
    ...authHeaders(),
    ...adminHeaders(),
  });

  const loadOverview = async () => {
    const response = await fetch(`${API_BASE_URL}/api/admin/overview`, {
      headers: requestHeaders(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Could not load admin overview.');
    setOverview(data.tables || []);
    if (!activeTable && data.tables?.length) {
      setActiveTable(data.tables[0].name);
    }
  };

  const loadTable = async (tableName) => {
    if (!tableName) return;
    const response = await fetch(`${API_BASE_URL}/api/admin/tables/${tableName}`, {
      headers: requestHeaders(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Could not load table records.');
    setTableData(data);
    setEditingId(null);
    setDraftValues({});
  };

  const loadAccessControl = async () => {
    const [rolesResponse, usersResponse] = await Promise.all([
      fetch(`${API_BASE_URL}/api/admin/roles`, { headers: requestHeaders() }),
      fetch(`${API_BASE_URL}/api/admin/users-with-roles`, { headers: requestHeaders() }),
    ]);
    const rolesData = await rolesResponse.json();
    const usersData = await usersResponse.json();
    if (!rolesResponse.ok || !usersResponse.ok) throw new Error(rolesData.detail || usersData.detail || 'Could not load access controls.');
    setRoles(rolesData.roles || []); setPermissions(rolesData.permissions || []); setWorkspaceUsers(usersData.users || []);
  };

  useEffect(() => {
    const checkAdmin = async () => {
      const adminToken = localStorage.getItem(ADMIN_TOKEN_KEY);
      if (!adminToken) {
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/api/admin/me`, {
          headers: {
            ...authHeaders(),
            ...adminHeaders(),
          },
        });
        if (!response.ok) throw new Error('Admin session expired.');
        setIsAdmin(true);
        onAdminUnlocked?.(true);
        await loadOverview();
        await loadAccessControl();
      } catch {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        setIsAdmin(false);
        onAdminUnlocked?.(false);
      } finally {
        setLoading(false);
      }
    };
    checkAdmin();
  }, []);

  useEffect(() => {
    if (isAdmin && activeTable) {
      loadTable(activeTable).catch((err) => setError(err.message));
    }
  }, [activeTable, isAdmin]);

  const unlockAdmin = async (event) => {
    event.preventDefault();
    if (!password.trim()) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Invalid admin password.');
      localStorage.setItem(ADMIN_TOKEN_KEY, data.admin_token);
      setPassword('');
      setIsAdmin(true);
      onAdminUnlocked?.(true);
      await loadOverview();
      await loadAccessControl();
    } catch (err) {
      setError(err.message || 'Could not unlock admin.');
    } finally {
      setBusy(false);
    }
  };

  const startEditing = (record) => {
    const editable = tableData?.editable || [];
    const nextDraft = {};
    editable.forEach((field) => {
      nextDraft[field] = compactValue(record[field] === 'Not set' ? '' : record[field]);
    });
    setEditingId(record.id);
    setDraftValues(nextDraft);
  };

  const saveRecord = async () => {
    if (!activeTable || !editingId) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/tables/${activeTable}/${editingId}`, {
        method: 'PUT',
        headers: requestHeaders(),
        body: JSON.stringify({ values: draftValues }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not update record.');
      setTableData(data);
      setEditingId(null);
      setDraftValues({});
      await loadOverview();
    } catch (err) {
      setError(err.message || 'Could not update record.');
    } finally {
      setBusy(false);
    }
  };

  const deleteRecord = async (record) => {
    if (!activeTable || deletingId) return;
    const description = record.company_name || record.name || record.query_text || record.result_name || `record #${record.id}`;
    if (!window.confirm(`Delete ${description}? This cannot be undone.`)) return;
    setDeletingId(record.id);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/tables/${activeTable}/${record.id}`, {
        method: 'DELETE',
        headers: requestHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not delete record.');
      setTableData(data);
      if (editingId === record.id) {
        setEditingId(null);
        setDraftValues({});
      }
      await loadOverview();
    } catch (err) {
      setError(err.message || 'Could not delete record.');
    } finally {
      setDeletingId(null);
    }
  };

  const refreshAll = async () => {
    setBusy(true);
    setError('');
    try {
      await loadOverview();
      await loadTable(activeTable);
    } catch (err) {
      setError(err.message || 'Could not refresh admin data.');
    } finally {
      setBusy(false);
    }
  };

  const createUser = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        method: 'POST', headers: requestHeaders(), body: JSON.stringify(newUser),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not create user.');
      setNewUser({ name: '', email: '', password: '' });
      await loadOverview();
      await loadAccessControl();
      if (activeTable === 'users') await loadTable('users');
    } catch (err) {
      setError(err.message || 'Could not create user.');
    } finally {
      setBusy(false);
    }
  };

  const createRole = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/roles`, { method: 'POST', headers: requestHeaders(), body: JSON.stringify(newRole) });
      const data = await response.json(); if (!response.ok) throw new Error(data.detail || 'Could not create role.');
      setNewRole({ name: '', permissions: [] }); await loadAccessControl();
    } catch (err) { setError(err.message || 'Could not create role.'); } finally { setBusy(false); }
  };

  const saveRole = async (event) => {
    event.preventDefault();
    if (!editingRole) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/roles/${editingRole.id}`, {
        method: 'PUT', headers: requestHeaders(), body: JSON.stringify({ name: editingRole.name, permissions: editingRole.permissions }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not update role.');
      setEditingRole(null);
      await loadAccessControl();
    } catch (err) { setError(err.message || 'Could not update role.'); } finally { setBusy(false); }
  };

  const removeRole = async (role) => {
    if (!window.confirm(`Delete the “${role.name}” role? This cannot be undone.`)) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/roles/${role.id}`, {
        method: 'DELETE', headers: requestHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not delete role.');
      if (editingRole?.id === role.id) setEditingRole(null);
      await loadAccessControl();
    } catch (err) { setError(err.message || 'Could not delete role.'); } finally { setBusy(false); }
  };

  const saveEmployee = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users/${editingEmployee}/employee-profile`, {
        method: 'PUT', headers: requestHeaders(), body: JSON.stringify(employeeDraft),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not save employee.');
      await loadAccessControl(); setEditingEmployee(null); setSuccess('Employee details and tool access saved.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const assignQuickTask = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/work-assignments/tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ employee_id: Number(taskDraft.employee_id), title: taskDraft.title,
          notes: taskDraft.notes, due_date: taskDraft.due_date, priority: taskDraft.priority,
          quantity: 1, status: 'Pending' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not assign task.');
      setTaskDraft({ employee_id: '', title: '', notes: '', due_date: '', priority: 'Medium' });
      setSuccess('Task assigned. The employee will see it on their dashboard and in notifications.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const assignRole = async (userId, roleId) => {
    setBusy(true); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}/role`, { method: 'PUT', headers: requestHeaders(), body: JSON.stringify({ role_id: Number(roleId) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.detail || 'Could not assign role.');
      await loadAccessControl();
    } catch (err) { setError(err.message || 'Could not assign role.'); } finally { setBusy(false); }
  };

  if (loading) {
    return <div className="admin-loading">Checking admin access...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="admin-lock-page">
        <form className="admin-lock-card" onSubmit={unlockAdmin}>
          <div className="admin-lock-icon">
            <KeyRound size={28} />
          </div>
          <h1>Admin Access</h1>
          <p>Enter the database-stored admin password to unlock system records.</p>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Admin password"
            autoComplete="current-password"
          />
          {error && (
            <div className="admin-inline-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          <button type="submit" disabled={busy}>
            <ShieldCheck size={18} />
            {busy ? 'Unlocking...' : 'Unlock Admin'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-hero">
        <div>
          <span>Admin Console</span>
          <h1>Database Control Center</h1>
          <p>View, update, and delete application records. Structural IDs, relationships, timestamps, passwords, and tokens remain protected.</p>
        </div>
        <button className="admin-refresh-btn" onClick={refreshAll} disabled={busy}>
          <RefreshCcw size={17} />
          Refresh
        </button>
      </div>

      <Link className="admin-work-review-link" to="/team-work">Review employee progress, reports and files →</Link>

      {error && (
        <div className="admin-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
      {success && <div className="admin-success" role="status">{success}</div>}

      <section className="employee-admin-grid" aria-label="Employee work administration">
        <article className="employee-admin-card employee-policy-card">
          <span className="employee-admin-kicker">Team handbook</span><h2>Working policy</h2>
          <strong>Monday to Saturday</strong>
          <p>Monday to Friday<br />10:00 am – 7:00 pm</p>
          <p>Saturday<br />10:00 am – 5:00 pm</p>
          <small>Task time begins when an employee marks a task In Progress.</small>
        </article>
        <form className="employee-admin-card employee-assign-card" onSubmit={assignQuickTask}>
          <span className="employee-admin-kicker">Daily work</span><h2>Assign a task</h2>
          <label>Employee<select required value={taskDraft.employee_id} onChange={(event) => setTaskDraft((value) => ({ ...value, employee_id: event.target.value }))}><option value="">Select employee</option>{workspaceUsers.filter((item) => !item.is_nexg_admin).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Work type / title<input required value={taskDraft.title} onChange={(event) => setTaskDraft((value) => ({ ...value, title: event.target.value }))} placeholder="e.g. Design UI" /></label>
          <label>Work details<textarea value={taskDraft.notes} onChange={(event) => setTaskDraft((value) => ({ ...value, notes: event.target.value }))} placeholder="What should be done?" /></label>
          <div className="employee-admin-inline"><label>Expiry date<input type="date" value={taskDraft.due_date} onChange={(event) => setTaskDraft((value) => ({ ...value, due_date: event.target.value }))} /></label><label>Priority<select value={taskDraft.priority} onChange={(event) => setTaskDraft((value) => ({ ...value, priority: event.target.value }))}><option>Low</option><option>Medium</option><option>High</option></select></label></div>
          <button type="submit" disabled={busy}>Assign task</button>
        </form>
        <article className="employee-admin-card employee-profile-card">
          <span className="employee-admin-kicker">Admin access</span><h2>Employee details & tools</h2>
          <label>Employee<select value={editingEmployee || ''} onChange={(event) => { const id = Number(event.target.value); const item = workspaceUsers.find((entry) => entry.id === id); setEditingEmployee(id || null); setEmployeeDraft(item ? { employee_code: item.employee_code || '', company: item.company || '', job_title: item.job_title || '', tool_permissions: item.tool_permissions ?? roles.find((role) => role.id === item.role_id)?.permissions ?? [] } : null); }}><option value="">Select employee</option>{workspaceUsers.filter((item) => !item.is_nexg_admin).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          {employeeDraft && <form onSubmit={saveEmployee}>
            <label>Employee ID<input value={employeeDraft.employee_code} onChange={(event) => setEmployeeDraft((value) => ({ ...value, employee_code: event.target.value }))} placeholder="EMP-2026-01" /></label>
            <label>Company<input value={employeeDraft.company} onChange={(event) => setEmployeeDraft((value) => ({ ...value, company: event.target.value }))} /></label>
            <label>Role / job title<input value={employeeDraft.job_title} onChange={(event) => setEmployeeDraft((value) => ({ ...value, job_title: event.target.value }))} /></label>
            <div className="employee-tool-picker"><strong>Tools this employee can access</strong>{permissions.filter((permission) => !['dashboard'].includes(permission)).map((permission) => <label key={permission}><input type="checkbox" checked={employeeDraft.tool_permissions.includes(permission)} onChange={() => setEmployeeDraft((value) => ({ ...value, tool_permissions: value.tool_permissions.includes(permission) ? value.tool_permissions.filter((item) => item !== permission) : [...value.tool_permissions, permission] }))} /> {permissionLabel(permission)}</label>)}</div>
            <button type="submit" disabled={busy}>Save employee</button>
          </form>}
        </article>
      </section>

      <form className="admin-create-user" onSubmit={createUser}>
        <div>
          <h2><UserPlus size={20} /> Create user</h2>
          <p>Create login credentials for a new workspace user. The password is stored securely and is never shown again.</p>
        </div>
        <label>Name<input value={newUser.name} onChange={(event) => setNewUser((current) => ({ ...current, name: event.target.value }))} placeholder="User name" required /></label>
        <label>Email<input type="email" value={newUser.email} onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))} placeholder="user@company.com" required /></label>
        <label>Initial password<input type="password" value={newUser.password} onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))} placeholder="At least 6 characters" minLength="6" required /></label>
        <button type="submit" className="admin-save-btn" disabled={busy}><UserPlus size={17} /> Create user</button>
      </form>

      <section className="admin-access-control">
        <div><h2>Roles & tool access</h2><p>Set role defaults here. Employee-specific choices above take priority for that employee.</p></div>
        <form onSubmit={createRole} className="admin-role-form">
          <input value={newRole.name} onChange={(event) => setNewRole((value) => ({ ...value, name: event.target.value }))} placeholder="New role name" required />
          <div className="admin-permission-list">{permissions.map((permission) => <label key={permission}><input type="checkbox" checked={newRole.permissions.includes(permission)} onChange={() => setNewRole((value) => ({ ...value, permissions: value.permissions.includes(permission) ? value.permissions.filter((item) => item !== permission) : [...value.permissions, permission] }))} /> {permissionLabel(permission)}</label>)}</div>
          <button type="submit" className="admin-save-btn" disabled={busy}>Create role</button>
        </form>
        {editingRole && <form onSubmit={saveRole} className="admin-role-form admin-role-edit-form">
          <input value={editingRole.name} onChange={(event) => setEditingRole((role) => ({ ...role, name: event.target.value }))} placeholder="Role name" required />
          <div className="admin-permission-list">{permissions.map((permission) => <label key={permission}><input type="checkbox" checked={editingRole.permissions.includes(permission)} onChange={() => setEditingRole((role) => ({ ...role, permissions: role.permissions.includes(permission) ? role.permissions.filter((item) => item !== permission) : [...role.permissions, permission] }))} /> {permissionLabel(permission)}</label>)}</div>
          <button type="submit" className="admin-save-btn" disabled={busy}>Save access</button>
          <button type="button" className="admin-cancel-btn" onClick={() => setEditingRole(null)} disabled={busy}>Cancel</button>
        </form>}
        <div className="admin-role-list">{roles.map((role) => <div key={role.id}><strong>{role.name}</strong><span>{role.permissions.map(permissionLabel).join(', ') || 'No tools'}</span><div className="admin-role-actions"><button type="button" className="admin-edit-role-btn" onClick={() => setEditingRole({ id: role.id, name: role.name, permissions: [...role.permissions] })} disabled={busy}>Edit access</button><button type="button" className="admin-delete-role-btn" onClick={() => removeRole(role)} disabled={busy} title={`Delete ${role.name}`}><Trash2 size={15} /> Delete</button></div></div>)}</div>
        <div className="admin-user-roles">{workspaceUsers.map((workspaceUser) => workspaceUser.is_nexg_admin ? <div key={workspaceUser.id} className="admin-nexg-admin-user"><span><strong>{workspaceUser.name}</strong> <small>({workspaceUser.email})</small></span><em>NexG Admin · full access · no role required</em></div> : <label key={workspaceUser.id}><span>{workspaceUser.name} <small>({workspaceUser.email})</small></span><select value={workspaceUser.role_id || ''} onChange={(event) => assignRole(workspaceUser.id, event.target.value)} disabled={busy}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>)}</div>
      </section>

      <div className="admin-overview-grid">
        {overview.map((table) => (
          <button
            key={table.name}
            type="button"
            className={`admin-stat-card ${activeTable === table.name ? 'admin-stat-card-active' : ''}`}
            onClick={() => setActiveTable(table.name)}
          >
            <Database size={20} />
            <span>{table.label}</span>
            <strong>{table.count}</strong>
            <small>{table.latest ? new Date(table.latest).toLocaleString() : 'No records yet'}</small>
          </button>
        ))}
      </div>

      <div className="admin-table-panel">
        <div className="admin-table-head">
          <div>
            <h2>
              <Table2 size={20} />
              {tableData?.label || selectedOverview?.label || 'Records'}
            </h2>
            <p>{tableData?.records?.length || 0} latest records shown</p>
          </div>
          {editingId && (
            <button className="admin-save-btn" onClick={saveRecord} disabled={busy}>
              <Save size={17} />
              Save Changes
            </button>
          )}
        </div>

        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                {(tableData?.fields || []).map((field) => (
                  <th key={field}>{field.replaceAll('_', ' ')}</th>
                ))}
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {(tableData?.records || []).map((record) => (
                <tr key={record.id}>
                  {tableData.fields.map((field) => {
                    const isEditable = tableData.editable.includes(field);
                    const isEditing = editingId === record.id && isEditable;
                    return (
                      <td key={field}>
                        {isEditing ? (
                          <textarea
                            value={draftValues[field] || ''}
                            onChange={(event) =>
                              setDraftValues((current) => ({ ...current, [field]: event.target.value }))
                            }
                          />
                        ) : (
                          <span>{compactValue(record[field])}</span>
                        )}
                      </td>
                    );
                  })}
                  <td>
                    <div className="admin-row-actions">
                      {editingId === record.id ? (
                        <button className="admin-cancel-btn" onClick={() => setEditingId(null)}>Cancel</button>
                      ) : (
                        <button className="admin-edit-btn" onClick={() => startEditing(record)}>Edit</button>
                      )}
                      <button className="admin-delete-btn" onClick={() => deleteRecord(record)} disabled={deletingId === record.id}>
                        <Trash2 size={14} /> {deletingId === record.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!tableData?.records?.length && <div className="admin-empty">No records in this table yet.</div>}
        </div>
      </div>
    </div>
  );
};

export default AdminPage;
