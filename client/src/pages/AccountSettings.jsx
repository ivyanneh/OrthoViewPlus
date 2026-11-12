import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import useTheme from '../hooks/useTheme.jsx';
import api from '../api/client.js';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import { getApiError } from '../utils/format.js';

export default function AccountSettings() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadSettings() {
      setError('');
      try {
        const response = await api.get('/clinical/users/me');
        if (!isMounted) return;
        const account = response.data?.user;
        if (account) {
          setNotificationsEnabled(account.notification_preference !== false);
        }
      } catch (err) {
        if (isMounted) {
          setError(getApiError(err, 'Unable to load account settings.'));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  function handleThemeChange(e) {
    const selectedTheme = e.target.value;
    if (selectedTheme !== theme) {
      toggleTheme();
    }
  }

  function handlePasswordInputChange(event) {
    const { name, value } = event.currentTarget;
    setPasswordForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handlePasswordChange() {
    setError('');
    setSuccess('');

    if (
      !passwordForm.currentPassword ||
      !passwordForm.newPassword ||
      !passwordForm.confirmPassword
    ) {
      setError('Please complete all password fields.');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (saving) return;

    setSaving(true);

    try {
      await api.post('/clinical/users/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });

      setSuccess('Password updated successfully.');

      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });

      setShowPasswordForm(false);
    } catch (err) {
      setError(getApiError(err, 'Unable to update password.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePreferences() {
    if (saving) return;

    setError('');
    setSuccess('');
    setSaving(true);

    try {
      await api.patch('/clinical/users/me', {
        theme_preference: theme,
        notification_preference: notificationsEnabled,
      });

      setSuccess('Account preferences saved successfully.');
    } catch (err) {
      setError(getApiError(err, 'Unable to save preferences.'));
    } finally {
      setSaving(false);
    }
  }

  function handleCancelPasswordChange() {
    setShowPasswordForm(false);
    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
  }

  if (loading) {
    return <LoadingState message="Loading settings..." />;
  }

  return (
    <section className="page page-narrow">
      <div className="panel">
        <div className="panel-header">
          <h3>Account Settings</h3>
        </div>

        {error ? <ErrorMessage message={error} /> : null}

        {success ? (
          <div className="notice-banner" role="status">
            {success}
          </div>
        ) : null}

        <div className="panel-body">
          {/* Account Status */}
          <h4>Account Status</h4>

          <div className="kv-list">
            <div>
              <dt>Status</dt>
              <dd>
                <span className="badge badge-ok">Active</span>
              </dd>
            </div>

            <div>
              <dt>Username</dt>
              <dd>{user?.username || 'Unavailable'}</dd>
            </div>

            <div>
              <dt>Role</dt>
              <dd>{user?.role || 'Radiologist'}</dd>
            </div>
          </div>

          {/* Password Management */}
          <h4 style={{ marginTop: '1.5rem' }}>Password Management</h4>

          {!showPasswordForm ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setError('');
                setSuccess('');
                setShowPasswordForm(true);
              }}
            >
              Reset Password
            </button>
          ) : (
            <div style={{ marginTop: '1rem' }}>
              <div className="field">
                <label htmlFor="currentPassword">Current Password</label>
                <input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={passwordForm.currentPassword}
                  onChange={handlePasswordInputChange}
                />
              </div>

              <div className="field">
                <label htmlFor="newPassword">New Password</label>
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.newPassword}
                  onChange={handlePasswordInputChange}
                />
              </div>

              <div className="field">
                <label htmlFor="confirmPassword">Confirm New Password</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.confirmPassword}
                  onChange={handlePasswordInputChange}
                />
              </div>

              <div className="button-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleCancelPasswordChange}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="primary-button"
                  onClick={handlePasswordChange}
                  disabled={saving}
                >
                  {saving ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </div>
          )}

          {/* Account Preferences */}
          <h4 style={{ marginTop: '1.5rem' }}>Account Preferences</h4>

          <div className="field">
            <label htmlFor="theme">Theme Preference</label>
            <select
              id="theme"
              value={theme}
              onChange={handleThemeChange}
              disabled={saving}
            >
              <option value="light">Light Mode</option>
              <option value="dark">Dark Mode</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="notifications">Enable Notifications</label>

            <div className="inline-row">
              <input
                id="notifications"
                type="checkbox"
                checked={notificationsEnabled}
                onChange={(event) =>
                  setNotificationsEnabled(event.currentTarget.checked)
                }
                disabled={saving}
                style={{ width: 'auto' }}
              />

              <span>Receive system notifications</span>
            </div>
          </div>

          <button
            type="button"
            className="primary-button"
            onClick={handleSavePreferences}
            disabled={saving}
            style={{ marginTop: '1rem' }}
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </section>
  );
}