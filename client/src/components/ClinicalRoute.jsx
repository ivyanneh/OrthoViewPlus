import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import LoadingState from './LoadingState.jsx';

export default function ClinicalRoute({ children }) {
  const { ready, user } = useAuth();

  if (!ready) return <LoadingState message="Checking access rights..." />;
  if (!['practitioner', 'radiologist'].includes(user?.role)) {
    return <Navigate to={user?.role === 'administrator' ? '/admin/dashboard' : '/login'} replace />;
  }
  return children;
}
