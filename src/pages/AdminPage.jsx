import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Database, KeyRound, RefreshCcw, Save, ShieldCheck, Table2, Trash2 } from 'lucide-react';
import '../AdminPage.css';
import { ADMIN_TOKEN_KEY, API_BASE_URL, adminHeaders, authHeaders } from '../auth';

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

      {error && (
        <div className="admin-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

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
