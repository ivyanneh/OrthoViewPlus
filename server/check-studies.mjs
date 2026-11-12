import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'data', 'orthoviewplus.db');
const db = new Database(dbPath);

console.log('=== IMAGING_STUDIES ===');
const studies = db.prepare('SELECT id, patient_id, orthanc_study_id, imaging_request_id, modality, study_date, description FROM imaging_studies LIMIT 10').all();
console.log(studies);

console.log('\n=== PATIENT_DICOM_MAPPINGS ===');
const mappings = db.prepare('SELECT id, patient_mrn, orthanc_patient_id, verified_at FROM patient_dicom_mappings LIMIT 10').all();
console.log(mappings);

console.log('\n=== USERS (Radiologists) ===');
const radiologists = db.prepare("SELECT id, username, full_name, role FROM users WHERE role='radiologist'").all();
console.log(radiologists);

db.close();
