import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import LoadingState from './LoadingState.jsx';

export default function AdminRoute({ children }) {
  const { ready, user } = useAuth();

  if (!ready) {
    return <LoadingState message="Checking access rights..." />;
  }

  if (user?.role !== 'administrator') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}