import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/client.js';
import { Modal, Button } from '../components/Modal.jsx';
import { StatusBadge, ErrorMessage } from '../components/StatusBadge.jsx';
import { getApiError } from '../utils/format.js';

export default function PractitionerSettings() {
  const { user } = useAuth();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [theme, setTheme] = useState('light');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setError('');
    setLoading(true);
    try {
      const response = await api.get('/clinical/users/me');
      setTheme(response.data.user.theme_preference || 'light');
      setNotificationsEnabled(response.data.user.notification_preference !== false);
    } catch (err) {
      setError(getApiError(err, 'Unable to load settings.'));
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordChange() {
    setError('');
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/clinical/users/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      setSuccess('Password updated successfully.');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowPasswordForm(false);
    } catch (err) {
      setError(getApiError(err, 'Unable to update password.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePreferences() {
    setError('');
    setSaving(true);
    try {
      await api.patch('/clinical/users/me', {
        theme_preference: theme,
        notification_preference: notificationsEnabled
      });
      setSuccess('Preferences saved successfully.');
    } catch (err) {
      setError(getApiError(err, 'Unable to save preferences.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading settings...</p>;

  return (
    <section className="page page-narrow">
      <div className="panel">
        <div className="panel-header">
          <h3>Account Settings</h3>
        </div>
        {error ? <ErrorMessage message={error} /> : null}
        {success ? <div className="notice-banner">{success}</div> : null}
        <div className="panel-body">
          <h4>Account Status</h4>
          <div className="kv-list">
            <div><dt>Status</dt><dd><span>Active</span></dd></div>
            <div><dt>Role</dt><dd><span>Practitioner</span></dd></div>
          </div>

          <h4 style={{marginTop: '1.5rem'}}>Password Management</h4>
          <Button onClick={() => setShowPasswordForm(true)} className="secondary-button">
            Reset Password
          </Button>

          {showPasswordForm && (
            <div style={{marginTop: '1rem'}}>
              <div className="field"><label htmlFor="currentPassword">Current Password</label><input id="currentPassword" type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} /></div>
              <div className="field"><label htmlFor="newPassword">New Password</label><input id="newPassword" type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} /></div>
              <div className="field"><label htmlFor="confirmPassword">Confirm New Password</label><input id="confirmPassword" type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} /></div>
              <div className="button-row">
                <button type="button" className="secondary-button" onClick={() => {
                  setShowPasswordForm(false);
                  setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                }}>Cancel</button>
                <button type="button" className="primary-button" onClick={handlePasswordChange} disabled={saving}>{saving ? 'Updating...' : 'Update Password'}</button>
              </div>
            </div>
          )}

          <h4 style={{marginTop: '2rem'}}>Account Preferences</h4>
          <div className="field">
            <label htmlFor="theme">Theme Preference</label>
            <select id="theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="light">Light Mode</option>
              <option value="dark">Dark Mode</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="notifications">Enable Notifications</label>
            <div className="inline-row">
              <input id="notifications" type="checkbox" checked={notificationsEnabled} onChange={(e) => setNotificationsEnabled(e.target.checked)} style={{width: 'auto'}} />
              <span>Receive system notifications</span>
            </div>
          </div>
          <Button onClick={handleSavePreferences} style={{marginTop: '1rem'}}>
            {saving ? 'Saving...' : 'Save Preferences'}
          </Button>
        </div>
      </div>
    </section>
  );
}