const Database = require('better-sqlite3');

const db = new Database('./data/orthoviewplus.db', {
  readonly: true,
  fileMustExist: true
});

try {
  const mappings = db.prepare(`
    SELECT m.patient_id,
           p.first_name || ' ' || p.last_name AS patient,
           m.orthanc_patient_id,
           m.status
    FROM patient_dicom_mappings m
    JOIN patients p ON p.id = m.patient_id
    WHERE m.patient_id BETWEEN 8 AND 14
    ORDER BY m.patient_id
  `).all();

  const links = db.prepare(`
    SELECT s.imaging_request_id AS request_id,
           s.patient_id,
           p.first_name || ' ' || p.last_name AS patient,
           s.orthanc_study_id
    FROM imaging_studies s
    JOIN patients p ON p.id = s.patient_id
    WHERE s.imaging_request_id BETWEEN 5 AND 20
    ORDER BY s.imaging_request_id
  `).all();

  const integrity = db.pragma('integrity_check');

  console.log('\n========== VERIFIED PATIENT MAPPINGS ==========');
  console.table(mappings);
  console.log('Mapping count:', mappings.length);

  console.log('\n========== SAVED IMAGING STUDY LINKS ==========');
  console.table(links);
  console.log('Linked study count:', links.length);

  const expectedRequests = Array.from({ length: 16 }, (_, i) => i + 5);
  const actualRequests = links.map(link => link.request_id);
  const missingRequests = expectedRequests.filter(id => !actualRequests.includes(id));

  console.log('\n========== FINAL VERIFICATION ==========');
  console.log({
    syntheticPatientsMapped: mappings.length === 7,
    allMappingsVerified: mappings.every(m => m.status === 'verified'),
    linkedStudies: links.length,
    allRequests5To20Linked: missingRequests.length === 0,
    missingRequests,
    databaseIntegrity: integrity[0].integrity_check
  });
} finally {
  db.close();
}
