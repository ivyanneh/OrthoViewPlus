import { useEffect, useState } from 'react';
import api from '../../api/client.js';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import useApiData from '../../hooks/useApiData.js';
import useTheme from '../../hooks/useTheme.jsx';
import {
  formatDateTime,
  formatRole,
  formatValue,
  getApiError,
  getInitials,
} from '../../utils/format.js';

function ProfileForm({ profile, onSaved, onCancel }) {
  const [form, setForm] = useState({
    fullName: profile.fullName ?? '',
    email: profile.email ?? '',
    department: profile.department ?? '',
  });

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function update(field) {
    return (event) => {
      setForm((current) => ({
        ...current,
        [field]: event.target.value,
      }));
    };
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
            required
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
            required
          />
        </div>
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>

        <button
          type="submit"
          className="primary-button"
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save changes'}
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
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const [passwords, setPasswords] = useState({
    current: '',
    newPassword: '',
    confirm: '',
  });

  const [passwordError, setPasswordError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  const profile = data?.users?.find(
    (item) => Number(item.id) === Number(user?.id)
  );

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationError, setNotificationError] = useState('');

  useEffect(() => {
    if (profile) {
      setNotificationsEnabled(
        profile.notification_preference !== false &&
        Number(profile.notification_preference) !== 0
      );
    }
  }, [profile?.notification_preference, profile?.id]);

  function updatePassword(field) {
    return (event) => {
      setPasswords((current) => ({
        ...current,
        [field]: event.target.value,
      }));
    };
  }

  async function handleNotificationChange(event) {
    if (!profile) return;

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

  async function handlePasswordChange(event) {
    event.preventDefault();

    setPasswordError('');
    setPasswordMessage('');

    if (!passwords.current || !passwords.newPassword || !passwords.confirm) {
      setPasswordError('All password fields are required.');
      return;
    }

    if (passwords.newPassword !== passwords.confirm) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    if (passwords.newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }

    if (!profile) return;

    setPasswordSaving(true);

    try {
      await api.patch(`/admin/users/${profile.id}`, {
        password: passwords.newPassword,
      });

      setPasswords({
        current: '',
        newPassword: '',
        confirm: '',
      });

      setPasswordMessage('Password updated successfully.');
      setShowPasswordForm(false);
    } catch (err) {
      setPasswordError(
        getApiError(err, 'Failed to update password. Please try again.')
      );
    } finally {
      setPasswordSaving(false);
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
          {/* USER INFO PANEL */}
          <section className="panel">
            <div className="profile-header">
              <span className="avatar avatar-lg" aria-hidden="true">
                {getInitials(profile.fullName || profile.username)}
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
                  <dt>Full name</dt>
                  <dd>{formatValue(profile.fullName, 'Not set')}</dd>
                </div>

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
              </dl>

              <div className="form-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setSaved(false);
                    setShowEditProfile(true);
                  }}
                >
                  Edit Profile Details
                </button>
              </div>
            </div>
          </section>

          {/* EDIT PROFILE MODAL */}
          {showEditProfile ? (
            <div
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setShowEditProfile(false);
                }
              }}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                display: 'grid',
                placeItems: 'center',
                padding: '20px',
                background: 'rgba(0, 0, 0, 0.58)',
              }}
            >
              <section
                className="panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="edit-profile-title"
                style={{
                  width: 'min(560px, 100%)',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  boxShadow: '0 18px 55px rgba(0,0,0,0.28)',
                }}
              >
                <div className="panel-header">
                  <div className="section-heading">
                    <h3 id="edit-profile-title">Edit Profile Details</h3>
                    <p>Update your name, department and email address.</p>
                  </div>
                </div>

                <div className="panel-body">
                  <ProfileForm
                    key={profile.updatedAt ?? 'initial'}
                    profile={profile}
                    onCancel={() => setShowEditProfile(false)}
                    onSaved={() => {
                      setShowEditProfile(false);
                      setSaved(true);
                      reload();
                    }}
                  />
                </div>
              </section>
            </div>
          ) : null}

          {/* PREFERENCES PANEL (Modern Clean Horizontal Layout) */}
          <section className="panel">
            <div className="panel-header">
              <div className="section-heading">
                <h3>Preferences</h3>
                <p>Manage the appearance and notifications for your account.</p>
              </div>
            </div>

            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Row 1: Appearance Theme */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  paddingBottom: '1rem',
                  borderBottom: '1px solid var(--border-color, #eaeaea)',
                }}
              >
                <div>
                  <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary, #111)', display: 'block' }}>
                    Appearance
                  </strong>
                  <p className="muted" style={{ margin: '2px 0 0 0', fontSize: '0.85rem' }}>
                    Choose your preferred display theme.
                  </p>
                </div>

                <select
                  id="theme-select"
                  value={theme}
                  onChange={(event) => setTheme(event.target.value)}
                  style={{ minWidth: '150px', padding: '6px 12px', borderRadius: '6px' }}
                >
                  <option value="light">Light Mode</option>
                  <option value="dark">Dark Mode</option>
                </select>
              </div>

              {/* Row 2: System Notifications */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                }}
              >
                <div>
                  <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary, #111)', display: 'block' }}>
                    System Notifications
                  </strong>
                  <p className="muted" style={{ margin: '2px 0 0 0', fontSize: '0.85rem' }}>
                    Receive administrative system notifications.
                  </p>
                </div>

                <input
                  id="admin-notifications"
                  type="checkbox"
                  checked={notificationsEnabled}
                  disabled={notificationSaving}
                  onChange={handleNotificationChange}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#0066ff' }}
                />
              </div>

              {notificationSaving ? (
                <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>Saving notification preference...</p>
              ) : null}

              <ErrorMessage message={notificationError} />
            </div>
          </section>

          {/* ACCOUNT SECURITY PANEL */}
          <section className="panel">
            <div className="panel-header">
              <div className="section-heading">
                <h3>Account Security</h3>
                <p>Update your account password.</p>
              </div>
            </div>

            <div className="panel-body">
              <ErrorMessage message={passwordError} />

              {passwordMessage ? (
                <div className="notice-banner" role="status">
                  {passwordMessage}
                </div>
              ) : null}

              {!showPasswordForm ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setPasswordError('');
                    setPasswordMessage('');
                    setShowPasswordForm(true);
                  }}
                >
                  Change Password
                </button>
              ) : (
                <form onSubmit={handlePasswordChange} noValidate>
                  <div className="form-grid">
                    <div className="field span-2">
                      <label htmlFor="current-password">
                        Current Password
                      </label>
                      <input
                        id="current-password"
                        type="password"
                        autoComplete="current-password"
                        placeholder="Enter current password"
                        value={passwords.current}
                        onChange={updatePassword('current')}
                        required
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="new-password">New Password</label>
                      <input
                        id="new-password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="Enter new password"
                        value={passwords.newPassword}
                        onChange={updatePassword('newPassword')}
                        required
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
                        value={passwords.confirm}
                        onChange={updatePassword('confirm')}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={passwordSaving}
                      onClick={() => {
                        setShowPasswordForm(false);
                        setPasswordError('');
                        setPasswords({
                          current: '',
                          newPassword: '',
                          confirm: '',
                        });
                      }}
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      className="primary-button"
                      disabled={passwordSaving}
                    >
                      {passwordSaving ? 'Updating...' : 'Update Password'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
