
import { useEffect, useState } from 'react';
import api from '../../api/client.js';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import useApiData from '../../hooks/useApiData.js';
import useTheme from '../../hooks/useTheme.js';
import {
  formatDateTime,
  formatRole,
  formatValue,
  getApiError,
  getInitials,
} from '../../utils/format.js';

function ProfileForm({ profile, onSaved }) {
  const [form, setForm] = useState({
    fullName: profile.fullName ?? '',
    email: profile.email ?? '',
    department: profile.department ?? '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function update(field) {
    return (event) =>
      setForm((current) => ({
        ...current,
        [field]: event.target.value,
      }));
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
          <input
            id="profile-name"
            value={form.fullName}
            onChange={update('fullName')}
          />
        </div>

        <div className="field">
          <label htmlFor="profile-dept">Department</label>
          <input
            id="profile-dept"
            value={form.department}
            onChange={update('department')}
          />
        </div>

        <div className="field span-2">
          <label htmlFor="profile-email">Email</label>
          <input
            id="profile-email"
            type="email"
            value={form.email}
            onChange={update('email')}
          />
        </div>
      </div>

      <div className="form-actions">
        <button
          type="submit"
          className="primary-button"
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save details'}
        </button>
      </div>
    </form>
  );
}

export default function AdminProfile() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();

  const {
    data,
    loading,
    error,
    reload,
  } = useApiData(
    '/admin/users',
    null,
    'Unable to load your profile.'
  );

  const [saved, setSaved] = useState(false);

  const profile = data?.users?.find(
    (item) => Number(item.id) === Number(user?.id)
  );

  const [notificationsEnabled, setNotificationsEnabled] = useState(
    true
  );
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationError, setNotificationError] = useState('');

  // Synchronize the notification setting with the loaded profile.
  useEffect(() => {
    if (profile) {
      setNotificationsEnabled(
        profile.notification_preference !== false &&
        Number(profile.notification_preference) !== 0
      );
    }
  }, [profile?.notification_preference, profile?.id]);

  async function handleNotificationChange(event) {
    const previousValue = notificationsEnabled;
    const nextValue = event.target.checked;

    setNotificationsEnabled(nextValue);
    setNotificationSaving(true);
    setNotificationError('');

    try {
      await api.patch(`/admin/users/${profile.id}`, {
        notification_preference: nextValue ? 1 : 0,
      });

      reload();
    } catch (err) {
      setNotificationsEnabled(previousValue);
      setNotificationError(
        getApiError(
          err,
          'Unable to update notification preferences.'
        )
      );
    } finally {
      setNotificationSaving(false);
    }
  }

  async function handlePasswordChange() {
    const current = document.getElementById('current-password')?.value;
    const newPass = document.getElementById('new-password')?.value;
    const confirm = document.getElementById('confirm-password')?.value;

    if (!current || !newPass || !confirm) {
      alert('All password fields are required.');
      return;
    }

    if (newPass !== confirm) {
      alert('New password and confirmation do not match.');
      return;
    }

    if (newPass.length < 8) {
      alert('New password must be at least 8 characters.');
      return;
    }

    try {
      await api.patch(`/admin/users/${profile.id}`, {
        password: newPass,
      });

      alert('Password updated successfully.');

      const currentPasswordField = document.getElementById('current-password');
      const newPasswordField = document.getElementById('new-password');
      const confirmPasswordField = document.getElementById('confirm-password');

      if (currentPasswordField) currentPasswordField.value = '';
      if (newPasswordField) newPasswordField.value = '';
      if (confirmPasswordField) confirmPasswordField.value = '';
    } catch (err) {
      alert(
        getApiError(err, 'Failed to update password. Please try again.')
      );
    }
  }

  return (
    <section className="page page-narrow">
      {loading && !data ? (
        <LoadingState message="Loading profile..." />
      ) : null}

      <ErrorMessage message={error} />

      {saved ? (
        <div className="notice-banner" role="status">
          Your details were updated.
        </div>
      ) : null}

      {profile ? (
        <>
          {/* Profile information */}
          <section className="panel">
            <div className="profile-header">
              <span className="avatar avatar-lg" aria-hidden="true">
                {getInitials(profile.username)}
              </span>

              <div>
                <h3>{profile.fullName || profile.username}</h3>
                <p className="mono muted">{profile.username}</p>

                <div className="badge-stack">
                  <StatusBadge tone="primary">
                    {formatRole(profile.role)}
                  </StatusBadge>

                  <StatusBadge
                    tone={profile.status === 'active' ? 'ok' : 'neutral'}
                  >
                    {profile.status === 'active'
                      ? 'Active'
                      : profile.status}
                  </StatusBadge>
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
                  <dd className="mono">
                    {formatDateTime(profile.createdAt)}
                  </dd>
                </div>

                <div>
                  <dt>Last sign-in</dt>
                  <dd className="mono">
                    {profile.lastLoginAt
                      ? formatDateTime(profile.lastLoginAt)
                      : 'Not recorded'}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          {/* Theme Preferences */}
          <section className="panel">
            <div className="panel-header">
              <div className="section-heading">
                <h3>Theme Preferences</h3>
              </div>
            </div>

            <div className="panel-body">
              <div className="field">
                <label htmlFor="theme-select">Theme</label>

                <select
                  id="theme-select"
                  value={theme}
                  onChange={(event) => setTheme(event.target.value)}
                >
                  <option value="light">Light Mode</option>
                  <option value="dark">Dark Mode</option>
                </select>
              </div>
            </div>
          </section>

          {/* System Notifications */}
          <section className="panel">
            <div className="panel-header">
              <div className="section-heading">
                <h3>System Notifications</h3>
              </div>
            </div>

            <div className="panel-body">
              <ErrorMessage message={notificationError} />

              <div className="field">
                <label>
                  <input
                    type="checkbox"
                    checked={notificationsEnabled}
                    disabled={notificationSaving}
                    onChange={handleNotificationChange}
                  />

                  Master toggle for administrative system notifications
                </label>

                {notificationSaving ? (
                  <p className="muted">
                    Saving notification preference...
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          {/* Account Security ÔÇö Password Change */}
          <section className="panel">
            <div className="panel-header">
              <div className="section-heading">
                <h3>Account Security</h3>
              </div>
            </div>

            <div className="panel-body">
              <div className="field">
                <label htmlFor="current-password">
                  Current Password
                </label>

                <input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter current password"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                  }}
                />
              </div>

              <div className="field">
                <label htmlFor="new-password">
                  New Password
                </label>

                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Enter new password"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                  }}
                />
              </div>

              <div className="field">
                <label htmlFor="confirm-password">
                  Confirm New Password
                </label>

                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Confirm new password"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                  }}
                />
              </div>

              <div className="field">
                <button
                  type="button"
                  onClick={handlePasswordChange}
                >
                  Change Password
                </button>
              </div>
            </div>
          </section>

          {/* Account Details */}
          <section className="panel">
            <div className="panel-header">
              <div className="section-heading">
                <h3>Account details</h3>
                <p>
                  Username and role can only be changed by another administrator.
                </p>
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
