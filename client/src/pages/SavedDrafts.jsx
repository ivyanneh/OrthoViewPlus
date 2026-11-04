import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/client.js';
import EmptyState from '../components/EmptyState.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import { getApiError } from '../utils/format.js';

export default function SavedDrafts() {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDrafts();
  }, []);

  async function loadDrafts() {
    setError('');
    setLoading(true);
    try {
      const response = await api.get('/clinical/reports', {
        params: {
          radiologistId: user?.id,
          status: 'draft',
        },
      });
      setDrafts(response.data.reports || []);
    } catch (err) {
      setError(getApiError(err, 'Unable to load saved drafts.'));
    } finally {
      setLoading(false);
    }
  }

  function resumeDraft(draft) {
    // Navigate to the appropriate workbench with the draft loaded
    // This would typically use React Router's navigate
    console.log('Resuming draft:', draft);
  }

  if (loading) return <LoadingState message="Loading saved drafts..." />;

  return (
    <section className="page">
      <div className="panel">
        <div className="panel-header">
          <h3>Saved Drafts</h3>
        </div>
        {error ? <ErrorMessage message={error} /> : null}
        {drafts.length === 0 ? (
          <EmptyState
            title="No saved drafts"
            message="You have no saved report drafts at this time."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Study</th>
                  <th>Capability</th>
                  <th>Last Saved</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((draft) => (
                  <tr key={draft.id}>
                    <td>Patient #{draft.patient_id}</td>
                    <td>Study #{draft.imaging_study_id}</td>
                    <td>Radiology Report</td>
                    <td>{new Date(draft.updated_at).toLocaleDateString()}</td>
                    <td>{draft.status}</td>
                    <td>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => resumeDraft(draft)}
                      >
                        Resume Editing
                      </button>
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
