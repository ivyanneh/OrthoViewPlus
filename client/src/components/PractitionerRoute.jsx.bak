import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import LoadingState from './LoadingState.jsx';

export default function PractitionerRoute({ children }) {
  const { ready, user } = useAuth();

  if (!ready) {
    return <LoadingState message="Checking access rights..." />;
  }

  if (user?.role !== 'practitioner') {
    return <Navigate to={user?.role === 'administrator' ? '/admin/dashboard' : '/radiologist/dashboard'} replace />;
  }

  return children;
}
