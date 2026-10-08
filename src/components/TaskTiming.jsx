import React, { useEffect, useState } from 'react';

export default function TaskTiming({ task }) {
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    setOffset(task.serverNow ? task.serverNow - Date.now() : 0);
  }, [task.serverNow]);
  useEffect(() => {
    if (!task.startedAt || task.completedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [task.startedAt, task.completedAt]);
  const seconds = task.startedAt ? Math.max(0, Math.floor(((task.completedAt || now + offset) - task.startedAt) / 1000)) : null;
  const elapsed = seconds === null ? (task.completedAt ? 'Not tracked' : 'Not started') : `${Math.floor(seconds / 3600)}h ${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}m ${String(seconds % 60).padStart(2, '0')}s`;
  return <div className="task-timing"><strong>{elapsed}</strong><small>{task.completedAt ? 'Total time' : task.startedAt ? 'Timer running' : 'Starts when in progress'}</small><small>{task.seenAt ? `Seen ${new Date(task.seenAt).toLocaleString()}` : 'Not seen yet'}</small></div>;
}
