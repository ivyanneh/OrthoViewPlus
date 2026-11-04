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
        setSchedule(scheduleResult.value.data.appointments || []);
        setFilteredSchedule(scheduleResult.value.data.appointments || []);
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
          <button type="button" className="primary-button">
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
    </section>
  );
}
