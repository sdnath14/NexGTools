import React from 'react';

const statuses = ['Pending', 'In Progress', 'Done'];

export default function TaskStatusButtons({ status, onChange, disabled = false, canAdvance = true }) {
  return (
    <div className="task-status-buttons" role="group" aria-label="Task status">
      {statuses.map((option, index) => {
        const active = status === option;
        const available = canAdvance && (status === 'Pending' ? option === 'In Progress' : status === 'In Progress' && option === 'Done');
        return (
          <button
            key={option}
            type="button"
            className={`task-status-button task-status-button-${index}${active ? ' is-active' : ''}`}
            aria-pressed={active}
            disabled={disabled || active || !available}
            onClick={() => onChange(option)}
            title={active ? `Current status: ${option}` : available ? `Mark as ${option}` : `${option} is unavailable`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
