import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { getApiError } from '../utils/format.js';

export default function PractitionerRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [patients, setPatients] = useState([]);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [form, setForm] = useState({
    patientId: '',
    examination: '',
    modality: 'DX',
    priority: 'routine',
    clinicalIndication: '',
  });

  async function loadRequests() {
    setError('');
    setLoading(true);
    try {
      const [reqRes, patRes] = await Promise.all([
        api.get('/clinical/requests', { params: { limit: 100 } }),
        api.get('/clinical/patients', { params: { limit: 200 } }).catch(() => ({ data: { patients: [] } })),
      ]);
      setRequests(reqRes.data.requests || []);
      setPatients(patRes.data.patients || []);
    } catch (err) {
      setError(getApiError(err, 'Unable to load requests.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, [user?.id]);

  async function handleSubmitRequest(e) {
    e.preventDefault();
    setModalError('');
    setNotice('');

    if (!form.patientId) {
      setModalError('Please select a patient.');
      return;
    }
    if (!form.examination.trim()) {
      setModalError('Please enter the requested examination.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/clinical/requests', {
        patientId: Number(form.patientId),
        examination: form.examination.trim(),
        modality: form.modality,
        priority: form.priority,
        clinicalIndication: form.clinicalIndication.trim() || undefined,
      });
      setShowModal(false);
      setForm({
        patientId: '',
        examination: '',
        modality: 'DX',
        priority: 'routine',
        clinicalIndication: '',
      });
      setNotice('Imaging request scheduled and submitted successfully.');
      await loadRequests();
    } catch (err) {
      setModalError(getApiError(err, 'Unable to submit imaging request.'));
    } finally {
      setSubmitting(false);
    }
  }

  const filteredRequests = requests.filter((r) => {
    if (filter === 'All') return true;
    const status = String(r.status || '').toLowerCase();
    if (filter === 'Pending') return ['pending', 'pending_approval', 'submitted'].includes(status);
    if (filter === 'Approved') return status === 'approved';
    if (filter === 'Scheduled') return status === 'scheduled';
    if (filter === 'Completed') return status === 'completed';
    return true;
  });

  const statusOptions = ['All', 'Pending', 'Approved', 'Scheduled', 'Completed'];

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Imaging Schedule &amp; Requests</h1>
        </div>
        <div className="filter-bar">
          {statusOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              className={filter === opt ? 'primary-button' : 'secondary-button'}
              style={{ marginRight: '0.5rem', padding: '0.5rem 1rem' }}
              onClick={() => setFilter(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {error ? <ErrorMessage message={error} /> : null}
      {notice ? <p className="success-message" role="status">{notice}</p> : null}

      <div className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Patient Name</th>
                <th>MRN</th>
                <th>Modality / Exam</th>
                <th>Priority</th>
                <th>Request Date</th>
                <th>Indication</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8">Loading imaging requests...</td>
                </tr>
              ) : filteredRequests.length > 0 ? (
                filteredRequests.map((req) => (
                  <tr key={req.id}>
                    <td>#{req.id}</td>
                    <td>
                      {req.patientName ||
                        `${req.firstName || req.patient_first_name || ''} ${req.lastName || req.patient_last_name || ''}`.trim() ||
                        `Patient #${req.patientId || req.patient_id}`}
                    </td>
                    <td className="mono">{req.mrn || req.patient_mrn || '—'}</td>
                    <td>
                      {req.examination} ({req.modality})
                    </td>
                    <td>
                      <StatusBadge
                        tone={['stat', 'urgent'].includes(String(req.priority).toLowerCase()) ? 'danger' : 'info'}
                      >
                        {req.priority || 'routine'}
                      </StatusBadge>
                    </td>
                    <td>
                      {req.requestDate ||
                        (req.createdAt || req.created_at
                          ? new Date(req.createdAt || req.created_at).toLocaleDateString()
                          : '—')}
                    </td>
                    <td>{req.clinicalIndication || req.clinical_indication || '—'}</td>
                    <td>
                      <StatusBadge tone="ok">{req.status}</StatusBadge>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8">No requests found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          setModalError('');
          setShowModal(true);
        }}
        className="primary-button"
        style={{ marginTop: '1rem' }}
      >
        + Schedule New Imaging
      </button>

      {showModal ? (
        <Modal title="Schedule New Imaging Request" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmitRequest}>
            <div className="modal-body">
              {modalError ? <ErrorMessage message={modalError} /> : null}

              <div className="field">
                <label htmlFor="req-patient">Patient (Name &amp; MRN)</label>
                <select
                  id="req-patient"
                  value={form.patientId}
                  onChange={(e) => setForm({ ...form, patientId: e.target.value })}
                  required
                >
                  <option value="">Select a patient...</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.mrn} — {p.lastName || p.last_name}, {p.firstName || p.first_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="req-exam">Examination</label>
                <input
                  id="req-exam"
                  type="text"
                  value={form.examination}
                  onChange={(e) => setForm({ ...form, examination: e.target.value })}
                  placeholder="e.g. Chest PA, Right Knee AP/Lateral"
                  required
                />
              </div>

              <div className="form-grid">
                <div className="field">
                  <label htmlFor="req-modality">Modality</label>
                  <select
                    id="req-modality"
                    value={form.modality}
                    onChange={(e) => setForm({ ...form, modality: e.target.value })}
                  >
                    <option value="DX">DX (Digital Radiography / X-Ray)</option>
                    <option value="MR">MR (MRI)</option>
                    <option value="CT">CT (Computed Tomography)</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="req-priority">Priority</label>
                  <select
                    id="req-priority"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  >
                    <option value="routine">Routine</option>
                    <option value="stat">STAT</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label htmlFor="req-notes">Clinical Notes / Indication</label>
                <textarea
                  id="req-notes"
                  rows="3"
                  value={form.clinicalIndication}
                  onChange={(e) => setForm({ ...form, clinicalIndication: e.target.value })}
                  placeholder="Enter clinical indication, symptoms, or positioning instructions..."
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowModal(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Imaging Request'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}