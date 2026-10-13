import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { API_BASE_URL, authHeaders } from '../auth';
import TaskTiming from '../components/TaskTiming';
import TaskStatusButtons from '../components/TaskStatusButtons';
import './EmployeeWorkspace.css';

export default function TaskDetail() {
  const { taskId } = useParams();
  const [task, setTask] = useState(null);
  const [reports, setReports] = useState([]);
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const [tasksResponse, reportsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/my-tasks`, { headers: authHeaders() }),
          fetch(`${API_BASE_URL}/api/my-tasks/${taskId}/reports`, { headers: authHeaders() }),
        ]);
        const tasksData = await tasksResponse.json(); const reportsData = await reportsResponse.json();
        if (!tasksResponse.ok || !reportsResponse.ok) throw new Error(tasksData.detail || reportsData.detail || 'Could not load task.');
        const found = (tasksData.tasks || []).find((item) => String(item.id) === taskId);
        if (!found) throw new Error('Task not found.');
        if (live) { setTask(found); setReports(reportsData.reports || []); setError(''); }
      } catch (err) { if (live) setError(err.message); }
    };
    load();
    fetch(`${API_BASE_URL}/api/work-assignments/tasks/${taskId}/seen`, { method: 'POST', headers: authHeaders() }).then(() => window.dispatchEvent(new Event('nexg-notifications-refresh'))).catch(() => {});
    return () => { live = false; };
  }, [taskId]);
  const update = async (status) => {
    setBusy(true);
    try { const response = await fetch(`${API_BASE_URL}/api/work-assignments/tasks/${taskId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ status }) }); const data = await response.json(); if (!response.ok) throw new Error(data.detail || 'Could not update task.'); setTask((current) => ({ ...current, ...data.task })); window.dispatchEvent(new Event('nexg-notifications-refresh')); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const send = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const form = new FormData(); form.append('message', message); form.append('link_url', link); if (file) form.append('file', file);
      const response = await fetch(`${API_BASE_URL}/api/my-tasks/${taskId}/reports`, { method: 'POST', headers: authHeaders(), body: form });
      const data = await response.json(); if (!response.ok) throw new Error(data.detail || 'Could not send report.');
      setReports((current) => [data.report, ...current]); setMessage(''); setLink(''); setFile(null); event.target.reset(); setNotice('Report sent to admin.'); window.dispatchEvent(new Event('nexg-notifications-refresh'));
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const download = async (report) => {
    try { const response = await fetch(`${API_BASE_URL}/api/my-tasks/${taskId}/reports/${report.id}/file`, { headers: authHeaders() }); if (!response.ok) throw new Error('Could not download file.'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = report.fileName; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (err) { setError(err.message); }
  };
  return <div className="employee-task-detail"><Link className="employee-task-back" to="/my-tasks">← Back to tasks</Link>
    {error && <p className="employee-message error" role="alert">{error}</p>}
    {notice && <p className="employee-message" role="status">{notice}</p>}
    {task && <><div className="employee-detail-top"><div className="employee-detail-banner"><h1>Your work details</h1><p>{task.title}{task.notes ? ` · ${task.notes}` : ''}</p></div><div className="employee-detail-timer"><span>Timer</span><TaskTiming task={task} /></div></div>
      <div className="employee-detail-main"><h2>Admin Report</h2><p>Due {task.dueDate || 'not set'} · {task.priority} priority</p>
        <form className="employee-report-form" onSubmit={send}><label htmlFor="task-report-message">Progress report / message</label><textarea id="task-report-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write your progress update for admin..." /><label htmlFor="task-report-link">Link to your work</label><input id="task-report-link" type="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://..." /><label htmlFor="task-report-file">Attach a file (up to 10 MB)</label><input id="task-report-file" type="file" onChange={(event) => setFile(event.target.files[0] || null)} /><button className="employee-submit" type="submit" disabled={busy || !(message.trim() || link.trim() || file)}>{busy ? 'Sending...' : 'Send to admin'}</button></form>
        <div className="employee-detail-actions"><TaskStatusButtons status={task.status} onChange={update} disabled={busy} /></div>
        <div className="employee-report-list"><h2>Updates & files</h2>{!reports.length && <p>No updates sent yet.</p>}{reports.map((report) => <article key={report.id}><strong>{report.author}</strong> <small>{new Date(report.createdAt).toLocaleString()}</small>{report.message && <p>{report.message}</p>}{report.linkUrl && <p><a href={report.linkUrl} target="_blank" rel="noreferrer">Open shared link ↗</a></p>}{report.fileName && <button type="button" onClick={() => download(report)}>📎 Download {report.fileName}</button>}</article>)}</div>
      </div></>}
  </div>;
}
