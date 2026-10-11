import { useMemo, useState } from 'react';
import api from '../../api/client.js';
import EmptyState from '../../components/EmptyState.jsx';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { CheckIcon } from '../../components/Icons.jsx';
import useApiData from '../../hooks/useApiData.js';
import { ALERT_TYPE, formatDateTime, formatValue, getApiError } from '../../utils/format.js';

const STATUS_TABS = [
  { key: 'new', label: 'New' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'all', label: 'All' },
];

export default function Alerts() {
  const { data, loading, error, setData } = useApiData('/admin/alerts', null, 'Unable to load alerts.');
  const [statusTab, setStatusTab] = useState('new');
  const [type, setType] = useState('all');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const entries = useMemo(() => data?.entries ?? [], [data]);
  const summary = { new: 0, reviewed: 0 };
  for (const entry of entries) {
    summary[entry.status] = (summary[entry.status] || 0) + 1;
  }

  const visible = useMemo(
    () =>
      entries.filter((entry) => (statusTab === 'all' || entry.status === statusTab) && (type === 'all' || entry.type === type)),
    [entries, statusTab, type],
  );

  async function review(alert) {
    setBusyId(alert.id);
    setActionError('');
    try {
      const response = await api.post(`/admin/alerts/${alert.id}/review`);
      setData((current) => ({
        ...current,
        entries: current.entries.map((entry) => (entry.id === alert.id ? response.data.alert : entry)),
      }));
    } catch (err) {
      setActionError(getApiError(err, 'The alert could not be updated.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="page">
      {loading && !data ? <LoadingState message="Loading alerts..." /> : null}
      <ErrorMessage message={error || actionError} />

      <section className="panel">
        <div className="panel-header">
          <div className="segmented" role="tablist" aria-label="Alert status">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={statusTab === tab.key}
                className={statusTab === tab.key ? 'active' : undefined}
                onClick={() => setStatusTab(tab.key)}
              >
                {tab.label}
                <span className="segmented-count">{tab.key === 'all' ? entries.length : summary[tab.key]}</span>
              </button>
            ))}
          </div>
          <div className="field inline-field inline-row">
            <label htmlFor="alert-type">Type</label>
            <select id="alert-type" value={type} onChange={(event) => setType(event.target.value)}>
              <option value="all">All alert types</option>
              {Object.entries(ALERT_TYPE).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="panel-subheader">
          <span>
            Showing <strong>{visible.length}</strong> alert(s)
          </span>
          <span className="subtle-note">Alerts are raised automatically from scheduling and account/access events. They are operational, not clinical.</span>
        </div>

        {visible.length > 0 ? (
          <div className="table-wrap flush">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Related resource</th>
                  <th>Raised</th>
                  <th>Status</th>
                  <th className="actions-col">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((alert) => (
                  <tr key={alert.id} className={alert.status === 'new' ? 'row-new' : undefined}>
                    <td className="nowrap">
                      <StatusBadge tone={ALERT_TYPE[alert.type]?.tone}>{ALERT_TYPE[alert.type]?.label ?? alert.type}</StatusBadge>
                    </td>
                    <td>{alert.description}</td>
                    <td className="mono muted nowrap">{formatValue(alert.resource, '—')}</td>
                    <td className="mono nowrap">{formatDateTime(alert.createdAt)}</td>
                    <td className="nowrap">
                      {alert.status === 'new' ? (
                        <StatusBadge tone="info">New</StatusBadge>
                      ) : (
                        <span className="reviewed-meta" title={`Reviewed ${formatDateTime(alert.reviewedAt)}`}>
                          <StatusBadge tone="neutral">Reviewed</StatusBadge>
                          <span className="muted">by {formatValue(alert.reviewedBy, 'unknown')}</span>
                        </span>
                      )}
                    </td>
                    <td className="actions-col">
                      {alert.status === 'new' ? (
                        <button type="button" className="secondary-button small" onClick={() => review(alert)} disabled={busyId === alert.id}>
                          <CheckIcon size={14} />
                          <span>Mark reviewed</span>
                        </button>
                      ) : (
                        <span className="muted mono">{formatDateTime(alert.reviewedAt)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel-body">
            <EmptyState
              title={statusTab === 'new' ? 'No new alerts' : 'No alerts'}
              message={
                entries.length === 0
                  ? 'No alerts have been raised. Alerts appear for no-shows, cancellations, scheduling conflicts, unassigned examinations and account/access events.'
                  : 'No alerts match the selected filters.'
              }
            />
          </div>
        )}
      </section>
    </section>
  );
}
