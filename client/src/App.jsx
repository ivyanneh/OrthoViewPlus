import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ExposureIndex from './pages/ExposureIndex.jsx';
import CompareScans from './pages/CompareScans.jsx';
import AuditLog from './pages/AuditLog.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import UserManagement from './pages/admin/UserManagement.jsx';
import ImagingSchedule from './pages/admin/ImagingSchedule.jsx';
import Alerts from './pages/admin/Alerts.jsx';
import ModalityMonitoring from './pages/admin/ModalityMonitoring.jsx';
import SystemAdministration from './pages/admin/SystemAdministration.jsx';
import AdminProfile from './pages/admin/AdminProfile.jsx';
import AdminRoute from './components/AdminRoute.jsx';
import PractitionerRoute from './components/PractitionerRoute.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { homePathFor } from './utils/format.js';

function HomeRedirect() {
  const { isAuthenticated, ready, user } = useAuth();
  if (!ready) {
    return <div className="auth-loading">Loading OrthoView+...</div>;
  }
  return <Navigate to={isAuthenticated ? homePathFor(user?.role) : '/login'} replace />;
}

const practitionerPages = [
  ['/dashboard', <Dashboard />],
  ['/exposure-index', <ExposureIndex />],
  ['/compare-scans', <CompareScans />],
];

const adminPages = [
  ['/admin/dashboard', <AdminDashboard />],
  ['/admin/users', <UserManagement />],
  ['/admin/schedule', <ImagingSchedule />],
  ['/admin/alerts', <Alerts />],
  ['/admin/audit-logs', <AuditLog />],
  ['/admin/modalities', <ModalityMonitoring />],
  ['/admin/system', <SystemAdministration />],
  ['/admin/profile', <AdminProfile />],
];

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        {practitionerPages.map(([path, element]) => (
          <Route key={path} path={path} element={<PractitionerRoute>{element}</PractitionerRoute>} />
        ))}
        {adminPages.map(([path, element]) => (
          <Route key={path} path={path} element={<AdminRoute>{element}</AdminRoute>} />
        ))}
        <Route path="/audit-log" element={<Navigate to="/admin/audit-logs" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
