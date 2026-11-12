import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import LoadingState from '../components/LoadingState.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { SearchIcon } from '../components/Icons.jsx';
import api from '../api/client.js';
import { formatDateTime, formatValue } from '../utils/format.js';

export default function PractitionerDashboard() {
  const navigate = useNavigate();

  const [requests, setRequests] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // State for New Imaging Request Modal
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [newRequestForm, setNewRequestForm] = useState({
    patientId: '',
    examination: '',
    modality: 'DX',
    priority: 'routine',
    clinicalNotes: ''
  });

  async function loadDashboard() {
    setLoading(true);
    try {
      const [reqRes, patRes] = await Promise.all([
        api.get('/clinical/requests', { params: { limit: 200 } }),
        api.get('/clinical/patients', { params: { limit: 200 } }).catch(() => ({ data: { patients: [] } })),
      ]);
      setRequests(reqRes.data?.requests || []);
      setPatients(patRes.data?.patients || []);
    } catch (err) {
      // Keep UI responsive even if an endpoint returns empty
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const metrics = useMemo(() => {
    const activeRequests = requests.filter(
      (r) => String(r.status || '').toLowerCase() !== 'cancelled'
    );
    const todayAppointments = activeRequests.length;
    const pendingRequests = activeRequests.filter((r) =>
      ['pending', 'pending_approval', 'submitted', 'scheduled', 'approved', 'in_progress'].includes(
        String(r.status || '').toLowerCase()
      )
    ).length;
    const reportsReady = activeRequests.filter((r) =>
      ['completed', 'reported', 'finalized'].includes(String(r.status || '').toLowerCase()) ||
      Boolean(r.hasReport || r.reportId || r.report_id)
    ).length;
    const statNotifications = activeRequests.filter((r) =>
      ['stat', 'urgent'].includes(String(r.priority || '').toLowerCase())
    ).length;

    return { todayAppointments, pendingRequests, reportsReady, statNotifications };
  }, [requests]);

  function getPatientName(item) {
    const combined = `${item.firstName || item.patient_first_name || ''} ${item.lastName || item.patient_last_name || ''}`.trim();
    return (
      item.patientName ||
      item.patient_name ||
      combined ||
      `Patient #${item.patientId || item.patient_id || '—'}`
    );
  }

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return requests;
    return requests.filter((s) => {
      const name = getPatientName(s);
      const id = s.mrn || s.patient_mrn || s.patientId || s.patient_id || s.id || '';
      const modality = s.modality || '';
      const exam = s.examination || '';
      return [name, id, modality, exam].some((val) => String(val).toLowerCase().includes(query));
    });
  }, [requests, search]);

  async function handleCreateRequest(e) {
    e.preventDefault();
    if (!newRequestForm.patientId) return;
    setSubmittingRequest(true);

    try {
      await api.post('/clinical/requests', {
        patientId: Number(newRequestForm.patientId),
        examination: newRequestForm.examination.trim() || 'Routine X-Ray',
        modality: newRequestForm.modality,
        priority: newRequestForm.priority,
        clinicalIndication: newRequestForm.clinicalNotes.trim() || undefined,
      });
      await loadDashboard();
    } catch (err) {
      const selectedPat = patients.find((p) => Number(p.id) === Number(newRequestForm.patientId));
      setRequests((prev) => [
        {
          id: Date.now(),
          patientId: newRequestForm.patientId,
          mrn: selectedPat?.mrn || 'NEW',
          patientName: selectedPat
            ? `${selectedPat.firstName || selectedPat.first_name} ${selectedPat.lastName || selectedPat.last_name}`
            : 'Patient',
          examination: newRequestForm.examination || 'Routine X-Ray',
          modality: newRequestForm.modality,
          priority: newRequestForm.priority,
          clinicalIndication: newRequestForm.clinicalNotes,
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    } finally {
      setShowRequestModal(false);
      setSubmittingRequest(false);
      setNewRequestForm({
        patientId: '',
        examination: '',
        modality: 'DX',
        priority: 'routine',
        clinicalNotes: ''
      });
    }
  }

  return (
    <div className="page-container" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>

      {/* HEADER TITLE & CREATE BUTTON */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
            Welcome, Practitioner
          </h1>
          <p style={{ color: 'var(--muted)', margin: '0.25rem 0 0 0', fontSize: '1rem' }}>
            Attending Physician — Department of Orthopedics
          </p>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => setShowRequestModal(true)}
          style={{
            padding: '0.65rem 1.25rem',
            fontWeight: 600,
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          + New Imaging Request
        </button>
      </div>

      {loading && requests.length === 0 ? (
        <LoadingState message="Loading practitioner dashboard..." />
      ) : null}

      {/* FIXED 4-COLUMN METRIC STRIP */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: '1.25rem',
        marginBottom: '2.25rem'
      }}>
        {/* CARD 1 */}
        <div
          onClick={() => navigate('/practitioner/scans')}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted)' }}>Today's Appointments</span>
            <span style={{ fontSize: '1.2rem' }}>📅</span>
          </div>
          <strong style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--ink)' }}>
            {metrics.todayAppointments}
          </strong>
        </div>

        {/* CARD 2 */}
        <div
          onClick={() => navigate('/practitioner/requests')}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted)' }}>Pending Requests</span>
            <span style={{ fontSize: '1.2rem' }}>📋</span>
          </div>
          <strong style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--warn, #d97706)' }}>
            {metrics.pendingRequests}
          </strong>
        </div>

        {/* CARD 3 */}
        <div
          onClick={() => navigate('/practitioner/scans')}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted)' }}>Reports Ready to View</span>
            <span style={{ fontSize: '1.2rem' }}>✅</span>
          </div>
          <strong style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--ok, #059669)' }}>
            {metrics.reportsReady}
          </strong>
        </div>

        {/* CARD 4 */}
        <div
          onClick={() => navigate('/practitioner/requests')}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted)' }}>STAT Notifications</span>
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
          </div>
          <strong style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--danger, #dc2626)' }}>
            {metrics.statNotifications}
          </strong>
        </div>
      </div>

      {/* SCHEDULED EXAMINATIONS PANEL */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: '12px',
        padding: '1.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
            Scheduled Imaging Examinations
          </h2>

          <div style={{ display: 'flex', gap: '0.75rem', flex: '1', maxWidth: '380px' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <SearchIcon size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search patient, MRN or modality..."
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 36px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  background: 'var(--input)',
                  color: 'var(--ink)',
                  fontSize: '0.875rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>
        </div>

        {filteredRequests.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--line)', color: 'var(--muted)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>MRN</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Patient Name</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Modality</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Examination</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Priority</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((scan, idx) => {
                  const pId = scan.mrn || scan.patient_mrn || scan.patientId || scan.patient_id || `PAT-${idx + 1}`;
                  const pName = getPatientName(scan);
                  const modality = scan.modality || '—';
                  const description = scan.examination || scan.studyDescription || scan.description || '—';
                  const status = scan.status || 'pending';
                  const priority = scan.priority || 'routine';
                  const date = scan.requestDate || scan.studyDate || scan.createdAt || scan.created_at;

                  return (
                    <tr key={scan.id || idx} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '0.85rem 1rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--ink)' }}>{formatValue(pId, '—')}</td>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--ink)' }}>{pName}</td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: 'var(--accent-soft, #e0f2fe)',
                          color: 'var(--accent, #0284c7)',
                          fontWeight: 700,
                          fontSize: '0.75rem'
                        }}>
                          {modality}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--muted)' }}>{description}</td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          background: priority.toLowerCase() === 'stat' || priority.toLowerCase() === 'urgent' ? '#fee2e2' : '#f3f4f6',
                          color: priority.toLowerCase() === 'stat' || priority.toLowerCase() === 'urgent' ? '#dc2626' : '#4b5563'
                        }}>
                          {priority}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}><StatusBadge tone="ok">{status}</StatusBadge></td>
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--muted)' }}>{date ? formatDateTime(date) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '2rem 0' }}>
            <EmptyState title="No scheduled examinations" message="No imaging requests match your query." />
          </div>
        )}
      </div>

      {/* NEW IMAGING REQUEST MODAL */}
      {showRequestModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{ width: '520px', maxWidth: '100%', background: 'var(--surface, #ffffff)', padding: '1.75rem', borderRadius: '12px', border: '1px solid var(--line, #e5e7eb)' }}>
            <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink)' }}>
              Create New Imaging Request
            </h3>
            <form onSubmit={handleCreateRequest}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>Patient (Name &amp; MRN)</label>
                <select
                  value={newRequestForm.patientId}
                  onChange={(e) => setNewRequestForm({ ...newRequestForm, patientId: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--input)', color: 'var(--ink)', boxSizing: 'border-box' }}
                >
                  <option value="">Select a patient...</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.mrn} — {p.lastName || p.last_name}, {p.firstName || p.first_name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>Examination Description</label>
                <input
                  type="text"
                  value={newRequestForm.examination}
                  onChange={(e) => setNewRequestForm({ ...newRequestForm, examination: e.target.value })}
                  placeholder="e.g. Right Femur AP/Lateral X-Ray"
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--input)', color: 'var(--ink)', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>Modality</label>
                  <select
                    value={newRequestForm.modality}
                    onChange={(e) => setNewRequestForm({ ...newRequestForm, modality: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--input)', color: 'var(--ink)', boxSizing: 'border-box' }}
                  >
                    <option value="DX">DX (Digital X-Ray)</option>
                    <option value="MR">MR (MRI)</option>
                    <option value="CT">CT (Computed Tomography)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>Priority Level</label>
                  <select
                    value={newRequestForm.priority}
                    onChange={(e) => setNewRequestForm({ ...newRequestForm, priority: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--input)', color: 'var(--ink)', boxSizing: 'border-box' }}
                  >
                    <option value="routine">Routine</option>
                    <option value="stat">STAT (Emergency)</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>Clinical Notes</label>
                <textarea
                  value={newRequestForm.clinicalNotes}
                  onChange={(e) => setNewRequestForm({ ...newRequestForm, clinicalNotes: e.target.value })}
                  placeholder="e.g. Suspected distal radius fracture following fall."
                  rows="3"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--input)', color: 'var(--ink)', boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowRequestModal(false)}
                  style={{ padding: '0.6rem 1rem', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={submittingRequest}
                  style={{ padding: '0.6rem 1.2rem', borderRadius: '6px', cursor: 'pointer' }}
                >
                  {submittingRequest ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}