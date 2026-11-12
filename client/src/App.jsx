import { Navigate, Route, Routes } from 'react-router-dom';

import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import UserManagement from './pages/admin/UserManagement.jsx';
import AdminPatients from './pages/admin/AdminPatients.jsx';
import ImagingSchedule from './pages/admin/ImagingSchedule.jsx';
import Alerts from './pages/admin/Alerts.jsx';
import ModalityMonitoring from './pages/admin/ModalityMonitoring.jsx';
import SystemAdministration from './pages/admin/SystemAdministration.jsx';
import AdminProfile from './pages/admin/AdminProfile.jsx';
import ImagingStudyManagement from './pages/admin/ImagingStudyManagement.jsx';

// Practitioner Pages
import PractitionerDashboard from './pages/PractitionerDashboard.jsx';
import PractitionerScans from './pages/PractitionerScans.jsx';
import PractitionerRequests from './pages/PractitionerRequests.jsx';
import PractitionerProfile from './pages/PractitionerProfile.jsx';
import PractitionerSettings from './pages/PractitionerSettings.jsx';

// Radiologist Pages
import RadiologistWorkspaceDashboard from './pages/RadiologistWorkspaceDashboard.jsx';
import ScansImaging from './pages/ScansImaging.jsx';
import ImagingRequests from './pages/ImagingRequests.jsx';
import SavedDrafts from './pages/SavedDrafts.jsx';
import RadiologistProfile from './pages/RadiologistProfile.jsx';
import AccountSettings from './pages/AccountSettings.jsx';
import AiWorkbench from './pages/AiWorkbench.jsx';
import ScanComparisons from './pages/ScanComparisons.jsx';

// Shared & Clinical Pages
import ExposureIndex from './pages/ExposureIndex.jsx';
import CompareScans from './pages/CompareScans.jsx';
import AuditLog from './pages/AuditLog.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';

// Guards & Context
import AdminRoute from './components/AdminRoute.jsx';
import PractitionerRoute from './components/PractitionerRoute.jsx';
import ClinicalRoute from './components/ClinicalRoute.jsx';
import RadiologistRoute from './components/RadiologistRoute.jsx';

import { useAuth } from './context/AuthContext.jsx';
import { ThemeProvider } from './hooks/useTheme.jsx';
import { homePathFor } from './utils/format.js';

function HomeRedirect() {
  const { isAuthenticated, ready, user } = useAuth();

  if (!ready) {
    return <div className="auth-loading">Loading OrthoView+...</div>;
  }

  return (
    <Navigate
      to={isAuthenticated ? homePathFor(user?.role) : '/login'}
      replace
    />
  );
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
  ['/admin/patients-imaging', <AdminPatients />],
  ['/admin/scheduling', <ImagingSchedule />],
  ['/admin/audit-logs', <AuditLog />],
  ['/admin/alerts', <Alerts />],
  ['/admin/modalities', <ModalityMonitoring />],
  ['/admin/system', <SystemAdministration />],
  ['/admin/profile', <AdminProfile />],
  ['/admin/settings', <AdminProfile />],
  ['/admin/imaging-studies', <ImagingStudyManagement mode="all" />],
  ['/admin/patient-mapping', <ImagingStudyManagement mode="mapping" />],
  ['/admin/study-linking', <ImagingStudyManagement mode="linking" />],
];

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<Login />} />

        {/* Protected Workspace Routes */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route
            path="/notifications"
            element={<NotificationsPage />}
          />

          {/* Health Practitioner Workspace */}
          {practitionerPages.map(([path, element]) => (
            <Route
              key={path}
              path={path}
              element={
                <PractitionerRoute>
                  {element}
                </PractitionerRoute>
              }
            />
          ))}

          {/* Shared Clinical Workspaces */}
          {clinicalPages.map(([path, element]) => (
            <Route
              key={path}
              path={path}
              element={
                <ClinicalRoute>
                  {element}
                </ClinicalRoute>
              }
            />
          ))}

          {/* Radiologist Workspace */}
          {radiologistPages.map(([path, element]) => (
            <Route
              key={path}
              path={path}
              element={
                <RadiologistRoute>
                  {element}
                </RadiologistRoute>
              }
            />
          ))}

          {/* Administrator Workspace */}
          {adminPages.map(([path, element]) => (
            <Route
              key={path}
              path={path}
              element={
                <AdminRoute>
                  {element}
                </AdminRoute>
              }
            />
          ))}

          {/* Legacy & Shortcut Redirects */}
          <Route
            path="/audit-log"
            element={<Navigate to="/admin/audit-logs" replace />}
          />

          <Route
            path="/admin/patients"
            element={<Navigate to="/admin/patients-imaging" replace />}
          />

          <Route
            path="/admin/schedule"
            element={<Navigate to="/admin/scheduling" replace />}
          />
        </Route>

        {/* Fallback Catch-All */}
        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </ThemeProvider>
  );
}