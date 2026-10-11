import { Link } from 'react-router-dom';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { DatabaseIcon, ImageIcon, ServerIcon, SettingsIcon, UsersIcon } from '../../components/Icons.jsx';
import useApiData from '../../hooks/useApiData.js';
import { formatCount, formatValue } from '../../utils/format.js';

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [days ? `${days}d` : null, hours ? `${hours}h` : null, `${minutes}m`].filter(Boolean).join(' ');
}

function Section({ icon, title, subtitle, action, children }) {
  return (
    <section className="panel settings-section">
      <div className="panel-header">
        <div className="settings-heading">
          <span className="stat-icon">{icon}</span>
          <div className="section-heading">
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </div>
        {action}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function SystemAdministration() {
  const { data, loading, error, reload } = useApiData('/admin/system', null, 'Unable to load system information.');

  return (
    <section className="page">
      {loading && !data ? <LoadingState message="Loading system information..." /> : null}
      <ErrorMessage message={error} />

      {data ? (
        <div className="settings-grid">
          <Section
            icon={<UsersIcon size={18} />}
            title="Account & Access"
            subtitle="Roles, account status and access restrictions"
            action={
              <Link to="/admin/users" className="text-link">
                Manage users
              </Link>
            }
          >
            <dl className="kv-list">
              {data.access.roles.map((role) => (
                <Row key={role.value} label={`${role.label} accounts (active)`}>
                  <span className="mono">{role.active}</span>
                </Row>
              ))}
              <Row label="Restricted accounts">
                <span className="mono">{data.access.restrictedAccounts}</span>
              </Row>
              <Row label="Inactive accounts">
                <span className="mono">{data.access.inactiveAccounts}</span>
              </Row>
              <Row label="Role model">Administrator · Healthcare Practitioner</Row>
            </dl>
          </Section>

          <Section
            icon={<ServerIcon size={18} />}
            title="System"
            subtitle="Application backend"
            action={
              <button type="button" className="secondary-button small" onClick={reload} disabled={loading}>
                Refresh
              </button>
            }
          >
            <dl className="kv-list">
              <Row label="Backend status">
                <StatusBadge tone="ok">Operational</StatusBadge>
              </Row>
              <Row label="Application">
                {data.application.name} <span className="mono muted">v{data.application.version}</span>
              </Row>
              <Row label="Runtime">
                <span className="mono">{data.application.runtime}</span>
              </Row>
              <Row label="Uptime">
                <span className="mono">{formatUptime(data.application.uptimeSeconds)}</span>
              </Row>
            </dl>
          </Section>

          <Section icon={<DatabaseIcon size={18} />} title="Database" subtitle="Application data store (read-only view)">
            {data.database.connected ? (
              <dl className="kv-list">
                <Row label="Status">
                  <StatusBadge tone={data.database.integrity === 'ok' ? 'ok' : 'warn'}>
                    {data.database.integrity === 'ok' ? 'Connected · integrity OK' : `Integrity: ${data.database.integrity}`}
                  </StatusBadge>
                </Row>
                <Row label="Engine">
                  <span className="mono">
                    {data.database.engine} {data.database.version} ({String(data.database.journalMode).toUpperCase()})
                  </span>
                </Row>
                <Row label="User accounts">
                  <span className="mono">{formatCount(data.database.records.users)}</span>
                </Row>
                <Row label="Audit records">
                  <span className="mono">{formatCount(data.database.records.auditLogs)}</span>
                </Row>
                <Row label="Schedule entries">
                  <span className="mono">{formatCount(data.database.records.scheduleEntries)}</span>
                </Row>
                <Row label="Alerts">
                  <span className="mono">{formatCount(data.database.records.alerts)}</span>
                </Row>
              </dl>
            ) : (
              <StatusBadge tone="danger">Database unavailable</StatusBadge>
            )}
          </Section>

          <Section icon={<ImageIcon size={18} />} title="Imaging System" subtitle="Orthanc DICOM server">
            <dl className="kv-list">
              <Row label="Connection">
                <StatusBadge tone={data.orthanc.connected ? 'ok' : 'warn'}>{data.orthanc.connected ? 'Connected' : 'Unavailable'}</StatusBadge>
              </Row>
              <Row label="Server name">{formatValue(data.orthanc.name)}</Row>
              <Row label="Version">
                <span className="mono">{formatValue(data.orthanc.version)}</span>
              </Row>
              <Row label="Studies">
                <span className="mono">{formatCount(data.orthanc.studies)}</span>
              </Row>
              <Row label="Series">
                <span className="mono">{formatCount(data.orthanc.series)}</span>
              </Row>
              <Row label="Instances">
                <span className="mono">{formatCount(data.orthanc.instances)}</span>
              </Row>
            </dl>
          </Section>

          <Section icon={<SettingsIcon size={18} />} title="Administrative Settings" subtitle="Policies enforced by the application">
            <dl className="kv-list">
              <Row label="Minimum password length">
                <span className="mono">{data.access.minPasswordLength} characters</span>
              </Row>
              <Row label="Password storage">One-way bcrypt hash; never displayed</Row>
              <Row label="Session validation">Account status and role re-checked on every request</Row>
              <Row label="Account removal">Archived, not deleted, to preserve audit history</Row>
              <Row label="Audit records">Append-only; no edit or delete from the interface</Row>
              <Row label="Administrator safeguards">Cannot deactivate, restrict or remove own account; last administrator protected</Row>
            </dl>
            <p className="field-hint settings-note">
              Server configuration, secrets and environment settings are managed on the host and are intentionally not exposed here.
            </p>
          </Section>
        </div>
      ) : null}
    </section>
  );
}
