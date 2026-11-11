import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import LoadingState from './LoadingState.jsx';
import { homePathFor } from '../utils/format.js';

export default function ClinicalRoute({ children }) {
  const { ready, user } = useAuth();

  if (!ready) return <LoadingState message="Checking access rights..." />;
  if (!['practitioner', 'radiologist'].includes(user?.role)) {
    return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />;
  }
  return children;
}
