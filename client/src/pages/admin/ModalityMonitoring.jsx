import EmptyState from '../../components/EmptyState.jsx';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import useApiData from '../../hooks/useApiData.js';
import { formatCount, formatValue, todayLocal } from '../../utils/format.js';

const ACTIVITY_STATUS = {
  in_use: { label: 'In Use', tone: 'primary', hint: 'An examination is marked In Progress today.' },
  scheduled: { label: 'Scheduled Activity', tone: 'info', hint: 'Pending examinations remain today.' },
  idle: { label: 'No Pending Activity', tone: 'ok', hint: "All of today's examinations are closed." },
  no_activity: { label: 'No Scheduled Activity', tone: 'neutral', hint: 'No examinations are scheduled today.' },
};

function Metric({ label, value, tone }) {
  return (
    <div className={`metric${tone ? ` metric-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function ModalityMonitoring() {
  const { data, loading, error } = useApiData('/admin/modalities', { date: todayLocal() }, 'Unable to load modality information.');

  return (
    <section className="page">
      {loading && !data ? <LoadingState message="Loading modality information..." /> : null}
      <ErrorMessage message={error} />

      {data ? (
        <>
          <div className="info-banner">
            <strong>Data sources.</strong> Activity status and counts are derived from the OrthoView+ imaging schedule. Archive counts come
            from Orthanc. OrthoView+ does not receive equipment telemetry, so physical equipment availability (Available, Offline,
            Maintenance) is shown as <em>Not monitored</em>.
          </div>

          <div className="modality-grid">
            {data.modalities.map((item) => {
              const status = ACTIVITY_STATUS[item.activityStatus];
              return (
                <article key={item.code} className="panel modality-card">
                  <header className="modality-card-header">
                    <div>
                      <h3>{item.label}</h3>
                      <span className="muted mono">
                        {item.code} · DICOM {item.dicom.join(', ')}
                      </span>
                    </div>
                    <span title={status?.hint}>
                      <StatusBadge tone={status?.tone}>{status?.label}</StatusBadge>
                    </span>
                  </header>

                  <div className="modality-section">
                    <p className="modality-section-title">Today ({data.date})</p>
                    <div className="metric-grid">
                      <Metric label="Scheduled" value={item.today.total} />
                      <Metric label="Pending" value={item.today.pending} />
                      <Metric label="In progress" value={item.today.inProgress} tone={item.today.inProgress ? 'primary' : undefined} />
                      <Metric label="Completed" value={item.today.completed} tone={item.today.completed ? 'ok' : undefined} />
                      <Metric label="No-shows" value={item.today.noShows} tone={item.today.noShows ? 'warn' : undefined} />
                      <Metric label="Cancelled" value={item.today.cancelled} />
                    </div>
                  </div>

                  <div className="modality-section">
                    <p className="modality-section-title">
                      Last 30 days ({data.period.from} – {data.period.to})
                    </p>
                    <div className="metric-grid">
                      <Metric label="Activity" value={item.period.total} />
                      <Metric label="Completed" value={item.period.completed} />
                      <Metric label="No-shows" value={item.period.noShows} />
                    </div>
                  </div>

                  <dl className="kv-list">
                    <div>
                      <dt>Next scheduled</dt>
                      <dd className="mono">{formatValue(item.nextScheduled, 'None scheduled')}</dd>
                    </div>
                    <div>
                      <dt>Studies in archive</dt>
                      <dd className="mono">{data.archive ? formatCount(data.archive.byModality[item.code]) : 'Unavailable'}</dd>
                    </div>
                    <div>
                      <dt>Equipment status</dt>
                      <dd>
                        <StatusBadge tone="neutral">Not monitored</StatusBadge>
                      </dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>

          <section className="panel">
            <div className="panel-header">
              <div className="section-heading">
                <h3>Imaging Archive</h3>
                <p>Orthanc connection used for archive counts</p>
              </div>
              <StatusBadge tone={data.orthanc.connected ? 'ok' : 'warn'}>{data.orthanc.connected ? 'Connected' : 'Unavailable'}</StatusBadge>
            </div>
            <div className="panel-body">
              {data.archive ? (
                <p className="status-caption">
                  Archive counts are based on the {data.archive.sampled} most recent studies returned by Orthanc ({formatCount(data.orthanc.studies)}{' '}
                  studies stored in total). A study containing several modalities is counted once for each modality.
                </p>
              ) : (
                <EmptyState compact message="Orthanc is unavailable, so archive counts per modality cannot be shown." />
              )}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
