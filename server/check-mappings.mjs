import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'data', 'orthoviewplus.db');
const db = new Database(dbPath);

console.log('=== PATIENT_DICOM_MAPPINGS COLUMNS ===');
const columns = db.prepare("PRAGMA table_info(patient_dicom_mappings)").all();
console.log(columns);

console.log('\n=== PATIENT_DICOM_MAPPINGS DATA ===');
const mappings = db.prepare('SELECT * FROM patient_dicom_mappings LIMIT 5').all();
console.log(mappings);

db.close();
