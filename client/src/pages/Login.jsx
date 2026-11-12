import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { homePathFor } from '../utils/format.js';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Username and password are required.');
      return;
    }

    setSubmitting(true);
    try {
      const user = await login(username.trim(), password);
      navigate(homePathFor(user?.role), { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || 'Invalid username or password.');
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100vw', background: '#f8fafc', fontFamily: 'inherit' }}>
      
      {/* LEFT SIDEBAR - STREAMLINED BRANDING */}
      <div style={{
        flex: '1',
        background: '#0b1329',
        color: '#ffffff',
        padding: '3.5rem 4rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
        backgroundSize: '24px 24px'
      }}>
        {/* TOP BRANDING */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: '#0d9488',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 800,
            fontSize: '1.25rem'
          }}>
            +
          </div>
          <span style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#ffffff' }}>
            OrthoView+
          </span>
        </div>

        {/* CENTER HERO COPY */}
        <div style={{ maxWidth: '420px', margin: 'auto 0' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: '#14b8a6', textTransform: 'uppercase' }}>
            Clinical Workstation
          </span>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 700, margin: '0.75rem 0 1rem 0', lineHeight: 1.2, color: '#f8fafc' }}>
            Medical imaging workflow, simplified.
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '1rem', lineHeight: 1.6, margin: 0 }}>
            Unified PACS connectivity, AI workbench analytics, and diagnostic reporting for healthcare practitioners.
          </p>
        </div>

        {/* FOOTER BADGE */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#14b8a6' }} />
          <span>AUTHORIZED PERSONNEL ONLY</span>
        </div>
      </div>

      {/* RIGHT SIDEBAR - SIGN-IN FORM */}
      <div style={{ flex: '1.1', display: 'grid', placeItems: 'center', padding: '2rem' }}>
        <div style={{ width: 'min(400px, 100%)' }}>
          
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '2.5rem',
            boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)',
            border: '1px solid #e2e8f0'
          }}>
            <h2 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 700, color: '#0f172a' }}>
              Sign in
            </h2>
            <p style={{ margin: '0.35rem 0 1.75rem 0', fontSize: '0.875rem', color: '#64748b' }}>
              Use your OrthoView+ account to continue to the workstation.
            </p>

            <form onSubmit={handleSubmit} noValidate>
              <ErrorMessage message={error} />

              <div style={{ marginBottom: '1.25rem' }}>
                <label htmlFor="login-username" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Username
                </label>
                <input
                  id="login-username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder=""
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.95rem',
                    color: '#0f172a',
                    background: '#ffffff',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.75rem' }}>
                <label htmlFor="login-password" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder=""
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.95rem',
                    color: '#0f172a',
                    background: '#ffffff',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#0d9488',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '1rem',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                {submitting ? 'Signing in...' : 'Login'}
              </button>
            </form>
          </div>

          {/* CRISP HIPAA COMPLIANCE FOOTER */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            marginTop: '1.5rem',
            color: '#64748b',
            fontSize: '0.8rem',
            fontWeight: 500
          }}>
            <span style={{ fontSize: '0.9rem' }}>🛡️</span>
            <span><strong>HIPAA Compliant & Audited Access.</strong> All activity is logged.</span>
          </div>

        </div>
      </div>

    </div>
  );
}