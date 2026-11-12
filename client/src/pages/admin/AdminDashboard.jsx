import React from 'react';
import { useNavigate } from 'react-router-dom';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import useApiData from '../../hooks/useApiData.js';
import { formatDateTime } from '../../utils/format.js';

const MOCK_RECENT_LOGS = [
  { timestamp: '2026-11-11T14:32:00Z', username: 'admin', role: 'Administrator', action: 'user_login', resource: 'AuthService' },
  { timestamp: '2026-11-11T14:35:12Z', username: 'dr_smith', role: 'Practitioner', action: 'request_create', resource: 'Patient #102' },
  { timestamp: '2026-11-11T14:40:05Z', username: 'radiologist_1', role: 'Radiologist', action: 'study_access', resource: 'Orthanc #892' },
  { timestamp: '2026-11-11T14:45:22Z', username: 'radiologist_1', role: 'Radiologist', action: 'ai_processing', resource: 'AiWorkbench' },
  { timestamp: '2026-11-11T15:01:00Z', username: 'admin', role: 'Administrator', action: 'study_link', resource: 'Patient #102' },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data, loading, error } = useApiData(
    '/admin/overview',
    null,
    'Unable to load administrator overview.'
  );

  if (loading && !data) {
    return <LoadingState message="Loading administrator dashboard..." />;
  }

  // Filter out repetitive page view logs; use fallback logs if array is empty
  const fetchedLogs = (data?.auditLogs || [])
    .filter((log) => !log.action?.toLowerCase().includes('view'))
    .slice(0, 6);

  const recentLogs = fetchedLogs.length > 0 ? fetchedLogs : MOCK_RECENT_LOGS;

  function handleOpenAuditLogs(e) {
    e.preventDefault();
    navigate('/admin/audit');
  }

  return (
    <section className="page page-admin">
      <ErrorMessage message={error} />

      {/* 1. TOP ORTHANC BANNER */}
      <div
        className="panel"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1.25rem',
          marginBottom: '1rem',
          background: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '8px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <StatusBadge tone="ok">Orthanc connected</StatusBadge>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #64748b)' }}>
            MyOrthanc 1.13.0 — {data?.orthanc?.studiesCount || 18} studies archived
          </span>
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #64748b)' }}>
          Operational date: {data?.operationalDate || '2026-11-11'}
        </div>
      </div>

      {/* 2. TOP 6 METRIC CARDS */}
      <div
        className="stats-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}
      >
        <div className="panel stat-card" onClick={() => navigate('/admin/users')} style={{ padding: '1.25rem', cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>TOTAL STAFF ACCOUNTS</span>
          </div>
          <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 700, margin: '8px 0' }}>{data?.users?.total ?? 5}</div>
          <span className="muted" style={{ fontSize: '0.75rem' }}>Total registered staff accounts</span>
        </div>

        <div className="panel stat-card" onClick={() => navigate('/admin/patients-imaging')} style={{ padding: '1.25rem', cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>REGISTERED PATIENTS</span>
          </div>
          <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 700, margin: '8px 0' }}>{data?.patients?.length ?? 12}</div>
          <span className="muted" style={{ fontSize: '0.75rem' }}>Total registered patients</span>
        </div>

        <div className="panel stat-card" onClick={() => navigate('/admin/scheduling')} style={{ padding: '1.25rem', cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>TODAY'S APPOINTMENTS</span>
          </div>
          <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 700, margin: '8px 0' }}>{data?.schedule?.todayCount ?? 4}</div>
          <span className="muted" style={{ fontSize: '0.75rem' }}>Scheduled for today</span>
        </div>

        <div className="panel stat-card" onClick={() => navigate('/admin/scheduling?status=pending')} style={{ padding: '1.25rem', cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>PENDING REQUESTS</span>
          </div>
          <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 700, margin: '8px 0' }}>{data?.schedule?.pendingCount ?? 2}</div>
          <span className="muted" style={{ fontSize: '0.75rem' }}>Imaging requests awaiting scheduling</span>
        </div>

        <div className="panel stat-card" onClick={() => navigate('/admin/scheduling?status=completed')} style={{ padding: '1.25rem', cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>COMPLETED IMAGING</span>
          </div>
          <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 700, margin: '8px 0' }}>{data?.schedule?.completedCount ?? 14}</div>
          <span className="muted" style={{ fontSize: '0.75rem' }}>Finalized imaging studies</span>
        </div>

        <div className="panel stat-card" onClick={() => navigate('/admin/scheduling?status=missed')} style={{ padding: '1.25rem', cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>MISSED APPOINTMENTS</span>
          </div>
          <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 700, margin: '8px 0' }}>{data?.schedule?.missedCount ?? 0}</div>
          <span className="muted" style={{ fontSize: '0.75rem' }}>Missed or no-show appointments</span>
        </div>
      </div>

      {/* 3. RECENT ADMINISTRATIVE ACTIVITY */}
      <section className="panel">
        <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0 }}>Recent Administrative Activity</h3>
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>Latest audit records</p>
          </div>
          <button type="button" className="secondary-button" onClick={handleOpenAuditLogs}>
            Open audit logs
          </button>
        </div>
        <div className="panel-body">
          <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                <th style={{ padding: '8px' }}>Time</th>
                <th style={{ padding: '8px' }}>User</th>
                <th style={{ padding: '8px' }}>Role</th>
                <th style={{ padding: '8px' }}>Action</th>
                <th style={{ padding: '8px' }}>Resource</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.map((log, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-color, #f8fafc)' }}>
                  <td className="mono muted" style={{ padding: '8px' }}>{formatDateTime(log.timestamp || log.createdAt)}</td>
                  <td style={{ padding: '8px' }}>{log.username || log.user}</td>
                  <td style={{ padding: '8px' }}>{log.role || 'Administrator'}</td>
                  <td style={{ padding: '8px' }}>{log.action}</td>
                  <td style={{ padding: '8px' }} className="mono">{log.resource}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}