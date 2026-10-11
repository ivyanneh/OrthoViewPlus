import { useState } from 'react';
import api from '../../api/client.js';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import useApiData from '../../hooks/useApiData.js';
import { formatDateTime, formatRole, formatValue, getApiError, getInitials } from '../../utils/format.js';

function ProfileForm({ profile, onSaved }) {
  const [form, setForm] = useState({
    fullName: profile.fullName ?? '',
    email: profile.email ?? '',
    department: profile.department ?? '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.patch(`/admin/users/${profile.id}`, form);
      onSaved();
    } catch (err) {
      setError(getApiError(err, 'Your details could not be saved.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <ErrorMessage message={error} />
      <div className="form-grid">
        <div className="field">
          <label htmlFor="profile-name">Full name</label>
          <input id="profile-name" value={form.fullName} onChange={update('fullName')} />
        </div>
        <div className="field">
          <label htmlFor="profile-dept">Department</label>
          <input id="profile-dept" value={form.department} onChange={update('department')} />
        </div>
        <div className="field span-2">
          <label htmlFor="profile-email">Email</label>
          <input id="profile-email" type="email" value={form.email} onChange={update('email')} />
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="primary-button" disabled={saving}>
          {saving ? 'Saving...' : 'Save details'}
        </button>
      </div>
    </form>
  );
}

export default function AdminProfile() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApiData('/admin/users', null, 'Unable to load your profile.');
  const [saved, setSaved] = useState(false);
  const profile = data?.users?.find((item) => Number(item.id) === Number(user?.id));

  return (
    <section className="page page-narrow">
      {loading && !data ? <LoadingState message="Loading profile..." /> : null}
      <ErrorMessage message={error} />
      {saved ? (
        <div className="notice-banner" role="status">
          Your details were updated.
        </div>
      ) : null}

      {profile ? (
        <>
          <section className="panel">
            <div className="profile-header">
              <span className="avatar avatar-lg" aria-hidden="true">
                {getInitials(profile.username)}
              </span>
              <div>
                <h3>{profile.fullName || profile.username}</h3>
                <p className="mono muted">{profile.username}</p>
                <div className="badge-stack">
                  <StatusBadge tone="primary">{formatRole(profile.role)}</StatusBadge>
                  <StatusBadge tone={profile.status === 'active' ? 'ok' : 'neutral'}>{profile.status === 'active' ? 'Active' : profile.status}</StatusBadge>
                </div>
              </div>
            </div>
            <div className="panel-body">
              <dl className="kv-list">
                <div>
                  <dt>Email</dt>
                  <dd>{formatValue(profile.email, 'Not set')}</dd>
                </div>
                <div>
                  <dt>Department</dt>
                  <dd>{formatValue(profile.department, 'Not set')}</dd>
                </div>
                <div>
                  <dt>Account created</dt>
                  <dd className="mono">{formatDateTime(profile.createdAt)}</dd>
                </div>
                <div>
                  <dt>Last sign-in</dt>
                  <dd className="mono">{profile.lastLoginAt ? formatDateTime(profile.lastLoginAt) : 'Not recorded'}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="section-heading">
                <h3>Account details</h3>
                <p>Username and role can only be changed by another administrator.</p>
              </div>
            </div>
            <div className="panel-body">
              <ProfileForm
                key={profile.updatedAt ?? 'initial'}
                profile={profile}
                onSaved={() => {
                  setSaved(true);
                  reload();
                }}
              />
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
