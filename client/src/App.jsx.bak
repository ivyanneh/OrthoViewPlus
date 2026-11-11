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
import ImagingStudyManagement from './pages/admin/ImagingStudyManagement.jsx';
import PatientManagement from './pages/admin/PatientManagement.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import PractitionerWorkspace from './pages/PractitionerWorkspace.jsx';
import AdminRoute from './components/AdminRoute.jsx';
import PractitionerRoute from './components/PractitionerRoute.jsx';
import ClinicalRoute from './components/ClinicalRoute.jsx';
import RadiologistRoute from './components/RadiologistRoute.jsx';
import PractitionerDashboard from './pages/PractitionerDashboard.jsx';
import PractitionerScans from './pages/PractitionerScans.jsx';
import PractitionerRequests from './pages/PractitionerRequests.jsx';
import PractitionerProfile from './pages/PractitionerProfile.jsx';
import PractitionerSettings from './pages/PractitionerSettings.jsx';
import RadiologistDashboard from './pages/RadiologistDashboard.jsx';
import RadiologistWorkspaceDashboard from './pages/RadiologistWorkspaceDashboard.jsx';
import ScansImaging from './pages/ScansImaging.jsx';
import ImagingRequests from './pages/ImagingRequests.jsx';
import SavedDrafts from './pages/SavedDrafts.jsx';
import RadiologistProfile from './pages/RadiologistProfile.jsx';
import AccountSettings from './pages/AccountSettings.jsx';
import AiWorkbench from './pages/AiWorkbench.jsx';
import ScanComparisons from './pages/ScanComparisons.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { homePathFor } from './utils/format.js';
import AdminSettings from './pages/admin/AdminSettings.jsx';

function HomeRedirect() {
  const { isAuthenticated, ready, user } = useAuth();
  if (!ready) {
    return <div className="auth-loading">Loading OrthoView+...</div>;
  }
  return <Navigate to={isAuthenticated ? homePathFor(user?.role) : '/login'} replace />;
}

const practitionerPages = [
  ['/practitioner/dashboard', <PractitionerDashboard />],
  ['/practitioner/scans', <PractitionerScans />],
  ['/practitioner/requests', <PractitionerRequests />],
  ['/practitioner/profile', <PractitionerProfile />],
  ['/practitioner/settings', <PractitionerSettings />],
];

const clinicalPages = [
  ['/exposure-index', <ExposureIndex />],
  ['/compare-scans', <CompareScans />],
];
const radiologistPages = [
  ['/dashboard', <RadiologistWorkspaceDashboard />],
  ['/scans', <ScansImaging />],
  ['/ai-tools', <AiWorkbench />],
  ['/ai-tools/restore', <AiWorkbench />],
  ['/ai-tools/completeness', <AiWorkbench />],
  ['/ai-tools/compare', <AiWorkbench />],
  ['/ai-tools/reconstruct', <AiWorkbench />],
  ['/ai-tools/segment3d', <AiWorkbench />],
  ['/ai-tools/synthetic', <AiWorkbench />],
  ['/ai-tools/complementary', <AiWorkbench />],
  ['/scan-comparisons', <ScanComparisons />],
  ['/imaging-requests', <ImagingRequests />],
  ['/drafts', <SavedDrafts />],
  ['/profile', <RadiologistProfile />],
  ['/settings', <AccountSettings />],
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
  ['/admin/imaging-studies', <ImagingStudyManagement />],
  ['/admin/patients', <PatientManagement />],
  ['/admin/settings', <AdminSettings />],
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
        <Route path="/notifications" element={<NotificationsPage />} />
        {practitionerPages.map(([path, element]) => (
          <Route key={path} path={path} element={<PractitionerRoute>{element}</PractitionerRoute>} />
        ))}
        {clinicalPages.map(([path, element]) => (
          <Route key={path} path={path} element={<ClinicalRoute>{element}</ClinicalRoute>} />
        ))}
        {radiologistPages.map(([path, element]) => (
          <Route key={path} path={path} element={<RadiologistRoute>{element}</RadiologistRoute>} />
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
