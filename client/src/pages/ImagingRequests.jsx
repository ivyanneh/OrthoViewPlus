import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/client.js';
import EmptyState from '../components/EmptyState.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import { getApiError } from '../utils/format.js';

export default function ImagingRequests() {
  const { user } = useAuth();
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
        params: {
          assignedRadiologistId: user?.id,
        },
      });
      setRequests(response.data.requests || []);
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
                    <td>{request.patient_first_name} {request.patient_last_name}</td>
                    <td>{request.patient_mrn || 'N/A'}</td>
                    <td>{request.examination}</td>
                    <td>{request.modality}</td>
                    <td>
                      <span className={`badge ${request.priority === 'urgent' ? 'badge-danger' : 'badge-neutral'}`}>
                        {request.priority}
                      </span>
                    </td>
                    <td>{new Date(request.created_at).toLocaleDateString()}</td>
                    <td>{request.status}</td>
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
                        <button type="button" className="secondary-button">
                          View
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
