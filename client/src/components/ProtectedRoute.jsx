import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import LoadingState from './LoadingState.jsx';

export default function ProtectedRoute({ children }) {
  const { ready, isAuthenticated } = useAuth();

  if (!ready) {
    return <LoadingState message="Restoring session..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
