import { useEffect, useState } from 'react';
import api from '../api/client.js';

import { DashboardIcon, CalendarIcon, AlertIcon, CheckIcon } from '../components/Icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function PractitionerDashboard() {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [appointmentsToday, setAppointmentsToday] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [reportsReady, setReportsReady] = useState([]);
  const [statNotifications, setStatNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadDashboard() {
      setError('');
      try {
        const [appResponse, reqResponse, reportResponse, statResponse] = await Promise.all([
          api.get('/clinical/appointments', { params: { date: new Date().toISOString().slice(0, 10), limit: 20 } }),
          api.get('/clinical/requests', { params: { limit: 50 } }),
          api.get('/clinical/reports', { params: { status: 'ready', limit: 20 } }),
          api.get('/clinical/notifications', { params: { priority: 'STAT', limit: 20 } }),
        ]);
        setName(user?.fullName || user?.username || 'Dr. Practitioner');
        setAppointmentsToday(appResponse.data.appointments || []);
        setPendingRequests(reqResponse.data.requests || []);
        setReportsReady(reportResponse.data.reports || []);
        setStatNotifications(statResponse.data.notifications || []);
      } catch (err) {
        setError('Unable to load dashboard data.');
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, [user?.id]);

  return (
    <section className="page">
      {loading ? <p>Loading dashboard...</p> : null}
      {error ? <p className="error">Error: {error}</p> : null}
      <div className="page-header">
        <div className="welcome-banner">
          <h1>Welcome, {name}</h1>
          <h2>Attending Physician - Department of Orthopedics</h2>
        </div>
        <nav className="quick-nav">
          <a href="/practitioner/scans" className="quick-link">Patient Records</a>
        </nav>
      </div>

      <div className="metric-cards">
        <div className="metric-card">
          <div className="metric-icon"><DashboardIcon size={24} /></div>
          <div className="metric-info">
            <div className="metric-title">Today's Appointments</div>
            <div className="metric-count">{appointmentsToday.length}</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon"><CalendarIcon size={24} /></div>
          <div className="metric-info">
            <div className="metric-title">Pending Requests</div>
            <div className="metric-count">{pendingRequests.length}</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon"><AlertIcon size={24} /></div>
          <div className="metric-info">
            <div className="metric-title">Reports Ready to View</div>
            <div className="metric-count">{reportsReady.length}</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon"><CheckIcon size={24} /></div>
          <div className="metric-info">
            <div className="metric-title">STAT Notifications</div>
            <div className="metric-count">{statNotifications.length}</div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="grid-left">
          <h3>Scheduled Imaging Examinations</h3>
          {appointmentsToday.length > 0 ? (
            <ul>
              {appointmentsToday.map((appt) => (
                <li key={appt.id}>
                  <span>{appt.time} Â· {appt.patientName}</span>
                  <span className="badge">{appt.status}</span>
                  <button>View Scan</button>
                </li>
              ))}
            </ul>
          ) : (
            <p>No scheduled examinations</p>
          )}
        </div>
        <div className="grid-right">
          <h3>Recent Activity Feed</h3>
          {statNotifications.length > 0 ? (
            <ul>
              {statNotifications.map((notif) => (
                <li key={notif.id} className="stat-alert">
                  <span className="badge stat-badge">STAT</span>
                  {notif.message}
                </li>
              ))}
            </ul>
          ) : (
            <p>No STAT alerts</p>
          )}
          {reportsReady.length > 0 ? (
            <ul>
              {reportsReady.map((report) => (
                <li key={report.id}>
                  <span>{report.mrn} Â· {report.studyType}</span>
                  <button>View Report</button>
                </li>
              ))}
            </ul>
          ) : (
            <p>No reports ready</p>
          )}
        </div>
      </div>
    </section>
  );
}
