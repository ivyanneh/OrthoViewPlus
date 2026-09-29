import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';

export default function Login() {
  const { login, isAuthenticated, ready } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (ready && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Enter both username and password.');
      return;
    }

    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      const apiMessage = err.response?.data?.error;
      setError(apiMessage || 'Unable to sign in. Check that the backend is running.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-brand">
        <p className="kicker">Clinical imaging workstation</p>
        <h1>OrthoView+</h1>
        <p>
          A web-based clinical interface for enhancing medical imaging workflows among healthcare
          practitioners.
        </p>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={handleSubmit} noValidate>
          <h2>Sign in</h2>
          <p className="lede">Use your OrthoView+ account to continue to the workstation.</p>
          <ErrorMessage message={error} />
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={submitting}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              required
            />
          </div>
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Login'}
          </button>
        </form>
      </section>
    </div>
  );
}
