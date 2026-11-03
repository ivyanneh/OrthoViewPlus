import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { homePathFor } from '../utils/format.js';
import { AuditIcon, CompareIcon, DashboardIcon, ExposureIcon, LogoMark, ShieldIcon } from '../components/Icons.jsx';

export default function Login() {
  const { login, isAuthenticated, ready, user } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (ready && isAuthenticated) {
    return <Navigate to={homePathFor(user?.role)} replace />;
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
        <div className="login-brand-top">
          <LogoMark size={36} />
          <span className="login-brand-name">OrthoView+</span>
        </div>
        <div className="login-brand-body">
          <p className="kicker">Clinical imaging workstation</p>
          <h1>Medical imaging workflow, in one workspace.</h1>
          <p>
            A web-based clinical interface for enhancing medical imaging workflows among healthcare
            practitioners.
          </p>
          <ul className="login-modules">
            <li>
              <DashboardIcon size={16} /> PACS connectivity and archive overview
            </li>
            <li>
              <ExposureIcon size={16} /> Exposure index review (EI, EIT, DI)
            </li>
            <li>
              <CompareIcon size={16} /> Side-by-side study metadata comparison
            </li>
            <li>
              <AuditIcon size={16} /> Audited access to imaging workflows
            </li>
          </ul>
        </div>
        <p className="login-brand-foot">Authorized clinical personnel only</p>
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
          <button className="primary-button block" type="submit" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Login'}
          </button>
        </form>
        <p className="login-privacy-note">
          <ShieldIcon size={14} />
          <span>Authorized access only. Application activity is monitored and logged.</span>
        </p>
      </section>
    </div>
  );
}
