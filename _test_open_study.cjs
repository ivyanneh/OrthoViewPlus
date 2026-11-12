const http = require('http');

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const base = 'http://localhost:3001';

  // 1. Login as radiologist
  console.log('=== Step 1: Login as radiologist ===');
  const loginRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'radiologist', password: 'DemoRad2026!' });
  console.log('Login status:', loginRes.status);
  const loginData = JSON.parse(loginRes.body);
  const token = loginData.token;
  console.log('Radiologist ID:', loginData.user.id);

  // 2. Get imaging requests
  console.log('\n=== Step 2: Get imaging requests ===');
  const reqRes = await request({
    hostname: 'localhost', port: 3001, path: '/api/clinical/requests?mine=true', method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('Requests status:', reqRes.status);
  const reqData = JSON.parse(reqRes.body);
  const requests = reqData.requests || [];
  console.log('Number of requests:', requests.length);
  requests.forEach(r => console.log(`  Request ${r.id}: ${r.examination} (${r.modality}) status=${r.status} patientId=${r.patientId} assignedRadiologistId=${r.assignedRadiologistId}`));

  // Find a submitted/in_progress request that's assigned to this radiologist
  const assignedRequest = requests.find(r => Number(r.assignedRadiologistId) === 9);
  if (!assignedRequest) {
    console.log('No assigned request found for radiologist');
    return;
  }
  console.log('\nUsing request:', assignedRequest.id, assignedRequest.examination);

  // 3. Get patient history with the request ID
  console.log('\n=== Step 3: Get patient history ===');
  const histRes = await request({
    hostname: 'localhost', port: 3001,
    path: `/api/clinical/patients/${assignedRequest.patientId}?requestId=${assignedRequest.id}`, method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('History status:', histRes.status);
  const histData = JSON.parse(histRes.body);
  const patient = histData.patient;
  console.log('Patient:', patient.first_name, patient.last_name, 'MRN:', patient.mrn);
  const studies = histData.history?.studies || [];
  console.log('Studies:', studies.length);
  studies.forEach(s => console.log(`  Study ${s.id}: ${s.study_date} ${s.modality} ${s.description} orthancStudyId=${s.orthanc_study_id} imaging_request_id=${s.imaging_request_id}`));

  // Find linked study
  const linkedStudy = studies.find(s => s.imaging_request_id === assignedRequest.id || s.imagingRequestId === assignedRequest.id);
  if (!linkedStudy) {
    console.log('No linked study found for this request');
    return;
  }
  console.log('\nLinked study:', linkedStudy.id, 'orthancStudyId:', linkedStudy.orthanc_study_id);

  // 4. Get study profile from Orthanc via the imaging endpoint
  console.log('\n=== Step 4: Get study profile from Orthanc ===');
  const orthancId = linkedStudy.orthanc_study_id;
  const studyRes = await request({
    hostname: 'localhost', port: 3001,
    path: `/api/imaging/studies/${encodeURIComponent(orthancId)}`, method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('Study profile status:', studyRes.status);
  const studyData = JSON.parse(studyRes.body);
  console.log('Verification status:', studyData.verificationStatus);
  console.log('Warning:', studyData.warning);
  console.log('Source study ID:', studyData.sourceStudyId);
  console.log('Imaging request ID:', studyData.imagingRequestId);
  console.log('Patient record ID:', studyData.patientRecordId);
  console.log('Study profile keys:', Object.keys(studyData.study || {}));
  console.log('Series count:', (studyData.series || []).length);
  (studyData.series || []).forEach(s => console.log(`  Series ${s.id}: ${s.Modality} ${s.Description} instances=${s.instances?.length || 0}`));
  console.log('Linked patient:', studyData.linkedPatient);

  // 5. Try to render an instance
  if (studyData.series && studyData.series.length > 0 && studyData.series[0].instances && studyData.series[0].instances.length > 0) {
    const instanceId = studyData.series[0].instances[0];
    console.log('\n=== Step 5: Render instance ===');
    const renderRes = await request({
      hostname: 'localhost', port: 3001,
      path: `/api/imaging/instances/${encodeURIComponent(instanceId)}/rendered`, method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    }, null);
    console.log('Render status:', renderRes.status);
    console.log('Content-Type:', renderRes.headers['content-type']);
    console.log('Body length:', renderRes.body.length);
  }

  // 6. Check reports
  console.log('\n=== Step 6: Check reports ===');
  const reportsRes = await request({
    hostname: 'localhost', port: 3001,
    path: `/api/clinical/reports?patientId=${assignedRequest.patientId}`, method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('Reports status:', reportsRes.status);
  const reportsData = JSON.parse(reportsRes.body);
  console.log('Reports:', JSON.stringify(reportsData.reports || [], null, 2));
}

main().catch(e => console.error('Error:', e.message, e.stack));
