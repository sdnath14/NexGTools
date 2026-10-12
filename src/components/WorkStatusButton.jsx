import { useState } from 'react';
import { Check } from 'lucide-react';

const statuses = ['Pending', 'In Progress', 'Done'];

export default function WorkStatusButton({ status, onChange }) {
  const [saving, setSaving] = useState(false);
  const nextStatus = statuses[(statuses.indexOf(status) + 1) % statuses.length];

  const changeStatus = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onChange(nextStatus);
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      className={`work-status-button work-status-${status.toLowerCase().replaceAll(' ', '-')}`}
      onClick={changeStatus}
      disabled={saving}
      aria-busy={saving}
      aria-label={`${status}. Change status to ${nextStatus}`}
      title={`Change status to ${nextStatus}`}
    >
      <span className="work-status-icon" aria-hidden="true">{status === 'Pending' && <Check size={14} strokeWidth={3} />}</span>
      {status}
    </button>
  );
}
