import { useEffect, useState } from 'react';
import api from '../api/client.js';
import DashboardCard from '../components/DashboardCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { LayersIcon, ServerIcon, StackIcon, ImageIcon } from '../components/Icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatActionLabel, formatCount, formatOrthancTimestamp, formatValue } from '../utils/format.js';

function ActivityTable({ title, subtitle, rows, columns, emptyMessage }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div className="section-heading">
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <span className="panel-count">{rows.length}</span>
      </div>
      {rows.length > 0 ? (
        <div className="table-wrap flush">
          <table className="data-table compact-table">
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
                    <td key={column.label} className={column.className}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel-body">
          <EmptyState compact message={emptyMessage} />
        </div>
      )}
    </section>
  );
}

function AuditTimeline({ rows }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div className="section-heading">
          <h3>Recent Audit Activity</h3>
          <p>Latest application events recorded by the system</p>
        </div>
        <span className="panel-count">{rows.length}</span>
      </div>
      <div className="panel-body">
        {rows.length > 0 ? (
          <ol className="timeline">
            {rows.map((row, index) => (
              <li key={`${row.id ?? index}-${index}`}>
                <span className="timeline-marker" aria-hidden="true" />
                <div className="timeline-content">
                  <div className="timeline-meta">
                    <span className="action-chip">{formatActionLabel(row.action)}</span>
                    <span className="mono muted">{formatOrthancTimestamp(row.timestamp)}</span>
                  </div>
                  <p>{formatValue(row.description)}</p>
                  <span className="timeline-user">User: {formatValue(row.username, 'System')}</span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState compact message="No recent audit entries were returned." />
        )}
      </div>
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
  const sourceHint = connected ? 'Orthanc archive statistics' : 'Waiting for Orthanc';
  const cards = [
    {
      title: 'Total Studies',
      value: formatCount(summary?.studies),
      hint: sourceHint,
      icon: <LayersIcon size={18} />,
    },
    {
      title: 'Total Series',
      value: formatCount(summary?.series),
      hint: sourceHint,
      icon: <StackIcon size={18} />,
    },
    {
      title: 'Total Instances',
      value: formatCount(summary?.instances),
      hint: sourceHint,
      icon: <ImageIcon size={18} />,
    },
    {
      title: 'PACS Status',
      value: connected ? 'Connected' : 'Unavailable',
      hint: summary?.version ? `Orthanc ${summary.version}` : 'Connection checked on each load',
      icon: <ServerIcon size={18} />,
      tone: connected ? 'ok' : 'warn',
    },
  ];

  const imagingRows = Array.isArray(summary?.recentActivity) ? summary.recentActivity : [];
  const auditRows = Array.isArray(summary?.recentAudit) ? summary.recentAudit : [];

  return (
    <section className="page">
      {loading ? <LoadingState message="Loading workstation status..." /> : null}
      <ErrorMessage message={error} />
      {summary ? (
        <>
          <div className="status-strip">
            <div className="status-row">
              <StatusBadge tone={connected ? 'ok' : 'warn'}>{formatValue(summary.status)}</StatusBadge>
              <span className="status-caption">
                {connected ? 'Orthanc is available through the backend.' : 'Orthanc unavailable'}
              </span>
              {summary.message ? <span className="status-caption">{summary.message}</span> : null}
            </div>
            <span className="status-caption">Signed in as {user?.username}</span>
          </div>

          <div className="card-grid">
            {cards.map((card) => (
              <DashboardCard
                key={card.title}
                title={card.title}
                value={card.value}
                hint={card.hint}
                icon={card.icon}
                tone={card.tone}
              />
            ))}
          </div>

          <div className="dashboard-grid">
            <ActivityTable
              title="Recent Imaging Activity"
              subtitle="Latest change events reported by Orthanc"
              rows={imagingRows}
              emptyMessage="No recent imaging activity was returned by Orthanc."
              columns={[
                { label: 'Time', className: 'mono nowrap', render: (row) => formatOrthancTimestamp(row.timestamp) },
                { label: 'Event', render: (row) => formatValue(row.type) },
                { label: 'Resource', render: (row) => formatValue(row.resourceType) },
                { label: 'Identifier', className: 'mono truncate', render: (row) => formatValue(row.id) },
              ]}
            />
            <AuditTimeline rows={auditRows} />
          </div>
        </>
      ) : null}
    </section>
  );
}
