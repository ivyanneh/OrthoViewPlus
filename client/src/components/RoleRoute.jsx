import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { homePathFor } from '../utils/format.js';
import LoadingState from './LoadingState.jsx';

export default function RoleRoute({ roles, children }) {
  const { ready, user } = useAuth();

  if (!ready) {
    return <LoadingState message="Checking access rights..." />;
  }

  if (!roles.includes(user?.role)) {
    return <Navigate to={homePathFor(user?.role)} replace />;
  }

  return children;
}
