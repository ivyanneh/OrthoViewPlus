import { useEffect, useMemo, useState } from 'react';
import api from '../api/client.js';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import { formatOrthancTimestamp, formatValue } from '../utils/format.js';

export default function AuditLog() {
  const [data, setData] = useState({ total: 0, entries: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [action, setAction] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await api.get('/audit', {
          params: {
            username: username.trim() || undefined,
            action: action.trim() || undefined,
            date: date || undefined,
            limit: 200,
          },
        });

        if (!cancelled) {
          setData(response.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Unable to load audit entries.');
          setData({ total: 0, entries: [] });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [action, date, username]);

  const entries = useMemo(() => data.entries || [], [data.entries]);

  return (
    <section>
      <header className="page-header">
        <h2>Audit Log</h2>
        <p>Administrator access only. Review application activity such as authentication events and imaging workflow access.</p>
      </header>

      {loading ? <LoadingState message="Loading audit entries..." /> : null}
      <ErrorMessage message={error} />

      <div className="panel filter-panel">
        <div className="field inline-field">
          <label htmlFor="audit-username">Username</label>
          <input id="audit-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Filter by username" />
        </div>
        <div className="field inline-field">
          <label htmlFor="audit-action">Action</label>
          <input id="audit-action" value={action} onChange={(event) => setAction(event.target.value)} placeholder="Filter by action" />
        </div>
        <div className="field inline-field">
          <label htmlFor="audit-date">Date</label>
          <input id="audit-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
      </div>

      <div className="panel audit-summary">
        <span className="badge badge-ok">{formatValue(data.total)} entries</span>
        <span className="status-caption">Only application events are stored. Passwords and authentication secrets are never logged.</span>
      </div>

      {entries.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Username</th>
                <th>Action</th>
                <th>Result / Details</th>
                <th>Resource</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatOrthancTimestamp(entry.timestamp)}</td>
                  <td>{formatValue(entry.username)}</td>
                  <td>{formatValue(entry.action)}</td>
                  <td>{formatValue(entry.description)}</td>
                  <td>{formatValue(entry.target)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">No audit entries matched the current filters.</div>
      )}
    </section>
  );
}


