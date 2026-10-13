import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { API_BASE_URL, authHeaders } from '../auth';
import TaskTiming from '../components/TaskTiming';
import './AdminWork.css';

export default function AdminWork() {
  const { taskId } = useParams();
  const [tasks, setTasks] = useState([]);
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/my-tasks`, { headers: authHeaders() });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Could not load employee work.');
        if (active) { setTasks(data.tasks || []); setError(''); }
      } catch (err) { if (active) setError(err.message); }
      finally { if (active) setLoading(false); }
    };
    load();
    const timer = window.setInterval(load, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!taskId) return undefined;
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/my-tasks/${taskId}/reports`, { headers: authHeaders() });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Could not load employee reports.');
        if (active) { setReports(data.reports || []); setError(''); }
      } catch (err) { if (active) setError(err.message); }
    };
    load();
    const timer = window.setInterval(load, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [taskId]);

  const shown = useMemo(() => tasks.filter((task) => filter === 'All' || task.status === filter), [tasks, filter]);
  const task = taskId ? tasks.find((item) => String(item.id) === taskId) : null;
  const counts = { All: tasks.length, Pending: 0, 'In Progress': 0, Done: 0 };
  tasks.forEach((item) => { counts[item.status] = (counts[item.status] || 0) + 1; });

  const download = async (report) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/my-tasks/${taskId}/reports/${report.id}/file`, { headers: authHeaders() });
      if (!response.ok) throw new Error('Could not download the file.');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = report.fileName; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err.message); }
  };

  return <div className="admin-work-page">
    <div className="admin-work-heading">
      <div><span>TEAM ACTIVITY</span><h1>{taskId ? 'Employee work details' : 'Employee work'}</h1><p>Review task progress, employee reports, shared links, and files.</p></div>
      <Link to={taskId ? '/team-work' : '/admin'}>{taskId ? 'Back to all work' : 'Admin console'}</Link>
    </div>
    {error && <p className="admin-work-error" role="alert">{error}</p>}
    {taskId ? (
      !task && !loading ? <p className="admin-work-empty">Task not found.</p> : task && <>
        <section className="admin-work-detail">
          <div><span className={`admin-work-status status-${task.status.replaceAll(' ', '-').toLowerCase()}`}>{task.status}</span><h2>{task.title}</h2>{task.notes && <p>{task.notes}</p>}</div>
          <dl><dt>Employee</dt><dd>{task.employeeName || task.employeeEmail}</dd><dt>Employee email</dt><dd>{task.employeeEmail || '—'}</dd><dt>Due date</dt><dd>{task.dueDate || 'Not set'}</dd><dt>Priority</dt><dd>{task.priority}</dd></dl>
          <TaskTiming task={task} />
        </section>
        <section className="admin-work-reports"><h2>Updates from employee ({reports.length})</h2>
          {!reports.length && <p className="admin-work-empty">No reports or files have been sent for this task yet.</p>}
          {reports.map((report) => <article key={report.id}><header><strong>{report.author}</strong><time>{new Date(report.createdAt).toLocaleString()}</time></header>{report.message && <p>{report.message}</p>}{report.linkUrl && <a href={report.linkUrl} target="_blank" rel="noreferrer">Open shared link ↗</a>}{report.fileName && <button type="button" onClick={() => download(report)}>Download {report.fileName}</button>}</article>)}
        </section>
      </>
    ) : <>
      <div className="admin-work-summary">{['All', 'Pending', 'In Progress', 'Done'].map((item) => <button type="button" key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item} <strong>{counts[item]}</strong></button>)}</div>
      {loading ? <p className="admin-work-empty">Loading employee work...</p> : !shown.length ? <p className="admin-work-empty">No employee work in this view.</p> : <div className="admin-work-grid">{shown.map((item) => <Link key={item.id} to={`/team-work/${item.id}`} className="admin-work-card"><div><span className={`admin-work-status status-${item.status.replaceAll(' ', '-').toLowerCase()}`}>{item.status}</span><span>{item.priority} priority</span></div><h2>{item.title}</h2><p>{item.employeeName || item.employeeEmail}</p><small>Due {item.dueDate || 'not set'} · View updates and files →</small></Link>)}</div>}
    </>}
  </div>;
}
