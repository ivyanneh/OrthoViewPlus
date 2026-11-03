import { useEffect, useMemo, useState } from 'react';
import api from '../../api/client.js';
import EmptyState from '../../components/EmptyState.jsx';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import { formatDicomDate, formatValue, getApiError } from '../../utils/format.js';

export default function ImagingStudyManagement() {
  const [studies, setStudies] = useState([]);
  const [patients, setPatients] = useState([]);
  const [requests, setRequests] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [selectedStudyId, setSelectedStudyId] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [examination, setExamination] = useState('');
  const [modality, setModality] = useState('');
  const [priority, setPriority] = useState('routine');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setError('');
    try {
      const [studyResponse, patientResponse, requestResponse, mappingResponse] = await Promise.all([
        api.get('/imaging/studies', { params: { limit: 200 } }),
        api.get('/admin/patients', { params: { status: 'active', limit: 200 } }),
        api.get('/clinical/requests', { params: { limit: 500 } }),
        api.get('/admin/patient-mappings'),
      ]);
      setStudies(studyResponse.data.studies || []);
      setPatients(patientResponse.data.patients || []);
      setRequests(requestResponse.data.requests || []);
      setMappings(mappingResponse.data.mappings || []);
    } catch (requestError) {
      setError(getApiError(requestError, 'Unable to load Orthanc study links.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const selectedStudy = studies.find((study) => study.id === selectedStudyId);
  const selectedMapping = selectedStudy
    ? mappings.find((mapping) => mapping.orthancPatientId?.toLowerCase() === selectedStudy.patientId?.toLowerCase())
    : null;
  const eligibleRequests = useMemo(
    () => requests.filter((request) =>
      Number(request.patientId) === Number(selectedMapping?.patientId) &&
      request.status !== 'cancelled',
    ),
    [requests, selectedMapping],
  );

  async function createMapping(event) {
    event.preventDefault();
    if (!selectedStudy || !selectedPatientId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.post('/admin/patient-mappings', {
        patientId: Number(selectedPatientId),
        orthancPatientId: selectedStudy.patientId,
        patientName: selectedStudy.patientName,
      });
      setNotice('Pending DICOM patient mapping created. Verify the identity before linking a study.');
      await load();
    } catch (requestError) {
      setError(getApiError(requestError, 'Unable to create the patient mapping.'));
    } finally {
      setSaving(false);
    }
  }

  async function verifyMapping(mappingId) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.post(`/admin/patient-mappings/${mappingId}/verify`);
      setNotice('DICOM patient mapping verified.');
      await load();
    } catch (requestError) {
      setError(getApiError(requestError, 'Unable to verify the patient mapping.'));
    } finally {
      setSaving(false);
    }
  }

  async function linkStudy(event) {
    event.preventDefault();
    if (!selectedStudy || !selectedMapping || selectedMapping.status !== 'verified' || !selectedRequestId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.post(`/imaging/studies/${encodeURIComponent(selectedStudy.id)}/link`, {
        requestId: Number(selectedRequestId),
      });
      setNotice('Orthanc study linked to the selected imaging request.');
      await load();
    } catch (requestError) {
      setError(getApiError(requestError, 'Unable to link the Orthanc study.'));
    } finally {
      setSaving(false);
    }
  }

  async function createRequest(event) {
    event.preventDefault();
    if (!selectedMapping || selectedMapping.status !== 'verified' || !examination.trim() || !modality.trim()) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.post('/clinical/requests', {
        patientId: Number(selectedMapping.patientId),
        examination: examination.trim(),
        modality: modality.trim(),
        priority,
      });
      setSelectedRequestId(String(data.request.id));
      setExamination('');
      setModality(selectedStudy?.modalitiesInStudy || '');
      setPriority('routine');
      setNotice(`Imaging request ${data.request.id} created for the verified patient. Confirm it is the correct request before linking.`);
      await load();
    } catch (requestError) {
      setError(getApiError(requestError, 'Unable to create the imaging request.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState message="Loading Orthanc studies..." />;

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="kicker">Orthanc archive</p>
          <h2>Study identity and request linking</h2>
          <p>Verify each DICOM PatientID mapping, then explicitly link the study to its imaging request.</p>
        </div>
        <button type="button" className="secondary-button" onClick={load}>Refresh archive</button>
      </div>
      {error ? <ErrorMessage message={error} /> : null}
      {notice ? <p className="success-message" role="status">{notice}</p> : null}

      <div className="panel">
        <div className="panel-header"><h3>Studies available in Orthanc</h3></div>
        {studies.length === 0 ? (
          <EmptyState title="No studies returned" message="Check Orthanc connectivity and archive contents, then refresh." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Study date</th><th>Modality</th><th>Description</th><th>DICOM PatientID</th><th>DICOM patient name</th><th>Link status</th><th>Action</th></tr>
              </thead>
              <tbody>
                {studies.map((study) => {
                  const mapping = mappings.find((item) => item.orthancPatientId?.toLowerCase() === study.patientId?.toLowerCase());
                  return (
                    <tr key={study.id}>
                      <td>{formatDicomDate(study.studyDate)}</td>
                      <td>{formatValue(study.modalitiesInStudy)}</td>
                      <td>{formatValue(study.studyDescription)}</td>
                      <td className="mono">{formatValue(study.patientId)}</td>
                      <td>{formatValue(study.patientName)}</td>
                      <td>{study.imagingRequestId ? `Request ${study.imagingRequestId} · ${study.studyStatus}` : mapping?.status || 'Unmapped'}</td>
                      <td>
                        <button type="button" className="secondary-button" onClick={() => {
                          setSelectedStudyId(study.id);
                          setSelectedPatientId(mapping?.patientId ? String(mapping.patientId) : '');
                          setSelectedRequestId(study.imagingRequestId ? String(study.imagingRequestId) : '');
                            setExamination('');
                            setModality(study.modalitiesInStudy || '');
                          }}>Manage</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {studies.length >= 200 ? <p className="muted">Showing the first 200 studies. Narrow the archive or increase the backend page size to inspect more.</p> : null}
      </div>

      {selectedStudy ? (
        <div className="panel">
          <div className="panel-header"><h3>Link selected study</h3></div>
          <p>{formatValue(selectedStudy.studyDescription)} · {formatDicomDate(selectedStudy.studyDate)} · PatientID <span className="mono">{formatValue(selectedStudy.patientId)}</span></p>

          {!selectedMapping ? (
            <form onSubmit={createMapping}>
              <div className="field">
                <label htmlFor="dicom-patient-map">Match DICOM PatientID to a patient record</label>
                <select id="dicom-patient-map" value={selectedPatientId} onChange={(event) => setSelectedPatientId(event.target.value)} required>
                  <option value="">Select a patient</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>{patient.mrn} · {patient.lastName}, {patient.firstName}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="primary-button" disabled={saving || !selectedStudy.patientId}>
                {saving ? 'Saving...' : 'Create pending mapping'}
              </button>
            </form>
          ) : selectedMapping.status === 'pending' ? (
            <div>
              <p>Patient mapping: {selectedMapping.status} · {selectedMapping.mrn} · {selectedMapping.lastName}, {selectedMapping.firstName}</p>
              <button type="button" className="primary-button" onClick={() => verifyMapping(selectedMapping.id)} disabled={saving}>
                Verify patient identity
              </button>
              <button type="button" className="secondary-button" onClick={() => {
                setSelectedPatientId('');
                setSelectedStudyId('');
              }} disabled={saving}>
                Cancel selection
              </button>
            </div>
          ) : selectedMapping.status !== 'verified' ? (
            <div>
              <p>Existing mapping status: {selectedMapping.status}. It cannot be used to link or access the study.</p>
              <p>Create a new pending mapping only after confirming the correct patient record.</p>
            </div>
          ) : (
            <>
              <p>Verified patient: {selectedMapping.mrn} · {selectedMapping.lastName}, {selectedMapping.firstName}</p>
              {eligibleRequests.length > 0 ? (
                <form onSubmit={linkStudy}>
                  <div className="field">
                    <label htmlFor="imaging-request-link">Exact imaging request for this study</label>
                    <select id="imaging-request-link" value={selectedRequestId} onChange={(event) => setSelectedRequestId(event.target.value)} required>
                      <option value="">Select a matching-patient request</option>
                      {eligibleRequests.map((request) => (
                        <option key={request.id} value={request.id}>
                          #{request.id} · {request.examination} ({request.modality}) · {request.status}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className="primary-button" disabled={saving || !selectedRequestId}>
                    {saving ? 'Linking...' : 'Link study to request'}
                  </button>
                </form>
              ) : (
                <div>
                  <p className="muted">No non-cancelled imaging request exists for this verified patient. Create one for this patient using the existing request workflow.</p>
                  <form onSubmit={createRequest}>
                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor="request-examination">Examination</label>
                        <input id="request-examination" value={examination} onChange={(event) => setExamination(event.target.value)} required />
                      </div>
                      <div className="field">
                        <label htmlFor="request-modality">Modality</label>
                        <input id="request-modality" value={modality} onChange={(event) => setModality(event.target.value)} required />
                      </div>
                      <div className="field">
                        <label htmlFor="request-priority">Priority</label>
                        <select id="request-priority" value={priority} onChange={(event) => setPriority(event.target.value)}>
                          <option value="routine">Routine</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </div>
                    </div>
                    <button type="submit" className="secondary-button" disabled={saving || !examination.trim() || !modality.trim()}>
                      {saving ? 'Creating...' : 'Create request for verified patient'}
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
