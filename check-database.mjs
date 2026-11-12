import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'server', 'data', 'orthoviewplus.db');
const db = new Database(dbPath);

console.log('=== PATIENTS ===');
const patients = db.prepare('SELECT id, mrn, first_name, last_name FROM patients').all();
console.log(patients);

console.log('\n=== IMAGING REQUESTS ===');
const requests = db.prepare('SELECT id, patient_id, examination, modality, priority, status, assigned_radiologist_id FROM imaging_requests').all();
console.log(requests);

console.log('\n=== STUDIES ===');
const studies = db.prepare('SELECT id, patient_id, orthanc_study_id, imaging_request_id, modality, study_date, description FROM studies').all();
console.log(studies);

console.log('\n=== ORTHANC STUDIES (from patient_mappings) ===');
const mappings = db.prepare('SELECT id, patient_mrn, orthanc_patient_id, verified_at FROM patient_mappings').all();
console.log(mappings);

db.close();
