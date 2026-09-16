import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ClipboardList, LoaderCircle } from 'lucide-react';
import { API_BASE_URL, AUTH_TOKEN_KEY, authHeaders } from '../auth';
import './WorkAssignments.css';

export default function MyTasks() {
  const [tasks, setTasks] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadTasks = async () => {
      try {
        if (localStorage.getItem(AUTH_TOKEN_KEY)) {
          const meResponse = await fetch(`${API_BASE_URL}/api/auth/me`, { headers: authHeaders() });
          const meData = await meResponse.json();
          if (meResponse.ok) setUser(meData.user);
        }
        const response = await fetch(`${API_BASE_URL}/api/my-tasks`, { headers: authHeaders() });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Could not load your tasks.');
        setTasks(data.tasks || []);
      } catch (loadError) {
        setError(loadError.message || 'Could not load your tasks.');
      } finally {
        setLoading(false);
      }
    };
    loadTasks();
  }, []);

  const summary = useMemo(() => ({
    pending: tasks.filter((task) => task.status === 'Pending').length,
    progress: tasks.filter((task) => task.status === 'In Progress').length,
    done: tasks.filter((task) => task.status === 'Done').length,
  }), [tasks]);

  const isAdminView = Boolean(user?.is_nexg_admin);

  const updateStatus = async (taskId, status) => {
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, status } : task));
    try {
      const response = await fetch(`${API_BASE_URL}/api/work-assignments/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Could not update task status.');
      setError('');
    } catch (statusError) {
      setError(statusError.message || 'Could not update task status.');
    }
  };

  return (
    <div className="work-page">
      <header className="work-hero">
        <div>
          <span>Employee Task Bar</span>
          <h1>{isAdminView ? 'Team assigned work' : 'My assigned work'}</h1>
          <p>{isAdminView ? 'Admin can review every employee task from this task bar.' : 'Tasks assigned to your employee profile appear here when your login email matches the employee email.'}</p>
        </div>
        <div className="work-hero-stats">
          <div><ClipboardList size={18} /><strong>{tasks.length}</strong><small>Total</small></div>
          <div><LoaderCircle size={18} /><strong>{summary.progress}</strong><small>In Progress</small></div>
          <div><CheckCircle2 size={18} /><strong>{summary.done}</strong><small>Done</small></div>
        </div>
      </header>

      <section className="work-table-panel">
        <div className="work-table-toolbar">
          <div><h2>Task Bar</h2><p>{summary.pending} pending · {summary.progress} in progress · {summary.done} done</p></div>
        </div>
        {error && <p className="work-inline-error">{error}</p>}
        {loading ? <div className="work-empty">Loading tasks...</div> : (
          <div className="work-table-scroll">
            <table className="work-table">
              <thead><tr>{isAdminView && <th>Employee</th>}<th>Task</th><th>Qty</th><th>Due</th><th>Priority</th><th>Status</th></tr></thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    {isAdminView && <td><strong>{task.employeeName || '-'}</strong><small>{task.employeeEmail || ''}</small></td>}
                    <td><span>{task.title}</span>{task.notes && <small>{task.notes}</small>}</td>
                    <td>{task.quantity}</td>
                    <td><CalendarDays size={14} /> {task.dueDate || '-'}</td>
                    <td><em className={`work-priority work-priority-${task.priority.toLowerCase()}`}>{task.priority}</em></td>
                    <td><select value={task.status} onChange={(event) => updateStatus(task.id, event.target.value)}><option>Pending</option><option>In Progress</option><option>Done</option></select></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!tasks.length && <div className="work-empty">No tasks have been assigned to your login yet.</div>}
          </div>
        )}
      </section>
    </div>
  );
}
