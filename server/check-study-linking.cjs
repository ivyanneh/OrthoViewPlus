const Database = require('better-sqlite3');

try {
  const db = new Database('./data/orthoviewplus.db', {
    readonly: true,
    fileMustExist: true
  });

  const mappings = db.prepare(`
    SELECT patient_id, orthanc_patient_id, status
    FROM patient_dicom_mappings
    WHERE patient_id BETWEEN 10 AND 14
    ORDER BY patient_id
  `).all();

  const links = db.prepare(`
    SELECT patient_id, imaging_request_id, orthanc_study_id
    FROM imaging_studies
    WHERE imaging_request_id BETWEEN 5 AND 20
    ORDER BY imaging_request_id
  `).all();

  console.log('\n--- MAPPINGS FOR PATIENTS 10–14 ---');
  console.table(mappings);
  console.log('Mapping count:', mappings.length);

  console.log('\n--- STUDY LINKS FOR REQUESTS 5–20 ---');
  console.table(links);
  console.log('Link count:', links.length);

  db.close();
} catch (error) {
  console.error('READ-ONLY CHECK FAILED:', error.message);
  process.exitCode = 1;
}
