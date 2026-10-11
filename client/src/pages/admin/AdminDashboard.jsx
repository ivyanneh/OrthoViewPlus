import { Link } from 'react-router-dom';
import DashboardCard from '../../components/DashboardCard.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { BellIcon, CalendarIcon, CheckIcon, ClockIcon, UserIcon, UsersIcon } from '../../components/Icons.jsx';
import useApiData from '../../hooks/useApiData.js';
import {
  ALERT_TYPE,
  SCHEDULE_STATUS,
  formatActionLabel,
  formatCount,
  formatDateTime,
  formatRole,
  formatValue,
  todayLocal,
} from '../../utils/format.js';

const ACTIVITY_STATUS = {
  in_use: { label: 'In Use', tone: 'primary' },
  scheduled: { label: 'Scheduled Activity', tone: 'info' },
  idle: { label: 'No Pending Activity', tone: 'ok' },
  no_activity: { label: 'No Scheduled Activity', tone: 'neutral' },
};

function PanelHeader({ title, subtitle, to, linkLabel }) {
  return (
    <div className="panel-header">
      <div className="section-heading">
        <h3>{title}</h3>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {to ? (
        <Link to={to} className="text-link">
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

export default function AdminDashboard() {
  const { data, loading, error } = useApiData('/admin/overview', { date: todayLocal() }, 'The administrator dashboard could not be loaded.');

  const summary = data?.schedule?.summary;
  const cards = data
    ? [
        { title: 'Total Users', value: formatCount(data.users.total), hint: `${data.users.administrators} administrator(s)`, icon: <UsersIcon size={18} /> },
        {
          title: 'Active Practitioners',
          value: formatCount(data.users.activePractitioners),
          hint: data.users.restricted ? `${data.users.restricted} account(s) restricted` : 'Active, unrestricted accounts',
          icon: <UserIcon size={18} />,
        },
        { title: "Today's Examinations", value: formatCount(summary.total), hint: 'Scheduled for today', icon: <CalendarIcon size={18} /> },
        { title: 'Completed', value: formatCount(summary.completed), hint: 'Completed today', icon: <CheckIcon size={18} />, tone: summary.completed > 0 ? 'ok' : undefined },
        { title: 'Pending', value: formatCount(summary.pending), hint: 'Scheduled, checked in or in progress', icon: <ClockIcon size={18} /> },
        {
          title: 'No-Shows',
          value: formatCount(summary.no_show),
          hint: 'Recorded today',
          icon: <BellIcon size={18} />,
          tone: summary.no_show > 0 ? 'warn' : undefined,
        },
      ]
    : [];

  return (
    <section className="page">
      {loading && !data ? <LoadingState message="Loading department overview..." /> : null}
      <ErrorMessage message={error} />

      {data ? (
        <>
          <div className="status-strip">
            <div className="status-row">
              <StatusBadge tone={data.orthanc.connected ? 'ok' : 'warn'}>
                {data.orthanc.connected ? 'Orthanc connected' : 'Orthanc unavailable'}
              </StatusBadge>
              <span className="status-caption">
                {data.orthanc.connected
                  ? `${formatValue(data.orthanc.name, 'Orthanc')} ${formatValue(data.orthanc.version, '')} · ${formatCount(data.orthanc.studies)} studies archived`
                  : 'Imaging archive statistics are unavailable.'}
              </span>
            </div>
            <span className="status-caption">Operational date: {data.date}</span>
          </div>

          <div className="card-grid card-grid-6">
            {cards.map((card) => (
              <DashboardCard key={card.title} {...card} />
            ))}
          </div>

          <div className="dashboard-grid">
            <section className="panel">
              <PanelHeader title="Today's Imaging Activity" subtitle="Examinations scheduled for today" to="/admin/schedule" linkLabel="Open schedule" />
              {data.schedule.today.length > 0 ? (
                <div className="table-wrap flush">
                  <table className="data-table compact-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Examination</th>
                        <th>Modality</th>
                        <th>Assigned</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.schedule.today.map((entry) => (
                        <tr key={entry.id}>
                          <td className="mono nowrap">{entry.time}</td>
                          <td>{entry.examination}</td>
                          <td>
                            <span className="modality-tag">{entry.modality}</span>
                          </td>
                          <td>{formatValue(entry.assignedTo, 'Unassigned')}</td>
                          <td>
                            <StatusBadge tone={SCHEDULE_STATUS[entry.status]?.tone}>{SCHEDULE_STATUS[entry.status]?.label ?? entry.status}</StatusBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="panel-body">
                  <EmptyState
                    compact
                    title="No examinations scheduled today"
                    message={
                      data.schedule.totalEntries === 0
                        ? 'The imaging schedule is empty. Add examinations from the Imaging Schedule page.'
                        : 'There are no schedule entries for today.'
                    }
                  />
                </div>
              )}
            </section>

            <section className="panel">
              <PanelHeader
                title="Recent Alerts"
                subtitle={`${data.alerts.summary.new} awaiting review`}
                to="/admin/alerts"
                linkLabel="View all alerts"
              />
              <div className="panel-body">
                {data.alerts.entries.length > 0 ? (
                  <ul className="alert-list">
                    {data.alerts.entries.map((alert) => (
                      <li key={alert.id} className={alert.status === 'new' ? 'is-new' : undefined}>
                        <div className="alert-list-top">
                          <StatusBadge tone={ALERT_TYPE[alert.type]?.tone}>{ALERT_TYPE[alert.type]?.label ?? alert.type}</StatusBadge>
                          <span className="mono muted">{formatDateTime(alert.createdAt)}</span>
                        </div>
                        <p>{alert.description}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState compact title="No alerts" message="No administrative alerts have been raised." />
                )}
              </div>
            </section>
          </div>

          <section className="panel">
            <PanelHeader
              title="Modality Overview"
              subtitle="Derived from the imaging schedule. Equipment status is not monitored by OrthoView+."
              to="/admin/modalities"
              linkLabel="Modality monitoring"
            />
            <div className="table-wrap flush">
              <table className="data-table compact-table">
                <thead>
                  <tr>
                    <th>Modality</th>
                    <th>Schedule Activity</th>
                    <th className="num">Today</th>
                    <th className="num">Pending</th>
                    <th className="num">Completed</th>
                    <th className="num">No-Shows</th>
                    <th className="num">Last 30 Days</th>
                  </tr>
                </thead>
                <tbody>
                  {data.modalities.map((item) => (
                    <tr key={item.code}>
                      <td>
                        <strong>{item.label}</strong> <span className="modality-tag">{item.code}</span>
                      </td>
                      <td>
                        <StatusBadge tone={ACTIVITY_STATUS[item.activityStatus]?.tone}>{ACTIVITY_STATUS[item.activityStatus]?.label}</StatusBadge>
                      </td>
                      <td className="num mono">{item.today.total}</td>
                      <td className="num mono">{item.today.pending}</td>
                      <td className="num mono">{item.today.completed}</td>
                      <td className="num mono">{item.today.noShows}</td>
                      <td className="num mono">{item.period.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <PanelHeader title="Recent Administrative Activity" subtitle="Latest audit records" to="/admin/audit-logs" linkLabel="Open audit logs" />
            {data.recentAudit.length > 0 ? (
              <div className="table-wrap flush">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User</th>
                      <th>Role</th>
                      <th>Action</th>
                      <th>Resource</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentAudit.map((entry) => (
                      <tr key={entry.id}>
                        <td className="mono nowrap">{formatDateTime(entry.timestamp)}</td>
                        <td>{formatValue(entry.username, 'System')}</td>
                        <td className="muted">{formatRole(entry.role)}</td>
                        <td>
                          <span className="action-chip">{formatActionLabel(entry.action)}</span>
                        </td>
                        <td className="mono muted">{formatValue(entry.target)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="panel-body">
                <EmptyState compact message="No audit records yet." />
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
