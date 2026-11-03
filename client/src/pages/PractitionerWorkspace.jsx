import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../api/client.js';
import EmptyState from '../components/EmptyState.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDateTime, formatDicomDate, formatValue, getApiError } from '../utils/format.js';

const EMPTY_PATIENT = {
  mrn: '',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  sex: '',
  notes: '',
};
const EMPTY_REQUEST = { examination: '', modality: 'CT', priority: 'routine', clinicalIndication: '' };
const EMPTY_APPOINTMENT = { date: '', time: '', examination: '', modality: 'CT', assignedUserId: '', notes: '' };

export default function PractitionerWorkspace() {
  const { user } = useAuth();
  const [patients, setPatients] = useState([]);
  const [requests, setRequests] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [practitioners, setPractitioners] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [history, setHistory] = useState(null);
  const [query, setQuery] = useState('');
  const [patientForm, setPatientForm] = useState(EMPTY_PATIENT);
  const [requestForm, setRequestForm] = useState(EMPTY_REQUEST);
  const [appointmentForm, setAppointmentForm] = useState(EMPTY_APPOINTMENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadWorkspace(search = query) {
    setError('');
    try {
      const [patientResponse, requestResponse, appointmentResponse, staffResponse] = await Promise.all([
        api.get('/clinical/patients', { params: { q: search, limit: 200 } }),
        api.get('/clinical/requests', { params: { limit: 200 } }),
        api.get('/clinical/appointments', { params: { limit: 200 } }),
        api.get('/clinical/staff'),
      ]);
      setPatients(patientResponse.data.patients || []);
      setRequests(requestResponse.data.requests || []);
      setAppointments(appointmentResponse.data.appointments || []);
      setPractitioners(staffResponse.data.practitioners || []);
    } catch (requestError) {
      setError(getApiError(requestError, 'Unable to load your clinical workspace.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.role === 'practitioner') loadWorkspace('');
  }, [user?.role]);

  async function openPatient(patient) {
    setSelectedPatient(patient);
    setHistory(null);
    setError('');
    try {
      const response = await api.get(`/clinical/patients/${patient.id}`);
      setHistory(response.data);
    } catch (requestError) {
      setError(getApiError(requestError, 'Unable to load this patient record.'));
    }
  }

  async function registerPatient(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post('/clinical/patients', {
        ...patientForm,
        dateOfBirth: patientForm.dateOfBirth || null,
        sex: patientForm.sex || null,
      });
      setPatientForm(EMPTY_PATIENT);
      setQuery(response.data.patient.mrn);
      await loadWorkspace(response.data.patient.mrn);
      await openPatient(response.data.patient);
      setNotice('Patient record registered.');
    } catch (requestError) {
      setError(getApiError(requestError, 'Unable to register this patient.'));
    } finally {
      setSaving(false);
    }
  }

  async function submitRequest(event) {
    event.preventDefault();
    if (!selectedPatient) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post('/clinical/requests', {
        ...requestForm,
        patientId: selectedPatient.id,
      });
      setRequestForm(EMPTY_REQUEST);
      setNotice(`Imaging request ${response.data.request.id} submitted.`);
      await loadWorkspace();
      await openPatient(selectedPatient);
    } catch (requestError) {
      setError(getApiError(requestError, 'Unable to submit the imaging request.'));
    } finally {
      setSaving(false);
    }
  }

  async function scheduleAppointment(event) {
    event.preventDefault();
    if (!selectedPatient) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post('/clinical/appointments', {
        ...appointmentForm,
        patientId: selectedPatient.id,
        assignedUserId: appointmentForm.assignedUserId || null,
      });
      setAppointmentForm(EMPTY_APPOINTMENT);
      setNotice(`Appointment ${response.data.appointment.id} scheduled.`);
      await loadWorkspace();
      await openPatient(selectedPatient);
    } catch (requestError) {
      setError(getApiError(requestError, 'Unable to schedule the appointment.'));
    } finally {
      setSaving(false);
    }
  }

  if (user?.role !== 'practitioner') {
    return <Navigate to={user?.role === 'administrator' ? '/admin/dashboard' : '/radiologist/dashboard'} replace />;
  }
  if (loading) return <LoadingState message="Loading patient and imaging workflows..." />;

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="kicker">Clinical workspace</p>
          <h2>Patients, requests and appointments</h2>
          <p>Access patient records through your clinical workflow, submit imaging requests and schedule examinations.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => loadWorkspace()}>Refresh</button>
      </div>
      {error ? <ErrorMessage message={error} /> : null}
      {notice ? <p className="success-message" role="status">{notice}</p> : null}

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h3>Find a patient</h3></div>
          <form onSubmit={(event) => { event.preventDefault(); loadWorkspace(); }}>
            <div className="field">
              <label htmlFor="clinical-patient-search">Patient ID or name</label>
              <input id="clinical-patient-search" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <button type="submit" className="secondary-button">Search</button>
          </form>
          {patients.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Patient ID</th><th>Name</th><th>Action</th></tr></thead>
                <tbody>{patients.map((patient) => (
                  <tr key={patient.id}>
                    <td>{patient.mrn}</td>
                    <td>{patient.lastName}, {patient.firstName}</td>
                    <td><button type="button" className="secondary-button" onClick={() => openPatient(patient)}>Open</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <EmptyState compact title="No patients found" message="Search patients in your clinical workflow or register a new record." />}
        </section>

        <section className="panel">
          <div className="panel-header"><h3>Register a patient</h3></div>
          <form onSubmit={registerPatient}>
            <div className="form-grid">
              <div className="field"><label htmlFor="new-patient-mrn">Patient ID</label><input id="new-patient-mrn" required maxLength={40} value={patientForm.mrn} onChange={(event) => setPatientForm({ ...patientForm, mrn: event.target.value })} /></div>
              <div className="field"><label htmlFor="new-patient-first-name">First name</label><input id="new-patient-first-name" required maxLength={80} value={patientForm.firstName} onChange={(event) => setPatientForm({ ...patientForm, firstName: event.target.value })} /></div>
              <div className="field"><label htmlFor="new-patient-last-name">Last name</label><input id="new-patient-last-name" required maxLength={80} value={patientForm.lastName} onChange={(event) => setPatientForm({ ...patientForm, lastName: event.target.value })} /></div>
              <div className="field"><label htmlFor="new-patient-dob">Date of birth (optional)</label><input id="new-patient-dob" type="date" value={patientForm.dateOfBirth} onChange={(event) => setPatientForm({ ...patientForm, dateOfBirth: event.target.value })} /></div>
              <div className="field"><label htmlFor="new-patient-sex">Sex (optional)</label><input id="new-patient-sex" maxLength={20} value={patientForm.sex} onChange={(event) => setPatientForm({ ...patientForm, sex: event.target.value })} /></div>
              <div className="field span-2"><label htmlFor="new-patient-notes">Notes (optional)</label><textarea id="new-patient-notes" rows={2} maxLength={500} value={patientForm.notes} onChange={(event) => setPatientForm({ ...patientForm, notes: event.target.value })} /></div>
            </div>
            <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving...' : 'Register patient'}</button>
          </form>
        </section>
      </div>

      {selectedPatient ? (
        <>
          <section className="panel">
            <div className="panel-header"><h3>Patient record</h3><span>{selectedPatient.mrn} · {selectedPatient.lastName}, {selectedPatient.firstName}</span></div>
            {history ? (
              <>
                <p>Date of birth: {formatValue(history.patient.dateOfBirth, 'Not recorded')} · Sex: {formatValue(history.patient.sex, 'Not recorded')}</p>
                <p>{formatValue(history.patient.notes, 'No additional notes.')}</p>
                <div className="dashboard-grid">
                  <div>
                    <h4>Imaging requests</h4>
                    {history.history.requests.length ? history.history.requests.map((request) => <p key={request.id}>#{request.id} · {request.examination} ({request.modality}) · {request.status}</p>) : <p className="muted">No requests in your workflow.</p>}
                  </div>
                  <div>
                    <h4>Appointments</h4>
                    {history.history.appointments.length ? history.history.appointments.map((appointment) => <p key={appointment.id}>{appointment.date} {appointment.time} · {appointment.examination} · {appointment.status}</p>) : <p className="muted">No appointments in your workflow.</p>}
                  </div>
                </div>
                <h4>Authorized studies and reports</h4>
                {history.history.studies.length ? (
                  <div className="table-wrap"><table className="data-table">
                    <thead><tr><th>Date</th><th>Modality</th><th>Description</th><th>Approved report</th></tr></thead>
                    <tbody>{history.history.studies.map((study) => {
                      const report = history.history.reports.find((item) => Number(item.imagingStudyId) === Number(study.id));
                      return <tr key={study.id}>
                        <td>{formatDicomDate(study.studyDate)}</td><td>{formatValue(study.modality)}</td><td>{formatValue(study.description)}</td>
                        <td>{report ? `${formatValue(report.impression || report.findings)} · ${formatDateTime(report.approvedAt)}` : 'No approved report'}</td>
                      </tr>;
                    })}</tbody>
                  </table></div>
                ) : <p className="muted">No authorized linked studies are available for this patient.</p>}
              </>
            ) : <LoadingState message="Loading patient history..." />}
          </section>

          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-header"><h3>Submit imaging request</h3></div>
              <form onSubmit={submitRequest}>
                <div className="form-grid">
                  <div className="field"><label htmlFor="request-examination">Examination</label><input id="request-examination" required maxLength={120} value={requestForm.examination} onChange={(event) => setRequestForm({ ...requestForm, examination: event.target.value })} /></div>
                  <div className="field"><label htmlFor="request-modality">Modality</label><select id="request-modality" value={requestForm.modality} onChange={(event) => setRequestForm({ ...requestForm, modality: event.target.value })}><option value="CT">CT</option><option value="MR">MRI</option><option value="XR">X-Ray</option><option value="US">Ultrasound</option></select></div>
                  <div className="field"><label htmlFor="request-priority">Priority</label><select id="request-priority" value={requestForm.priority} onChange={(event) => setRequestForm({ ...requestForm, priority: event.target.value })}><option value="routine">Routine</option><option value="urgent">Urgent</option></select></div>
                  <div className="field span-2"><label htmlFor="request-indication">Clinical indication (optional)</label><textarea id="request-indication" maxLength={500} rows={2} value={requestForm.clinicalIndication} onChange={(event) => setRequestForm({ ...requestForm, clinicalIndication: event.target.value })} /></div>
                </div>
                <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Submitting...' : 'Submit request'}</button>
              </form>
            </section>

            <section className="panel">
              <div className="panel-header"><h3>Schedule appointment</h3></div>
              <form onSubmit={scheduleAppointment}>
                <div className="form-grid">
                  <div className="field"><label htmlFor="appointment-date">Date</label><input id="appointment-date" type="date" required value={appointmentForm.date} onChange={(event) => setAppointmentForm({ ...appointmentForm, date: event.target.value })} /></div>
                  <div className="field"><label htmlFor="appointment-time">Time</label><input id="appointment-time" type="time" required value={appointmentForm.time} onChange={(event) => setAppointmentForm({ ...appointmentForm, time: event.target.value })} /></div>
                  <div className="field"><label htmlFor="appointment-examination">Examination</label><input id="appointment-examination" required maxLength={120} value={appointmentForm.examination} onChange={(event) => setAppointmentForm({ ...appointmentForm, examination: event.target.value })} /></div>
                  <div className="field"><label htmlFor="appointment-modality">Modality</label><select id="appointment-modality" value={appointmentForm.modality} onChange={(event) => setAppointmentForm({ ...appointmentForm, modality: event.target.value })}><option value="CT">CT</option><option value="MR">MRI</option><option value="XR">X-Ray</option><option value="US">Ultrasound</option></select></div>
                  <div className="field"><label htmlFor="appointment-practitioner">Assigned practitioner (optional)</label><select id="appointment-practitioner" value={appointmentForm.assignedUserId} onChange={(event) => setAppointmentForm({ ...appointmentForm, assignedUserId: event.target.value })}><option value="">Unassigned</option>{practitioners.map((practitioner) => <option key={practitioner.id} value={practitioner.id}>{practitioner.fullName || practitioner.username}</option>)}</select></div>
                </div>
                <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Scheduling...' : 'Schedule appointment'}</button>
              </form>
            </section>
          </div>

          <section className="panel">
            <div className="panel-header"><h3>Your requests and appointments</h3></div>
            <div className="dashboard-grid">
              <div><h4>Requests</h4>{requests.filter((request) => Number(request.patientId) === Number(selectedPatient.id)).map((request) => <p key={request.id}>#{request.id} · {request.examination} ({request.modality}) · {request.status}</p>)}</div>
              <div><h4>Appointments</h4>{appointments.filter((appointment) => Number(appointment.patientId) === Number(selectedPatient.id)).map((appointment) => <p key={appointment.id}>{appointment.date} {appointment.time} · {appointment.examination} · {appointment.status}</p>)}</div>
            </div>
          </section>
        </>
      ) : <EmptyState title="Select a patient" message="Choose a patient from your permitted workflow, or register a patient to continue." />}
    </section>
  );
}
