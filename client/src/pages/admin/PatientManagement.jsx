import { useEffect, useState } from 'react';
import api from '../../api/client.js';
import EmptyState from '../../components/EmptyState.jsx';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import { formatDateTime, formatValue, getApiError } from '../../utils/format.js';

const EMPTY_FORM = {
  mrn: '',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  sex: '',
  notes: '',
};

function patientForm(patient) {
  return {
    mrn: patient?.mrn ?? '',
    firstName: patient?.firstName ?? '',
    lastName: patient?.lastName ?? '',
    dateOfBirth: patient?.dateOfBirth ?? '',
    sex: patient?.sex ?? '',
    notes: patient?.notes ?? '',
  };
}

export default function PatientManagement() {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadPatients(search = appliedQuery) {
    setError('');
    try {
      const { data } = await api.get('/admin/patients', {
        params: { q: search, status: 'all', limit: 200 },
      });
      setPatients(data.patients || []);
    } catch (requestError) {
      setError(getApiError(requestError, 'Unable to load patient records.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPatients('');
  }, []);

  async function viewPatient(id) {
    setError('');
    setNotice('');
    try {
      const { data } = await api.get(`/admin/patients/${id}`);
      setSelectedPatient(data.patient);
      setFormOpen(false);
    } catch (requestError) {
      setError(getApiError(requestError, 'Unable to load patient details.'));
    }
  }

  function startCreate(initialForm = EMPTY_FORM) {
    setSelectedPatient(null);
    setForm({ ...initialForm });
    setEditing(false);
    setFormOpen(true);
    setError('');
    setNotice('');
  }

  function startEdit() {
    setForm(patientForm(selectedPatient));
    setEditing(true);
    setFormOpen(true);
    setError('');
    setNotice('');
  }

  async function savePatient(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    const payload = {
      ...form,
      dateOfBirth: form.dateOfBirth || null,
      sex: form.sex || null,
    };
    try {
      const response = editing
        ? await api.patch(`/admin/patients/${selectedPatient.id}`, payload)
        : await api.post('/admin/patients', payload);
      const savedPatient = response.data.patient;
      setFormOpen(false);
      await loadPatients();
      await viewPatient(savedPatient.id);
      setNotice(editing ? 'Patient record updated.' : 'Patient registered.');
    } catch (requestError) {
      setError(getApiError(requestError, 'Unable to save the patient record.'));
    } finally {
      setSaving(false);
    }
  }

  async function setPatientStatus(patient, status) {
    setError('');
    setNotice('');
    try {
      const { data } = await api.patch(`/admin/patients/${patient.id}/status`, { status });
      setSelectedPatient(data.patient);
      await loadPatients();
      setNotice(status === 'archived' ? 'Patient record archived.' : 'Patient record activated.');
    } catch (requestError) {
      setError(getApiError(requestError, 'Unable to update patient status.'));
    }
  }

  async function searchPatients(event) {
    event.preventDefault();
    setAppliedQuery(query.trim());
    await loadPatients(query.trim());
  }

  function updateForm(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  if (loading) return <LoadingState message="Loading patient records..." />;

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="kicker">Administration</p>
          <h2>Patient Management</h2>
          <p>Search, register, review, and manage patient records.</p>
        </div>
        <button type="button" className="primary-button" onClick={() => startCreate()}>
          Register patient
        </button>
      </div>

      {error ? <ErrorMessage message={error} /> : null}
      {notice ? <p className="success-message" role="status">{notice}</p> : null}

      <section className="panel">
        <div className="panel-header"><h3>Registered patients</h3></div>
        <form className="filter-bar" onSubmit={searchPatients}>
          <div className="field inline-field grow">
            <label htmlFor="patient-search">Search by internal ID, patient ID (MRN), or name</label>
            <input
              id="patient-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Enter an ID or name"
            />
          </div>
          <button type="submit" className="secondary-button">Search</button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setQuery('');
              setAppliedQuery('');
              loadPatients('');
            }}
          >
            Clear
          </button>
        </form>

        {patients.length === 0 ? (
          <EmptyState title="No patients found" message="Try a different search, or register a patient record." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Internal ID</th><th>Patient ID (MRN)</th><th>Name</th><th>Status</th><th>Action</th></tr>
              </thead>
              <tbody>
                {patients.map((patient) => (
                  <tr key={patient.id}>
                    <td>{patient.id}</td>
                    <td className="mono">{patient.mrn}</td>
                    <td>{patient.lastName}, {patient.firstName}</td>
                    <td>{patient.status === 'active' ? 'Active' : 'Archived'}</td>
                    <td>
                      <button type="button" className="secondary-button" onClick={() => viewPatient(patient.id)}>
                        View details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {formOpen ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h3>{editing ? `Edit patient ${selectedPatient?.mrn}` : 'Register patient'}</h3>
              <p>Unknown demographic details may be left blank.</p>
            </div>
            <button type="button" className="secondary-button" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </button>
          </div>
          <form onSubmit={savePatient} noValidate>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="patient-mrn">Patient ID (MRN)</label>
                <input id="patient-mrn" value={form.mrn} onChange={updateForm('mrn')} required disabled={editing} />
              </div>
              <div className="field">
                <label htmlFor="patient-first-name">First name</label>
                <input id="patient-first-name" value={form.firstName} onChange={updateForm('firstName')} required />
              </div>
              <div className="field">
                <label htmlFor="patient-last-name">Last name</label>
                <input id="patient-last-name" value={form.lastName} onChange={updateForm('lastName')} required />
              </div>
              <div className="field">
                <label htmlFor="patient-dob">Date of birth (optional)</label>
                <input id="patient-dob" type="date" value={form.dateOfBirth} onChange={updateForm('dateOfBirth')} />
              </div>
              <div className="field">
                <label htmlFor="patient-sex">Sex (optional)</label>
                <input id="patient-sex" value={form.sex} onChange={updateForm('sex')} />
              </div>
              <div className="field span-2">
                <label htmlFor="patient-notes">Notes (optional)</label>
                <textarea id="patient-notes" rows="3" value={form.notes} onChange={updateForm('notes')} />
              </div>
            </div>
            {!editing ? (
              <div className="panel-subheader">
                <p className="muted">For the Orthanc demonstration study, use this clearly labelled de-identified record. No date of birth or other unknown demographic data is supplied.</p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setForm({
                    mrn: 'DEMO-IVY-TEST-003',
                    firstName: 'Ivy',
                    lastName: 'Test',
                    dateOfBirth: '',
                    sex: '',
                    notes: 'De-identified demonstration record for the Orthanc study-linking workflow; not a real patient.',
                  })}
                >
                  Prefill Ivy Test demo record
                </button>
              </div>
            ) : null}
            <div className="modal-footer">
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Save changes' : 'Register patient'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {selectedPatient ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h3>Patient details</h3>
              <p>{selectedPatient.lastName}, {selectedPatient.firstName} · {selectedPatient.mrn}</p>
            </div>
            <div className="button-row">
              {selectedPatient.status === 'active' ? (
                <button type="button" className="secondary-button" onClick={startEdit}>Edit details</button>
              ) : null}
              <button
                type="button"
                className={selectedPatient.status === 'active' ? 'danger-button' : 'secondary-button'}
                onClick={() => setPatientStatus(selectedPatient, selectedPatient.status === 'active' ? 'archived' : 'active')}
              >
                {selectedPatient.status === 'active' ? 'Archive record' : 'Activate record'}
              </button>
            </div>
          </div>
          <dl className="detail-grid">
            <div><dt>Internal patient ID</dt><dd>{selectedPatient.id}</dd></div>
            <div><dt>Patient ID (MRN)</dt><dd>{selectedPatient.mrn}</dd></div>
            <div><dt>Date of birth</dt><dd>{formatValue(selectedPatient.dateOfBirth)}</dd></div>
            <div><dt>Sex</dt><dd>{formatValue(selectedPatient.sex)}</dd></div>
            <div><dt>Status</dt><dd>{selectedPatient.status === 'active' ? 'Active' : 'Archived'}</dd></div>
            <div><dt>Created by</dt><dd>{formatValue(selectedPatient.createdBy)}</dd></div>
            <div><dt>Created</dt><dd>{formatDateTime(selectedPatient.createdAt)}</dd></div>
            <div className="span-2"><dt>Notes</dt><dd>{formatValue(selectedPatient.notes)}</dd></div>
          </dl>
        </section>
      ) : null}
    </section>
  );
}
