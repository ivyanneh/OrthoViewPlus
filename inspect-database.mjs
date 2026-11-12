import Database from 'better-sqlite3';
const db = new Database('c:\\Users\\ivymu\\OrthoViewPlus\\server\\data\\orthoviewplus.db');

console.log('=== USERS ===');
const users = db.prepare('SELECT id, username, role, full_name, department, status FROM users').all();
users.forEach(r => console.log(JSON.stringify(r)));

console.log('\n=== PATIENTS ===');
const patients = db.prepare('SELECT * FROM patients').all();
patients.forEach(r => console.log(JSON.stringify(r)));

console.log('\n=== APPOINTMENTS ===');
const appointments = db.prepare('SELECT * FROM appointments').all();
appointments.forEach(r => console.log(JSON.stringify(r)));

console.log('\n=== IMAGING REQUESTS ===');
const requests = db.prepare('SELECT * FROM imaging_requests').all();
requests.forEach(r => console.log(JSON.stringify(r)));

console.log('\n=== IMAGING STUDIES ===');
const studies = db.prepare('SELECT * FROM imaging_studies').all();
studies.forEach(r => console.log(JSON.stringify(r)));

console.log('\n=== MAPPINGS ===');
const mappings = db.prepare('SELECT * FROM patient_dicom_mappings').all();
mappings.forEach(r => console.log(JSON.stringify(r)));