import { useEffect, useState } from 'react';
import api from '../api/client.js';
import Modal from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function PractitionerProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    specialisation: '',
    department: '',
    facility: '',
    registrationNumber: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
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
          specialisation: response.data.user.specialisation || '',
          department: response.data.user.department || '',
          facility: response.data.user.facility || '',
          registrationNumber: response.data.user.registration_number || ''
        });
      } catch (err) {
        setError('Unable to load profile.');
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  async function handleSaveProfile() {
    setError('');
    setSaving(true);
    try {
      await api.patch('/clinical/users/me', editForm);
      const response = await api.get('/clinical/users/me');
      setProfile(response.data.user);
      setEditForm({ fullName: response.data.user.full_name || '', email: response.data.user.email || '', phone: response.data.user.phone || '', specialisation: response.data.user.specialisation || '', department: response.data.user.department || '', facility: response.data.user.facility || '', registrationNumber: response.data.user.registration_number || '' });
      setShowEditModal(false);
      setSuccess('Profile updated successfully.');
    } catch (err) {
      setError('Unable to update profile.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading profile...</p>;
  if (error) return <p className="error">Error: {error}</p>;

  return (
    <section className="page page-narrow">
      <div className="panel">
        <div className="panel-header">
          <h3>My Profile</h3>
          <button type="button" className="secondary-button" onClick={() => setShowEditModal(true)}>Edit Profile</button>
        </div>
        {error ? <p className="error">Error: {error}</p> : null}
        {success ? <p className="success">{success}</p> : null}
        <div className="panel-body">
          <div className="profile-header">
            <div className="avatar avatar-lg">
              {profile?.full_name ? profile.full_name.split(' ').map(n => n[0]).join('') : user?.username?.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h3>{profile?.full_name || user?.username}</h3>
              <p>Practitioner ID: {profile?.id || user?.id}</p>
            </div>
          </div>

          <h4>Personal Information</h4>
          <div className="kv-list">
            <div><dt>Full Name</dt><dd>{profile?.full_name || 'Not set'}</dd></div>
            <div><dt>Email Address</dt><dd>{profile?.email || 'Not set'}</dd></div>
            <div><dt>Phone Number</dt><dd>{profile?.phone || 'Not set'}</dd></div>
          </div>

          <h4 style={{marginTop: '1.5rem'}}>Professional Information</h4>
          <div className="kv-list">
            <div><dt>Title</dt><dd>Attending Physician</dd></div>
            <div><dt>Specialisation</dt><dd>{profile?.specialisation || 'Not set'}</dd></div>
            <div><dt>Department</dt><dd>{profile?.department || 'Not set'}</dd></div>
            <div><dt>Facility</dt><dd>{profile?.facility || 'Not set'}</dd></div>
            <div><dt>Registration Number</dt><dd>{profile?.registration_number || 'N/A'}</dd></div>
          </div>
        </div>
      </div>

      {showEditModal && (
        <Modal onClose={() => setShowEditModal(false)} title="Edit Profile">
          <div className="modal-body">
            <div className="field"><label htmlFor="fullName">Full Name</label><input id="fullName" type="text" value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} /></div>
            <div className="field"><label htmlFor="email">Email Address</label><input id="email" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></div>
            <div className="field"><label htmlFor="phone">Phone Number</label><input id="phone" type="tel" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></div>
            <div className="field"><label htmlFor="specialisation">Specialisation</label><input id="specialisation" type="text" value={editForm.specialisation} onChange={(e) => setEditForm({ ...editForm, specialisation: e.target.value })} /></div>
            <div className="field"><label htmlFor="department">Department</label><input id="department" type="text" value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} /></div>
            <div className="field"><label htmlFor="facility">Facility</label><input id="facility" type="text" value={editForm.facility} onChange={(e) => setEditForm({ ...editForm, facility: e.target.value })} /></div>
            <div className="field"><label htmlFor="registrationNumber">Registration Number</label><input id="registrationNumber" type="text" value={editForm.registrationNumber} onChange={(e) => setEditForm({ ...editForm, registrationNumber: e.target.value })} /></div>
          </div>
          <div className="modal-footer">
            <button type="button" className="secondary-button" onClick={() => setShowEditModal(false)}>Cancel</button>
            <button type="button" className="primary-button" onClick={handleSaveProfile} disabled={saving}>Save Changes</button>
          </div>
        </Modal>
      )}
    </section>
  );
}