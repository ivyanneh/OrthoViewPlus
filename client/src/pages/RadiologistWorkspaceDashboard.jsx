import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/client.js';
import EmptyState from '../components/EmptyState.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import { getApiError } from '../utils/format.js';

export default function RadiologistWorkspaceDashboard() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState({
    scheduledToday: 0,
    awaitingReview: 0,
    pendingRequests: 0,
    completedToday: 0,
  });
  const [schedule, setSchedule] = useState([]);
  const [filteredSchedule, setFilteredSchedule] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // State for Add Event Modal
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [newEvent, setNewEvent] = useState({
    time: '09:00 AM',
    patient: '',
    examination: '',
    modality: 'DX',
  });

  useEffect(() => {
    loadDashboardData();
  }, [selectedDate]);

  async function loadDashboardData() {
    setError('');
    setLoading(true);
    try {
      const [metricsResult, scheduleResult] = await Promise.allSettled([
        api.get('/clinical/requests', { params: { assignedRadiologistId: user?.id } }),
        api.get('/clinical/appointments', { params: { assignedUserId: user?.id, dateFrom: selectedDate, dateTo: selectedDate } }),
      ]);

      if (metricsResult.status === 'fulfilled') {
        const requests = metricsResult.value.data.requests || [];
        const today = new Date().toISOString().split('T')[0];
        setMetrics({
          scheduledToday: requests.filter(r => r.status === 'scheduled').length,
          awaitingReview: requests.filter(r => r.status === 'in_progress').length,
          pendingRequests: requests.filter(r => r.status === 'submitted').length,
          completedToday: requests.filter(r => r.status === 'completed' && r.updated_at?.startsWith(today)).length,
        });
      } else {
        setError(getApiError(metricsResult.reason, 'Unable to load workload metrics.'));
      }

      if (scheduleResult.status === 'fulfilled') {
        const appts = scheduleResult.value.data.appointments || [];
        setSchedule(appts);
        setFilteredSchedule(appts);
      } else {
        setError((current) => current || getApiError(scheduleResult.reason, 'Unable to load examination schedule.'));
      }
    } catch (err) {
      setError(getApiError(err, 'Unable to load dashboard data.'));
    } finally {
      setLoading(false);
    }
  }

  function handleDateFilter(type) {
    const today = new Date();
    let newDate;
    
    if (type === 'today') {
      newDate = today;
    } else if (type === 'tomorrow') {
      newDate = new Date(today);
      newDate.setDate(today.getDate() + 1);
    } else if (type === 'upcoming') {
      newDate = new Date(today);
      newDate.setDate(today.getDate() + 7);
    }
    
    setSelectedDate(newDate.toISOString().split('T')[0]);
  }

  function handleCreateEvent(e) {
    e.preventDefault();
    const created = {
      id: `evt-${Date.now()}`,
      scheduled_time: newEvent.time,
      patient_id: newEvent.patient || '99',
      examination: newEvent.examination || 'Routine Scan',
      modality: newEvent.modality,
      status: 'scheduled',
    };

    setFilteredSchedule((prev) => [created, ...prev]);
    setSchedule((prev) => [created, ...prev]);
    setMetrics((prev) => ({ ...prev, scheduledToday: prev.scheduledToday + 1 }));
    setShowAddEventModal(false);
    setNewEvent({ time: '09:00 AM', patient: '', examination: '', modality: 'DX' });
  }

  if (loading) return <LoadingState message="Loading dashboard..." />;

  return (
    <section className="page">
      <div className="panel">
        <div className="panel-header">
          <h3>Welcome, {user?.fullName || user?.username}</h3>
        </div>
        <div className="panel-body">
          <div className="detail-grid">
            <div>
              <dt>Radiologist ID</dt>
              <dd>{user?.id || 'N/A'}</dd>
            </div>
            <div>
              <dt>Shift</dt>
              <dd>Day Shift</dd>
            </div>
          </div>
        </div>
      </div>

      <div className="card-grid">
        <div className="stat-card">
          <div className="stat-card-top">
            <h3>Scheduled Today</h3>
          </div>
          <div className="value">{metrics.scheduledToday}</div>
          <div className="hint">Examinations scheduled for today</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-top">
            <h3>Awaiting Review</h3>
          </div>
          <div className="value">{metrics.awaitingReview}</div>
          <div className="hint">In-progress examinations</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-top">
            <h3>Pending Requests</h3>
          </div>
          <div className="value">{metrics.pendingRequests}</div>
          <div className="hint">Submitted requests awaiting assignment</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-top">
            <h3>Completed Today</h3>
          </div>
          <div className="value">{metrics.completedToday}</div>
          <div className="hint">Examinations completed today</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>Examination Schedule</h3>
        </div>
        <div className="filter-bar">
          <div className="field inline-field">
            <label htmlFor="date-picker">Date</label>
            <input
              id="date-picker"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <button type="button" className="secondary-button" onClick={() => handleDateFilter('today')}>
            Today
          </button>
          <button type="button" className="secondary-button" onClick={() => handleDateFilter('tomorrow')}>
            Tomorrow
          </button>
          <button type="button" className="secondary-button" onClick={() => handleDateFilter('upcoming')}>
            Upcoming
          </button>
          <button type="button" className="primary-button" onClick={() => setShowAddEventModal(true)}>
            + Add Event
          </button>
        </div>
        {error ? <ErrorMessage message={error} /> : null}
        {filteredSchedule.length === 0 ? (
          <EmptyState
            title="No scheduled examinations"
            message="No examinations are scheduled for the selected date."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Patient</th>
                  <th>Study Type</th>
                  <th>Modality</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredSchedule.map((appointment) => (
                  <tr key={appointment.id}>
                    <td>{appointment.scheduled_time}</td>
                    <td>Patient #{appointment.patient_id}</td>
                    <td>{appointment.examination}</td>
                    <td>{appointment.modality}</td>
                    <td>{appointment.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Event Modal */}
      {showAddEventModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="panel" style={{ width: '450px', maxWidth: '90%', background: 'var(--bg-panel, #fff)', padding: '1.5rem', borderRadius: '8px' }}>
            <div className="panel-header" style={{ marginBottom: '1rem' }}>
              <h3>Schedule Radiology Event</h3>
            </div>
            <form onSubmit={handleCreateEvent}>
              <div className="field" style={{ marginBottom: '1rem' }}>
                <label>Time</label>
                <input
                  type="text"
                  value={newEvent.time}
                  onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                  placeholder="e.g. 10:30 AM"
                  required
                />
              </div>
              <div className="field" style={{ marginBottom: '1rem' }}>
                <label>Patient ID / Name</label>
                <input
                  type="text"
                  value={newEvent.patient}
                  onChange={(e) => setNewEvent({ ...newEvent, patient: e.target.value })}
                  placeholder="e.g. 102 (Brian Mwangi)"
                  required
                />
              </div>
              <div className="field" style={{ marginBottom: '1rem' }}>
                <label>Examination / Body Part</label>
                <input
                  type="text"
                  value={newEvent.examination}
                  onChange={(e) => setNewEvent({ ...newEvent, examination: e.target.value })}
                  placeholder="e.g. Forearm X-Ray"
                  required
                />
              </div>
              <div className="field" style={{ marginBottom: '1.5rem' }}>
                <label>Modality</label>
                <select
                  value={newEvent.modality}
                  onChange={(e) => setNewEvent({ ...newEvent, modality: e.target.value })}
                >
                  <option value="DX">DX (Digital X-Ray)</option>
                  <option value="MR">MR (MRI)</option>
                  <option value="CT">CT (Computed Tomography)</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="secondary-button" onClick={() => setShowAddEventModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  Save Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}