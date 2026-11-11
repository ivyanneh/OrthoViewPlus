import sqlite3
import uuid
from datetime import datetime

DB_PATH = r'C:\Users\ivymu\OrthoViewPlus\server\data\orthoviewplus.db'
db = sqlite3.connect(DB_PATH)
c = db.cursor()
db.execute('PRAGMA foreign_keys = ON')

# ============ STEP 1: Add 3 new demonstration patients ============
# These are OVP-DEMO-001, OVP-DEMO-002, OVP-DEMO-003
# Check if they already exist
patients_to_add = [
    ('OVP-DEMO-001', 'John', 'Doe', '1965-03-15', 'M'),
    ('OVP-DEMO-002', 'Jane', 'Smith', '1972-08-22', 'F'),
    ('OVP-DEMO-003', 'Robert', 'Johnson', '1958-11-10', 'M'),
]
for mrn, name_first, name_last, dob, sex in patients_to_add:
    c.execute('SELECT COUNT(*) as cnt FROM patients WHERE mrn = ?', (mrn,))
    row = c.fetchone()
    if row[0] == 0:
        c.execute(
            'INSERT INTO patients (mrn, first_name, last_name, date_of_birth, sex, notes, created_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime("now"))',
            (mrn, name_first, name_last, dob, sex,
             f'De-identified synthetic demonstration record for OrthoView+. Not a real patient. MRN: {mrn}.', 1)
        )
        print(f'Added patient: {mrn}')
    else:
        print(f'Patient already exists: {mrn}')

# ============ STEP 2: Add imaging request for Joseph Demo (patient_id=2) ============
c.execute('SELECT id FROM imaging_requests WHERE patient_id = 2')
existing = c.fetchone()
if not existing:
    c.execute(
        "INSERT INTO imaging_requests (patient_id, requested_by, assigned_radiologist_id, examination, modality, priority, clinical_indication, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'in_progress', datetime('now'), datetime('now'))",
        (2, 1, 7, 'Foot AP', 'XR', 'routine', 'Extremity coverage assessment - demonstration request')
    )
    print('Added imaging request for Joseph Demo')
else:
    print('Imaging request already exists for Joseph Demo')

# ============ STEP 3: Add imaging studies with longitudinal follow-up ============
c.execute('SELECT last_insert_rowid()')
joseph_req_id = c.fetchone()[0]

studies = [
    # Patient 1: Amina Demo (id 1) - Chest XR longitudinal
    (1, 1, 'Chest PA', 'XR', '2026-11-03', 'Initial chest XR - demonstration', 'original'),
    (1, 1, 'Chest PA follow-up', 'XR', '2026-12-03', 'Follow-up chest XR - longitudinal comparison', 'original'),
    # Patient 2: Joseph Demo (id 2) - Foot XR longitudinal
    (2, joseph_req_id, 'Foot AP', 'XR', '2026-11-03', 'Initial foot XR - demonstration', 'original'),
    (2, joseph_req_id, 'Foot AP follow-up', 'XR', '2026-12-03', 'Follow-up foot XR - longitudinal comparison', 'original'),
    # Patient 3: Ivy Test (id 3) - MRI Brain longitudinal
    (3, 2, 'MRI Brain - Demonstration Study', 'MR', '2026-11-03', 'Initial MRI Brain - demonstration', 'original'),
    (3, 2, 'MRI Brain follow-up', 'MR', '2026-12-03', 'Follow-up MRI Brain - longitudinal comparison', 'original'),
]

for stud in studies:
    patient_id, request_id, exam, mod, study_date, desc, source = stud
    # Check if study already exists (by patient_id + modality + description)
    c.execute('SELECT id FROM imaging_studies WHERE patient_id = ? AND modality = ? AND description = ?', (patient_id, mod, desc))
    if not c.fetchone():
        # Generate UIDs
        study_instance_uid = f'1.2.276.0.8888.{uuid.uuid4().hex[:12]}'
        c.execute(
            'INSERT INTO imaging_studies (patient_id, imaging_request_id, orthanc_study_id, study_instance_uid, study_date, modality, description, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, "original", datetime("now"))',
            (patient_id, request_id, study_instance_uid, study_instance_uid, study_date, mod, desc)
        )
        print(f'Added study: patient {patient_id}, {exam} ({mod})')
    else:
        print(f'Study already exists: patient {patient_id}')

# ============ STEP 4: Add patient-DICOM mappings ============
mappings = [
    (1, 1, 'Amina Demo', 'Chest XR mapping'),
    (2, 2, 'Joseph Demo', 'Foot XR mapping'),
    (3, 1, 'Ivy Test', 'MRI Brain mapping'),
]

for patient_id, orthanc_patient_id, patient_name, notes in mappings:
    c.execute('SELECT id FROM patient_dicom_mappings WHERE patient_id = ?', (patient_id,))
    if not c.fetchone():
        c.execute(
            "INSERT INTO patient_dicom_mappings (patient_id, orthanc_patient_id, patient_name, verified_at, verified_by, status, notes) VALUES (?, ?, ?, datetime('now'), 1, 'verified', ?)",
            (patient_id, orthanc_patient_id, patient_name, notes)
        )
        print(f'Added mapping: patient {patient_id} -> orthanc_patient {orthanc_patient_id}')
    else:
        print(f'Mapping already exists: patient {patient_id}')

# Verify the changes
print('\n=== VERIFICATION ===')
c.execute('SELECT * FROM patients')
print('Patients:', c.fetchall())

c.execute('SELECT * FROM imaging_requests')
print('Requests:', c.fetchall())

c.execute('SELECT * FROM imaging_studies')
print('Studies:', c.fetchall())

c.execute('SELECT * FROM patient_dicom_mappings')
print('Mappings:', c.fetchall())

db.commit()
db.close()
print('Done!')