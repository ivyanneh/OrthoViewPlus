import { useEffect, useState } from 'react';
import api from '../api/client.js';
import DashboardCard from '../components/DashboardCard.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatCount, formatOrthancTimestamp, formatValue } from '../utils/format.js';

function ActivityTable({ title, rows, columns, emptyMessage }) {
  return (
    <section className="panel section-panel">
      <div className="section-heading">
        <h3>{title}</h3>
      </div>
      {rows.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.label}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.id ?? index}-${index}`}>
                  {columns.map((column) => (
                    <td key={column.label}>{column.render(row)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state compact">{emptyMessage}</div>
      )}
    </section>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await api.get('/dashboard');
        if (!cancelled) {
          setSummary(response.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'The dashboard could not be loaded.');
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
  }, []);

  const connected = Boolean(summary?.connected);
  const cards = [
    {
      title: 'Total Studies',
      value: formatCount(summary?.studies),
      hint: connected ? 'From Orthanc statistics' : 'Waiting for Orthanc',
    },
    {
      title: 'Total Series',
      value: formatCount(summary?.series),
      hint: connected ? 'From Orthanc statistics' : 'Waiting for Orthanc',
    },
    {
      title: 'Total Instances',
      value: formatCount(summary?.instances),
      hint: connected ? 'From Orthanc statistics' : 'Waiting for Orthanc',
    },
    {
      title: 'System Status',
      value: connected ? 'Connected' : 'Unavailable',
      hint: summary?.version ? `Orthanc ${summary.version}` : 'Connection checked on each load',
    },
  ];

  const imagingRows = Array.isArray(summary?.recentActivity) ? summary.recentActivity : [];
  const auditRows = Array.isArray(summary?.recentAudit) ? summary.recentAudit : [];

  return (
    <section>
      <header className="page-header">
        <h2>Dashboard</h2>
        <p>Welcome, {user?.username}. This dashboard summarizes Orthanc connectivity, imaging volume, and recent activity.</p>
      </header>
      {loading ? <LoadingState message="Loading workstation status..." /> : null}
      <ErrorMessage message={error} />
      {summary ? (
        <>
          <div className="card-grid">
            {cards.map((card) => (
              <DashboardCard key={card.title} title={card.title} value={card.value} hint={card.hint} />
            ))}
          </div>
          <div className="panel status-panel">
            <div className="status-row">
              <span className={`badge ${connected ? 'badge-ok' : 'badge-warn'}`}>{formatValue(summary.status)}</span>
              <span className="status-caption">
                {connected ? 'Orthanc is available through the backend.' : 'Orthanc unavailable'}
              </span>
            </div>
            {summary.message ? <p>{summary.message}</p> : null}
          </div>
          <div className="dashboard-grid">
            <ActivityTable
              title="Recent Imaging Activity"
              rows={imagingRows}
              emptyMessage="No recent imaging activity was returned by Orthanc."
              columns={[
                { label: 'Time', render: (row) => formatOrthancTimestamp(row.timestamp) },
                { label: 'Event', render: (row) => formatValue(row.type) },
                { label: 'Resource', render: (row) => formatValue(row.resourceType) },
                { label: 'Identifier', render: (row) => formatValue(row.id) },
              ]}
            />
            <ActivityTable
              title="Recent Audit Activity"
              rows={auditRows}
              emptyMessage="No recent audit entries were returned."
              columns={[
                { label: 'Time', render: (row) => formatOrthancTimestamp(row.timestamp) },
                { label: 'User', render: (row) => formatValue(row.username) },
                { label: 'Action', render: (row) => formatValue(row.action) },
                { label: 'Details', render: (row) => formatValue(row.description) },
              ]}
            />
          </div>
        </>
      ) : null}
    </section>
  );
}
