import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';


export default function PractitionerRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadRequests() {
      setError('');
      setLoading(true);
      try {
        const response = await api.get('/clinical/requests', { params: { limit: 100 } });
        setRequests(response.data.requests || []);
      } catch (err) {
        setError('Unable to load requests.');
      } finally {
        setLoading(false);
      }
    }
    loadRequests();
  }, [user?.id]);

  const filteredRequests = requests.filter(r => {
    if (filter === 'All') return true;
    if (filter === 'Pending') return r.status === 'pending' || r.status === 'pending_approval';
    if (filter === 'Approved') return r.status === 'approved';
    if (filter === 'Scheduled') return r.status === 'scheduled';
    if (filter === 'Completed') return r.status === 'completed';
    return true;
  });

  const statusOptions = ['All', 'Pending', 'Approved', 'Scheduled', 'Completed'];

  return (
    <section className="page">
      <div className="page-header">
        <h1>Imaging Schedule & Requests</h1>
        <div className="filter-bar">
          {statusOptions.map(opt => (
            <button key={opt} type="button" className={filter === opt ? 'primary-button' : 'secondary-button'}
              style={{marginRight: '0.5rem', padding: '0.5rem 1rem'}}
              onClick={() => setFilter(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="error">Error: {error}</p> : null}

      <div className="worklist-table">
        <table>
          <thead>
            <tr>
              <th>Request ID</th>
              <th>Patient Name</th>
              <th>Modality/Exam</th>
              <th>Priority</th>
              <th>Request Date</th>
              <th>Indication</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredRequests.length > 0 ? (
              filteredRequests.map((req, i) => (
                <tr key={req.id}>
                  <td>{req.id}</td>
                  <td>{req.patientName}</td>
                  <td>{req.examination} ({req.modality})</td>
                  <td><StatusBadge tone="info">{req.priority}</StatusBadge></td>
                  <td>{req.requestDate}</td>
                  <td>{req.clinicalIndication || '—'}</td>
                  <td><StatusBadge tone="ok">{req.status}</StatusBadge></td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7">No requests found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button onClick={() => alert('Open New Imaging Request Modal')} className="primary-button" style={{marginTop: '1rem'}}>
        + Schedule New Imaging
      </button>
    </section>
  );
}
