import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ExposureIndex from './pages/ExposureIndex.jsx';
import CompareScans from './pages/CompareScans.jsx';
import AuditLog from './pages/AuditLog.jsx';
import AdminRoute from './components/AdminRoute.jsx';
import { useAuth } from './context/AuthContext.jsx';

function HomeRedirect() {
  const { isAuthenticated, ready } = useAuth();
  if (!ready) {
    return <div className="auth-loading">Loading OrthoView+...</div>;
  }
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
}

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
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/exposure-index" element={<ExposureIndex />} />
        <Route path="/compare-scans" element={<CompareScans />} />
        <Route
          path="/audit-log"
          element={
            <AdminRoute>
              <AuditLog />
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
