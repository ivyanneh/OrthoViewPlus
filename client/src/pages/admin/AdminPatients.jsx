import { useMemo, useState } from 'react';
import api from '../../api/client.js';
import EmptyState from '../../components/EmptyState.jsx';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import { PlusIcon, SearchIcon } from '../../components/Icons.jsx';
import useApiData from '../../hooks/useApiData.js';
import { formatDateTime, formatValue, getApiError } from '../../utils/format.js';

export default function AdminPatients() {
  const { data, loading, error, reload } = useApiData(
    '/admin/patients',
    null,
    'Unable to load patient records.'
  );

  const [search, setSearch] = useState('');
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  // Form State
  const [form, setForm] = useState({
    patientId: '',
    fullName: '',
    dob: '',
    gender: 'male',
    phone: '',
    email: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Extract patient list safely across backend structures
  const patients = useMemo(() => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.patients)) return data.patients;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  }, [data]);

  // Helper to extract patient name across DICOM & relational backend keys
  function getPatientName(p) {
    if (p.fullName) return p.fullName;
    if (p.full_name) return p.full_name;
    if (p.patient_name) return p.patient_name;
    if (p.patientName) return p.patientName;
    if (p.PatientName) return p.PatientName;
    if (p.name) return p.name;
    if (p.first_name || p.last_name) {
      return `${p.first_name || ''} ${p.last_name || ''}`.trim();
    }
    if (p.firstName || p.lastName) {
      return `${p.firstName || ''} ${p.lastName || ''}`.trim();
    }
    return `Patient #${p.id || p.patientId || p.patient_id}`;
  }

  // Helper to parse DICOM birth dates (YYYYMMDD -> YYYY-MM-DD) or standard DOBs
  function getPatientDOB(p) {
    const rawDob = p.dob || p.date_of_birth || p.birth_date || p.birthDate || p.PatientBirthDate || p.patientBirthDate;
    if (rawDob) {
      const str = String(rawDob).trim();
      // Parse DICOM YYYYMMDD format
      if (str.length === 8 && /^\d{8}$/.test(str)) {
        return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
      }
      return str;
    }
    // Fallback to age if available
    const age = p.age || p.patientAge || p.PatientAge;
    if (age) return `Age: ${age}`;
    return null;
  }

  // Helper to extract contact details
  function getPatientContact(p) {
    if (p.phone) return p.phone;
    if (p.phone_number) return p.phone_number;
    if (p.phoneNumber) return p.phoneNumber;
    if (p.email) return p.email;
    if (p.contact) return p.contact;
    return null;
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return patients;
    return patients.filter((p) => {
      const pId = p.patientId || p.patient_id || p.id || p.PatientID;
      const name = getPatientName(p);
      const contact = getPatientContact(p);
      return [pId, name, contact]
        .filter(Boolean)
        .some((val) => String(val).toLowerCase().includes(needle));
    });
  }, [patients, search]);

  function updateForm(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleRegisterPatient(e) {
    e.preventDefault();
    setActionError('');
    if (!form.fullName.trim() || !form.dob) {
      setActionError('Full name and date of birth are required.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/admin/patients', form);
      setNotice(`Patient "${form.fullName}" registered successfully.`);
      setShowRegisterModal(false);
      setForm({
        patientId: '',
        fullName: '',
        dob: '',
        gender: 'male',
        phone: '',
        email: '',
        notes: '',
      });
      reload();
    } catch (err) {
      setActionError(getApiError(err, 'Could not register patient.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page">
      {loading && !data ? <LoadingState message="Loading patients..." /> : null}
      <ErrorMessage message={error || actionError} />
      
      {notice ? (
        <div className="notice-banner" role="status">
          {notice}
        </div>
      ) : null}

      {/* SUMMARY CARDS */}
      <div className="summary-strip" style={{ marginBottom: '1.5rem' }}>
        <div>
          <span>Total Patients</span>
          <strong style={{ color: 'var(--text-primary, #0f172a)', fontSize: '1.75rem', fontWeight: 700 }}>
            {patients.length}
          </strong>
        </div>
        <div>
          <span>Registered Today</span>
          <strong style={{ color: 'var(--text-primary, #0f172a)', fontSize: '1.75rem', fontWeight: 700 }}>
            {patients.filter((p) => {
              const regDate = p.createdAt || p.created_at || p.registeredAt || p.creation_date;
              return regDate && String(regDate).startsWith(new Date().toISOString().slice(0, 10));
            }).length}
          </strong>
        </div>
      </div>

      {/* TOOLBAR */}
      <section className="panel">
        <div className="toolbar toolbar-actions">
          <div className="field inline-field grow">
            <label htmlFor="patient-search">Search</label>
            <div className="input-icon">
              <SearchIcon size={16} />
              <input
                id="patient-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by ID, name, phone or email..."
              />
            </div>
          </div>

          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setActionError('');
              setShowRegisterModal(true);
            }}
          >
            <PlusIcon size={16} />
            <span>Register Patient</span>
          </button>
        </div>

        {/* PATIENT TABLE */}
        {filtered.length > 0 ? (
          <div className="table-wrap flush">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient ID</th>
                  <th>Full Name</th>
                  <th>DOB</th>
                  <th>Gender</th>
                  <th>Contact</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((patient, index) => {
                  const pId = patient.patientId || patient.patient_id || patient.PatientID || patient.id || `PAT-${index + 1}`;
                  const fullName = getPatientName(patient);
                  const dob = getPatientDOB(patient);
                  const gender = patient.gender || patient.sex || patient.Gender || patient.PatientSex || '—';
                  const contact = getPatientContact(patient);
                  const createdAt = patient.createdAt || patient.created_at || patient.registeredAt || patient.lastStudyDate;

                  return (
                    <tr key={patient.id || pId || index}>
                      <td className="mono">{formatValue(pId, '—')}</td>
                      <td><strong>{fullName}</strong></td>
                      <td className="mono">{formatValue(dob, '—')}</td>
                      <td style={{ textTransform: 'capitalize' }}>{gender}</td>
                      <td>{formatValue(contact, '—')}</td>
                      <td className="mono muted">{createdAt ? formatDateTime(createdAt) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel-body">
            <EmptyState title="No patients found" message="No records match your query or database is empty." />
          </div>
        )}
      </section>

      {/* CENTERED POP-UP MODAL OVERLAY */}
      {showRegisterModal && (
        <div
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowRegisterModal(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'grid',
            placeItems: 'center',
            padding: '20px',
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            className="panel"
            role="dialog"
            aria-modal="true"
            style={{
              width: 'min(620px, 100%)',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: 'var(--bg-card, #ffffff)',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)',
              border: '1px solid var(--border-color, #e2e8f0)',
              padding: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color, #e2e8f0)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary, #0f172a)' }}>Register New Patient</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)' }}>Enter demographics and medical registration details.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary, #64748b)' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleRegisterPatient} noValidate>
              <ErrorMessage message={actionError} />
              
              <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="field span-2">
                  <label htmlFor="reg-name" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>Full Name *</label>
                  <input id="reg-name" required value={form.fullName} onChange={updateForm('fullName')} placeholder="e.g. Jane Doe" style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                </div>

                <div className="field">
                  <label htmlFor="reg-id" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>Patient ID / Medical Record No.</label>
                  <input id="reg-id" value={form.patientId} onChange={updateForm('patientId')} placeholder="Auto-generated if blank" style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                </div>

                <div className="field">
                  <label htmlFor="reg-dob" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>Date of Birth *</label>
                  <input id="reg-dob" type="date" required value={form.dob} onChange={updateForm('dob')} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                </div>

                <div className="field">
                  <label htmlFor="reg-gender" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>Gender</label>
                  <select id="reg-gender" value={form.gender} onChange={updateForm('gender')} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="reg-phone" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>Phone Number</label>
                  <input id="reg-phone" value={form.phone} onChange={updateForm('phone')} placeholder="+254 700 000 000" style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                </div>

                <div className="field span-2">
                  <label htmlFor="reg-email" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>Email Address</label>
                  <input id="reg-email" type="email" value={form.email} onChange={updateForm('email')} placeholder="patient@example.com" style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowRegisterModal(false)}
                  disabled={submitting}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={submitting}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 500, cursor: 'pointer' }}
                >
                  {submitting ? 'Registering...' : 'Register Patient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
