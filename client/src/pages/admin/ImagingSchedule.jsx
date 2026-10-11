import { useMemo, useState } from 'react';
import api from '../../api/client.js';
import EmptyState from '../../components/EmptyState.jsx';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import Modal from '../../components/Modal.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { PlusIcon } from '../../components/Icons.jsx';
import useApiData from '../../hooks/useApiData.js';
import { MODALITY_LABELS, SCHEDULE_STATUS, formatValue, getApiError, shiftLocalDate, todayLocal } from '../../utils/format.js';

const PRESETS = [
  { key: 'today', label: 'Today', range: (today) => [today, today] },
  { key: 'week', label: 'Next 7 days', range: (today) => [today, shiftLocalDate(today, 6)] },
  { key: 'past', label: 'Past 30 days', range: (today) => [shiftLocalDate(today, -30), today] },
  { key: 'all', label: 'All dates', range: () => ['', ''] },
];

function ScheduleForm({ entry, practitioners, onClose, onSaved }) {
  const editing = Boolean(entry);
  const [form, setForm] = useState({
    date: entry?.date ?? todayLocal(),
    time: entry?.time ?? '09:00',
    examination: entry?.examination ?? '',
    modality: entry?.modality ?? 'XR',
    reference: entry?.reference ?? '',
    assignedUserId: entry?.assignedUserId ? String(entry.assignedUserId) : '',
    notes: entry?.notes ?? '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const today = todayLocal();

if (!form.date || form.date < today) {
  setError(
    !form.date
      ? 'Enter a valid examination date.'
      : 'Examination date cannot be in the past.',
  );
  return;
}
    if (!form.examination.trim()) {
      setError('Examination description is required.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = { ...form, assignedUserId: form.assignedUserId || null };
    try {
      const response = editing ? await api.patch(`/admin/schedule/${entry.id}`, payload) : await api.post('/admin/schedule', payload);
      const conflicts = response.data.conflicts ?? [];
      onSaved(
        conflicts.length > 0
          ? `Saved with a scheduling conflict against ${conflicts.map((item) => `#${item.id}`).join(', ')}. An alert has been raised.`
          : editing
            ? 'Schedule entry updated.'
            : 'Examination added to the schedule.',
        conflicts.length > 0,
      );
    } catch (err) {
      setError(getApiError(err, 'The schedule entry could not be saved.'));
      setSaving(false);
    }
  }

  return (
    <Modal
      title={editing ? `Edit examination #${entry.id}` : 'Schedule examination'}
      subtitle="Operational scheduling record. Do not enter patient names or other directly identifying details."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="schedule-form" className="primary-button" disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Add to schedule'}
          </button>
        </>
      }
    >
      <form id="schedule-form" onSubmit={handleSubmit} noValidate>
        <ErrorMessage message={error} />
        <div className="form-grid">
          <div className="field">
            <label htmlFor="sched-date">Date</label>
            <input id="sched-date" type="date" value={form.date} onChange={update('date')} />
          </div>
          <div className="field">
            <label htmlFor="sched-time">Time</label>
            <input id="sched-time" type="time" value={form.time} onChange={update('time')} />
          </div>
          <div className="field span-2">
            <label htmlFor="sched-exam">Examination</label>
            <input id="sched-exam" value={form.examination} onChange={update('examination')} placeholder="e.g. Chest PA/Lateral" maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="sched-modality">Modality</label>
            <select id="sched-modality" value={form.modality} onChange={update('modality')}>
              {Object.entries(MODALITY_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label} ({code})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sched-reference">Reference</label>
            <input id="sched-reference" value={form.reference} onChange={update('reference')} placeholder="Accession / study ID" maxLength={40} />
            <span className="field-hint">Non-identifying reference only.</span>
          </div>
          <div className="field span-2">
            <label htmlFor="sched-assignee">Assigned practitioner</label>
            <select id="sched-assignee" value={form.assignedUserId} onChange={update('assignedUserId')}>
              <option value="">Unassigned</option>
              {practitioners.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.name !== item.username ? ` (${item.username})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="sched-notes">Operational notes</label>
            <input id="sched-notes" value={form.notes} onChange={update('notes')} maxLength={300} />
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default function ImagingSchedule() {
  const today = todayLocal();
  const [preset, setPreset] = useState('week');
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(shiftLocalDate(today, 6));
  const [modality, setModality] = useState('all');
  const [status, setStatus] = useState('all');
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState(null);
  const [actionError, setActionError] = useState('');

  const params = useMemo(() => ({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, modality }), [dateFrom, dateTo, modality]);
  const { data, loading, error, reload } = useApiData('/admin/schedule', params, 'Unable to load the imaging schedule.');
  const entries = useMemo(() => data?.entries ?? [], [data]);
  const practitioners = data?.practitioners ?? [];

  const counts = useMemo(() => {
    const result = { pending: 0, completed: 0, cancelled: 0, no_show: 0 };
    for (const entry of entries) {
      if (['scheduled', 'checked_in', 'in_progress'].includes(entry.status)) result.pending += 1;
      else if (result[entry.status] !== undefined) result[entry.status] += 1;
    }
    return result;
  }, [entries]);

  const visible = useMemo(() => {
    if (status === 'all') return entries;
    if (status === 'pending') return entries.filter((entry) => ['scheduled', 'checked_in', 'in_progress'].includes(entry.status));
    return entries.filter((entry) => entry.status === status);
  }, [entries, status]);

  function applyPreset(key) {
    const [from, to] = PRESETS.find((item) => item.key === key).range(today);
    setPreset(key);
    setDateFrom(from);
    setDateTo(to);
  }

  async function changeStatus(entry, nextStatus) {
    setActionError('');
    setNotice(null);
    try {
      await api.post(`/admin/schedule/${entry.id}/status`, { status: nextStatus });
      setNotice({ text: `#${entry.id} ${entry.examination}: status set to ${SCHEDULE_STATUS[nextStatus].label}.` });
      reload();
    } catch (err) {
      setActionError(getApiError(err, 'The status could not be updated.'));
    }
  }

  const summaryItems = [
    { key: 'pending', label: 'Upcoming / Pending' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'no_show', label: 'No-Shows' },
  ];

  return (
    <section className="page">
      <ErrorMessage message={error || actionError} />
      {notice ? (
        <div className={notice.warn ? 'notice-banner warn' : 'notice-banner'} role="status">
          {notice.text}
        </div>
      ) : null}

      <div className="summary-strip clickable">
        {summaryItems.map((item) => (
          <button
            type="button"
            key={item.key}
            className={status === item.key ? 'active' : undefined}
            onClick={() => setStatus(status === item.key ? 'all' : item.key)}
          >
            <span>{item.label}</span>
            <strong>{counts[item.key]}</strong>
          </button>
        ))}
      </div>

      <section className="panel">
        <div className="panel-header">
          <div className="segmented" role="group" aria-label="Date range">
            {PRESETS.map((item) => (
              <button key={item.key} type="button" className={preset === item.key ? 'active' : undefined} onClick={() => applyPreset(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setNotice(null);
              setDialog({ entry: null });
            }}
          >
            <PlusIcon size={16} />
            <span>Schedule examination</span>
          </button>
        </div>
        <div className="toolbar toolbar-4">
          <div className="field inline-field">
            <label htmlFor="sched-from">From</label>
            <input
              id="sched-from"
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setPreset('custom');
                setDateFrom(event.target.value);
              }}
            />
          </div>
          <div className="field inline-field">
            <label htmlFor="sched-to">To</label>
            <input
              id="sched-to"
              type="date"
              value={dateTo}
              onChange={(event) => {
                setPreset('custom');
                setDateTo(event.target.value);
              }}
            />
          </div>
          <div className="field inline-field">
            <label htmlFor="sched-modality-filter">Modality</label>
            <select id="sched-modality-filter" value={modality} onChange={(event) => setModality(event.target.value)}>
              <option value="all">All modalities</option>
              {Object.entries(MODALITY_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field inline-field">
            <label htmlFor="sched-status-filter">Status</label>
            <select id="sched-status-filter" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="pending">Upcoming / Pending</option>
              {Object.entries(SCHEDULE_STATUS).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="panel-subheader">
          <span>
            Showing <strong>{visible.length}</strong> of <strong>{entries.length}</strong> examinations in range
          </span>
          {loading ? <LoadingState message="Refreshing..." /> : null}
        </div>

        {visible.length > 0 ? (
          <div className="table-wrap flush">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Examination</th>
                  <th>Reference</th>
                  <th>Modality</th>
                  <th>Assigned practitioner</th>
                  <th>Status</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => {
                  const meta = SCHEDULE_STATUS[entry.status];
                  return (
                    <tr key={entry.id} className={entry.date === today ? 'row-today' : undefined}>
                      <td className="mono nowrap">{entry.date}</td>
                      <td className="mono nowrap">{entry.time}</td>
                      <td>
                        {entry.examination}
                        {entry.notes ? <div className="cell-note">{entry.notes}</div> : null}
                      </td>
                      <td className="mono muted">{formatValue(entry.reference, '—')}</td>
                      <td>
                        <span className="modality-tag" title={MODALITY_LABELS[entry.modality]}>
                          {entry.modality}
                        </span>
                      </td>
                      <td>{entry.assignedTo ? entry.assignedTo : <StatusBadge tone="warn">Unassigned</StatusBadge>}</td>
                      <td>
                        <StatusBadge tone={meta?.tone}>{meta?.label ?? entry.status}</StatusBadge>
                      </td>
                      <td className="actions-col">
                        <div className="row-actions">
                          <select
                            className="compact-select"
                            aria-label={`Change status of examination ${entry.id}`}
                            value=""
                            onChange={(event) => event.target.value && changeStatus(entry, event.target.value)}
                          >
                            <option value="">Set status…</option>
                            {Object.entries(SCHEDULE_STATUS)
                              .filter(([value]) => value !== entry.status)
                              .map(([value, item]) => (
                                <option key={value} value={value}>
                                  {item.label}
                                </option>
                              ))}
                          </select>
                          <button type="button" className="link-button" onClick={() => setDialog({ entry })}>
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel-body">
            <EmptyState
              title={entries.length === 0 ? 'No examinations in this range' : 'No examinations match this status'}
              message={
                entries.length === 0
                  ? 'Use "Schedule examination" to add operational schedule entries, or widen the date range.'
                  : 'Choose a different status filter to see other examinations.'
              }
            />
          </div>
        )}
      </section>

      {dialog ? (
        <ScheduleForm
          entry={dialog.entry}
          practitioners={practitioners}
          onClose={() => setDialog(null)}
          onSaved={(text, warn) => {
            setDialog(null);
            setNotice({ text, warn });
            reload();
          }}
        />
      ) : null}
    </section>
  );
}
