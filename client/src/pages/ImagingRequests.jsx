import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/client.js';
import EmptyState from '../components/EmptyState.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import { getApiError } from '../utils/format.js';

export default function ImagingRequests() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    setError('');
    setLoading(true);
    try {
      const response = await api.get('/clinical/requests', {
        params: { assignedRadiologistId: user?.id },
      });
      const fetched = response.data?.requests || response.data || [];
      setRequests(Array.isArray(fetched) ? fetched : []);
    } catch (err) {
      setError(getApiError(err, 'Unable to load imaging requests.'));
    } finally {
      setLoading(false);
    }
  }

  async function claimRequest(requestId) {
    try {
      await api.post(`/clinical/requests/${requestId}/assign`);
      await loadRequests();
    } catch (err) {
      setError(getApiError(err, 'Unable to claim this request.'));
    }
  }

  async function handleOpenStudy(request) {
    // First, check if the request has a linked study
    try {
      // Load the patient's studies to find the linked one
      const patientId = request.patient_id || request.patientId;
      if (!patientId) {
        setError('Request does not have a valid patient ID.');
        return;
      }

      const historyResponse = await api.get(`/clinical/patients/${patientId}`, {
        params: { requestId: request.id }
      });
      const studies = historyResponse.data?.history?.studies || [];

      // Find the study linked to this request
      const linkedStudy = studies.find(
        s => s.imaging_request_id === request.id || s.imagingRequestId === request.id
      );

      if (!linkedStudy) {
        setError('No imaging study is linked to this request. Please contact an administrator to link a study.');
        return;
      }

      if (!linkedStudy.orthanc_study_id && !linkedStudy.orthancStudyId) {
        setError('The linked study does not have an Orthanc study ID. Please contact an administrator.');
        return;
      }

      // Navigate to Scans & Imaging with the study information
      navigate('/scans', {
        state: {
          preSelectedPatientId: patientId,
          preSelectedStudyId: linkedStudy.id,
          preSelectedRequestId: linkedStudy.imagingRequestId,
          preSelectedOrthancStudyId: linkedStudy.orthanc_study_id || linkedStudy.orthancStudyId
        }
      });
    } catch (err) {
      setError(getApiError(err, 'Unable to open the study. Please try again.'));
    }
  }

  function getPatientName(request) {
    const first = request.patient_first_name || request.firstName || request.patientName || '';
    const last = request.patient_last_name || request.lastName || '';
    const combined = `${first} ${last}`.trim();
    return combined || `Patient #${request.patient_mrn || request.mrn || request.id}`;
  }

  if (loading) return <LoadingState message="Loading imaging requests..." />;

  return (
    <section className="page">
      <div className="panel">
        <div className="panel-header">
          <h3>Imaging Requests</h3>
        </div>
        {error ? <ErrorMessage message={error} /> : null}
        {requests.length === 0 ? (
          <EmptyState
            title="No imaging requests"
            message="You have no assigned imaging requests at this time."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>MRN</th>
                  <th>Examination</th>
                  <th>Modality</th>
                  <th>Priority</th>
                  <th>Request Date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td>{getPatientName(request)}</td>
                    <td>{request.patient_mrn || request.mrn || 'N/A'}</td>
                    <td>{request.examination || 'Imaging Study'}</td>
                    <td>
                      <span className="badge badge-neutral">{request.modality || 'DX'}</span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          ['urgent', 'stat'].includes(String(request.priority).toLowerCase())
                            ? 'badge-danger'
                            : 'badge-neutral'
                        }`}
                      >
                        {request.priority || 'routine'}
                      </span>
                    </td>
                    <td>
                      {request.created_at
                        ? new Date(request.created_at).toLocaleDateString()
                        : new Date().toLocaleDateString()}
                    </td>
                    <td>
                      <span className="badge badge-ok">{request.status}</span>
                    </td>
                    <td>
                      {request.status === 'submitted' ? (
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => claimRequest(request.id)}
                        >
                          Claim
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => handleOpenStudy(request)}
                        >
                          Open Study
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}