import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/client.js';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import Modal from '../components/Modal.jsx';
import { getApiError } from '../utils/format.js';

export default function RadiologistProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    phone: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    setError('');
    setLoading(true);
    try {
      const response = await api.get('/clinical/users/me');
      setProfile(response.data.user);
      setEditForm({
        fullName: response.data.user.full_name || '',
        email: response.data.user.email || '',
        phone: response.data.user.phone || '',
      });
    } catch (err) {
      setError(getApiError(err, 'Unable to load profile.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProfile() {
    setError('');
    setSaving(true);
    try {
      await api.patch('/clinical/users/me', editForm);
      await loadProfile();
      setShowEditModal(false);
    } catch (err) {
      setError(getApiError(err, 'Unable to update profile.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState message="Loading profile..." />;

  return (
    <section className="page page-narrow">
      <div className="panel">
        <div className="panel-header">
          <h3>My Profile</h3>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setShowEditModal(true)}
          >
            Edit Profile
          </button>
        </div>
        {error ? <ErrorMessage message={error} /> : null}
        <div className="panel-body">
          <div className="profile-header">
            <div className="avatar avatar-lg">
              {profile?.full_name ? profile.full_name.split(' ').map(n => n[0]).join('') : user?.username?.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h3>{profile?.full_name || user?.username}</h3>
              <p>Radiologist ID: {profile?.id || user?.id}</p>
            </div>
          </div>

          <h4 style={{ marginTop: '1.5rem' }}>Personal Information</h4>
          <div className="kv-list">
            <div>
              <dt>Full Name</dt>
              <dd>{profile?.full_name || 'Not set'}</dd>
            </div>
            <div>
              <dt>Email Address</dt>
              <dd>{profile?.email || 'Not set'}</dd>
            </div>
            <div>
              <dt>Phone Number</dt>
              <dd>{profile?.phone || 'Not set'}</dd>
            </div>
            <div>
              <dt>Username</dt>
              <dd>{user?.username}</dd>
            </div>
          </div>

          <h4 style={{ marginTop: '1.5rem' }}>Professional Information</h4>
          <div className="kv-list">
            <div>
              <dt>Professional Title</dt>
              <dd>Radiologist</dd>
            </div>
            <div>
              <dt>Specialisation</dt>
              <dd>Diagnostic Imaging</dd>
            </div>
            <div>
              <dt>Department</dt>
              <dd>Radiology</dd>
            </div>
            <div>
              <dt>Facility</dt>
              <dd>OrthoView+ Medical Center</dd>
            </div>
            <div>
              <dt>Registration Number</dt>
              <dd>{profile?.id || 'N/A'}</dd>
            </div>
          </div>
        </div>
      </div>

      {showEditModal && (
        <Modal onClose={() => setShowEditModal(false)} title="Edit Profile">
          <div className="modal-body">
            <div className="field">
              <label htmlFor="fullName">Full Name</label>
              <input
                id="fullName"
                type="text"
                value={editForm.fullName}
                onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone Number</label>
              <input
                id="phone"
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowEditModal(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleSaveProfile}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
