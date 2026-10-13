import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE_URL, authHeaders } from '../auth';
import TaskTiming from '../components/TaskTiming';
import TaskStatusButtons from '../components/TaskStatusButtons';
import './EmployeeWorkspace.css';

export default function MyTasks() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  useEffect(() => {
    let live = true;
    const load = async () => {
      try { const response = await fetch(`${API_BASE_URL}/api/my-tasks`, { headers: authHeaders() }); const data = await response.json(); if (!response.ok) throw new Error(data.detail || 'Could not load tasks.'); if (live) { setTasks(data.tasks || []); setError(''); } }
      catch (err) { if (live) setError(err.message); }
      finally { if (live) setLoading(false); }
    };
    load(); const timer = window.setInterval(load, 10000);
    return () => { live = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => { const id = params.get('taskId'); if (id && !loading) navigate(`/my-tasks/${encodeURIComponent(id)}`, { replace: true }); }, [params, loading, navigate]);
  const shown = useMemo(() => tasks.filter((task) => filter === 'All' || task.status === filter), [tasks, filter]);
  const update = async (id, status) => {
    setBusyId(id);
    try { const response = await fetch(`${API_BASE_URL}/api/work-assignments/tasks/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ status }) }); const data = await response.json(); if (!response.ok) throw new Error(data.detail || 'Could not update status.'); setTasks((current) => current.map((task) => task.id === id ? { ...task, ...data.task } : task)); setError(''); window.dispatchEvent(new Event('nexg-notifications-refresh')); }
    catch (err) { setError(err.message); } finally { setBusyId(null); }
  };
  return <div className="employee-tasks">
    <nav className="employee-page-nav"><Link to="/">← Dashboard</Link><span>My Tasks</span></nav>
    <div className="employee-tasks-header"><div><small>YOUR WORK</small><h1>Total Tasks ({tasks.length})</h1></div><Link to="/notifications">🔔 Notifications</Link></div>
    <div className="employee-task-filters">{['All', 'Pending', 'In Progress', 'Done'].map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>{item} ({item === 'All' ? tasks.length : tasks.filter((task) => task.status === item).length})</button>)}</div>
    {error && <p className="employee-message error" role="alert">{error}</p>}
    {loading ? <p className="employee-message">Loading tasks...</p> : !shown.length ? <p className="employee-message">No tasks in this view yet.</p> : <div className="employee-task-grid">{shown.map((task, index) => <article key={task.id} className={`employee-task-card status-${task.status.replaceAll(' ', '-')}`}>
      <TaskTiming task={task} /><h2>Task {tasks.length - index}</h2><small>{task.priority} priority · Due {task.dueDate || 'not set'}</small><p>{task.title}</p>{task.notes && <p>{task.notes}</p>}
      <Link className="employee-task-open" to={`/my-tasks/${task.id}`}>Open task & report</Link>
      <TaskStatusButtons status={task.status} onChange={(status) => update(task.id, status)} disabled={busyId === task.id} />
    </article>)}</div>}
  </div>;
}
