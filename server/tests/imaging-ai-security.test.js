
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';

import { createDatabase } from '../src/db.js';
import { createAiRouter } from '../src/routes/ai.js';
import { createAdminRouter } from '../src/routes/admin.js';
import { createImagingRouter } from '../src/routes/imaging.js';
import { createCompareRouter } from '../src/routes/compare.js';
import { createExposureRouter } from '../src/routes/exposure.js';
import { createClinicalRouter } from '../src/routes/clinical.js';
import { createDashboardRouter } from '../src/routes/dashboard.js';
import { createAppointmentService } from '../src/services/appointments.js';
import { createNotificationService } from '../src/services/notifications.js';
import { createReportService } from '../src/services/reports.js';
import { createAiJobService } from '../src/services/aiJobs.js';
import { resolveResultFile, writeResultFile } from '../src/services/aiClient.js';
import { createPatientMappingService } from '../src/services/patientMappings.js';
import { createRequestService } from '../src/services/requests.js';
import { createStudyService } from '../src/services/studies.js';
import { createPatientService } from '../src/services/patients.js';
import { createUserService } from '../src/services/users.js';
import { createAuthMiddleware, createRoleMiddleware } from '../src/middleware/auth.js';

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orthoviewplus-security-'));
  const db = createDatabase(path.join(directory, 'test.db'));

  const insertUser = db.prepare(
    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
  );

  const adminId = insertUser.run('admin', 'test-hash', 'administrator').lastInsertRowid;
  const radiologistId = insertUser.run('radiologist-a', 'test-hash', 'radiologist').lastInsertRowid;
  const otherRadiologistId = insertUser.run('radiologist-b', 'test-hash', 'radiologist').lastInsertRowid;
  const practitionerId = insertUser.run('practitioner', 'test-hash', 'practitioner').lastInsertRowid;
  const otherPractitionerId = insertUser.run('practitioner-b', 'test-hash', 'practitioner').lastInsertRowid;

  const patientId = db.prepare(
    `INSERT INTO patients (mrn, first_name, last_name, created_by)
     VALUES ('TEST-001', 'Test', 'Patient', ?)`,
  ).run(adminId).lastInsertRowid;

  const secondPatientId = db.prepare(
    `INSERT INTO patients (mrn, first_name, last_name, created_by)
     VALUES ('TEST-002', 'Other', 'Patient', ?)`,
  ).run(adminId).lastInsertRowid;

  const insertRequest = db.prepare(
    `INSERT INTO imaging_requests (patient_id, requested_by, assigned_radiologist_id, examination, modality)
     VALUES (?, ?, ?, 'CT', 'CT')`,
  );

  const assignedRequestId = insertRequest.run(patientId, practitionerId, radiologistId).lastInsertRowid;
  const otherRequestId = insertRequest.run(patientId, practitionerId, otherRadiologistId).lastInsertRowid;
  const secondPatientRequestId = insertRequest.run(secondPatientId, practitionerId, otherRadiologistId).lastInsertRowid;

  const insertStudy = db.prepare(
    `INSERT INTO imaging_studies (patient_id, imaging_request_id, orthanc_study_id, description)
     VALUES (?, ?, ?, 'Test study')`,
  );

  const assignedStudyId = insertStudy.run(patientId, assignedRequestId, 'orthanc-study-a').lastInsertRowid;
  const otherStudyId = insertStudy.run(patientId, otherRequestId, 'orthanc-study-b').lastInsertRowid;

  insertStudy.run(secondPatientId, secondPatientRequestId, 'orthanc-study-c');

  const mappings = createPatientMappingService(db);

  const pendingMapping = mappings.create({
    patientId,
    orthancPatientId: 'dicom-patient-a',
    verifiedBy: adminId,
  });

  const secondMapping = mappings.create({
    patientId: secondPatientId,
    orthancPatientId: 'dicom-patient-b',
    verifiedBy: adminId,
  });

  // Fixture-only verified mappings for access-control tests.
  // Actual administrator verification is tested separately through Orthanc.
  const markFixtureMappingVerified = db.prepare(
    `UPDATE patient_dicom_mappings
     SET status = 'verified'
     WHERE id = ?`,
  );

  markFixtureMappingVerified.run(pendingMapping.id);
  markFixtureMappingVerified.run(secondMapping.id);

  return {
    directory,
    db,
    adminId,
    radiologistId,
    otherRadiologistId,
    practitionerId,
    otherPractitionerId,
    patientId,
    secondPatientId,
    assignedStudyId,
    otherStudyId,
    mappings,
    studies: createStudyService(db),
    patients: createPatientService(db),
  };
}

test('practitioner patient and appointment APIs are scoped to their clinical workflow', async () => {
  const fixture = createFixture();

  try {
    const unrelatedPatientId = fixture.db.prepare(
      `INSERT INTO patients (mrn, first_name, last_name, created_by)
       VALUES ('UNRELATED-003', 'Unrelated', 'Patient', ?)`,
    ).run(fixture.otherPractitionerId).lastInsertRowid;

    const appointments = createAppointmentService(fixture.db);

    appointments.create({
      patientId: fixture.patientId,
      requestedBy: fixture.practitionerId,
      createdBy: fixture.practitionerId,
      date: '2026-11-04',
      time: '10:00',
      examination: 'CT',
      modality: 'CT',
    });

    const unrelatedAppointment = appointments.create({
      patientId: unrelatedPatientId,
      requestedBy: fixture.otherPractitionerId,
      createdBy: fixture.otherPractitionerId,
      date: '2026-11-04',
      time: '11:00',
      examination: 'MR',
      modality: 'MR',
    });

    const router = createClinicalRouter({
      patients: fixture.patients,
      appointments,
      requests: createRequestService(fixture.db),
      reports: { list() { return []; } },
      studies: fixture.studies,
      notifications: {},
      audit: { log() {} },
      users: { list() { return []; } },
    });

    const user = {
      id: fixture.practitionerId,
      role: 'practitioner',
      username: 'practitioner',
    };

    const patientList = await requestWithUser(router, user, 'GET', '/patients');

    assert.ok(patientList.body.patients.some(
      (patient) => Number(patient.id) === Number(fixture.patientId),
    ));

    assert.ok(!patientList.body.patients.some(
      (patient) => Number(patient.id) === Number(unrelatedPatientId),
    ));

    assert.equal(
      (await requestWithUser(router, user, 'GET', `/patients/${unrelatedPatientId}`)).status,
      403,
    );

    const appointmentList = await requestWithUser(router, user, 'GET', '/appointments');

    assert.ok(appointmentList.body.appointments.length > 0);

    assert.ok(appointmentList.body.appointments.every(
      (item) => Number(item.requestedBy) === Number(user.id),
    ));

    assert.ok(!appointmentList.body.appointments.some(
      (item) => Number(item.id) === Number(unrelatedAppointment.id),
    ));

    assert.equal((await requestWithUser(router, user, 'POST', '/requests', {
      patientId: unrelatedPatientId,
      examination: 'MRI',
      modality: 'MR',
    })).status, 403);

    assert.equal((await requestWithUser(router, user, 'POST', '/appointments', {
      patientId: unrelatedPatientId,
      date: '2026-11-05',
      time: '12:00',
      examination: 'MRI',
      modality: 'MR',
    })).status, 403);

    const registration = await requestWithUser(router, user, 'POST', '/patients', {
      mrn: 'PRACTITIONER-004',
      firstName: 'New',
      lastName: 'Patient',
    });

    assert.equal(registration.status, 201);

    assert.equal((await requestWithUser(router, user, 'POST', '/requests', {
      patientId: registration.body.patient.id,
      examination: 'MRI',
      modality: 'MR',
    })).status, 201);

    assert.equal((await requestWithUser(router, user, 'POST', '/appointments', {
      patientId: registration.body.patient.id,
      date: '2026-11-06',
      time: '13:00',
      examination: 'MRI',
      modality: 'MR',
    })).status, 201);
  } finally {
    closeFixture(fixture);
  }
});

test('practitioner report lists only approved reports for studies in their workflow', async () => {
  const fixture = createFixture();

  try {
    const unrelatedPatientId = fixture.db.prepare(
      `INSERT INTO patients (mrn, first_name, last_name, created_by)
       VALUES ('TEST-003', 'Unrelated', 'Patient', ?)`,
    ).run(fixture.adminId).lastInsertRowid;

    const otherPractitionerRequest = fixture.db.prepare(
      `INSERT INTO imaging_requests (patient_id, requested_by, assigned_radiologist_id, examination, modality)
       VALUES (?, ?, ?, 'Other study', 'CT')`,
    ).run(unrelatedPatientId, fixture.otherPractitionerId, fixture.otherRadiologistId);

    const otherPractitionerStudy = fixture.db.prepare(
      `INSERT INTO imaging_studies (patient_id, imaging_request_id, orthanc_study_id, description)
       VALUES (?, ?, 'orthanc-study-other-practitioner', 'Other practitioner study')`,
    ).run(unrelatedPatientId, otherPractitionerRequest.lastInsertRowId);

    fixture.db.prepare(
      `INSERT INTO radiology_reports (
         imaging_study_id, patient_id, imaging_request_id, radiologist_id, findings, impression, status
       ) VALUES (?, ?, ?, ?, 'Restricted report', 'Restricted impression', 'approved')`,
    ).run(
      otherPractitionerStudy.lastInsertRowId,
      unrelatedPatientId,
      otherPractitionerRequest.lastInsertRowId,
      fixture.otherRadiologistId,
    );

    const ownReport = fixture.db.prepare(
      `INSERT INTO radiology_reports (
         imaging_study_id, patient_id, imaging_request_id, radiologist_id, findings, impression, status
       ) VALUES (?, ?, ?, ?, 'Own report', 'Own impression', 'approved')`,
    ).run(
      fixture.assignedStudyId,
      fixture.patientId,
      fixture.db.prepare(
        'SELECT imaging_request_id FROM imaging_studies WHERE id = ?',
      ).get(fixture.assignedStudyId).imaging_request_id,
      fixture.radiologistId,
    );

    const router = createClinicalRouter({
      patients: fixture.patients,
      appointments: createAppointmentService(fixture.db),
      requests: createRequestService(fixture.db),
      reports: createReportService(fixture.db),
      studies: fixture.studies,
      notifications: createNotificationService(fixture.db),
      audit: { log() {} },
      users: {},
    });

    const practitioner = {
      id: fixture.practitionerId,
      role: 'practitioner',
      username: 'practitioner',
    };

    const response = await requestWithUser(router, practitioner, 'GET', '/reports');

    assert.equal(response.status, 200);

    assert.ok(response.body.reports.some(
      (report) => Number(report.id) === Number(ownReport.lastInsertRowid),
    ));

    assert.ok(response.body.reports.every(
      (report) => Number(report.patientId) === Number(fixture.patientId)
        && report.status === 'approved',
    ));
  } finally {
    closeFixture(fixture);
  }
});

test('approving a report notifies only the practitioner who requested that study', () => {
  const fixture = createFixture();

  try {
    const notifications = createNotificationService(fixture.db);
    const reports = createReportService(fixture.db, { notifications });
    const study = fixture.studies.get(fixture.assignedStudyId);

    const report = reports.saveDraft({
      patientId: fixture.patientId,
      imagingStudyId: study.id,
      imagingRequestId: study.imagingRequestId,
      radiologistId: fixture.radiologistId,
      findings: 'Demonstration finding',
      impression: 'Demonstration impression',
    });

    reports.approve(report.id, fixture.radiologistId);

    assert.equal(notifications.unreadCount(fixture.practitionerId), 1);
    assert.equal(notifications.unreadCount(fixture.otherPractitionerId), 0);

    const notice = notifications.listForUser(fixture.practitionerId)[0];

    assert.equal(notice.resourceId, String(report.id));
    assert.equal(notice.resourceType, 'report');
  } finally {
    closeFixture(fixture);
  }
});

test('recent audit dashboard data is only returned to administrators', async () => {
  const router = createDashboardRouter({
    orthanc: {
      async getDashboardSummary() {
        return { connected: true };
      },
    },
    audit: {
      log() {},
      list() {
        return { entries: [{ id: 1, action: 'sensitive_activity' }] };
      },
    },
  });

  const administrator = await requestWithUser(
    router,
    { id: 1, role: 'administrator' },
    'GET',
    '/',
  );

  const practitioner = await requestWithUser(
    router,
    { id: 2, role: 'practitioner' },
    'GET',
    '/',
  );

  assert.equal(administrator.body.recentAudit.length, 1);
  assert.deepEqual(practitioner.body.recentAudit, []);
});

function closeFixture(fixture) {
  fixture.db.close();
  fs.rmSync(fixture.directory, { recursive: true, force: true });
}

async function requestWithUser(router, user, method, route, body) {
  const app = express();

  app.use(express.json());

  app.use((req, _res, next) => {
    req.user = user;
    next();
  });

  app.use(router);

  const server = app.listen(0, '127.0.0.1');

  await new Promise((resolve) => server.once('listening', resolve));

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}${route}`,
      {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );

    const responseBody = response.headers.get('content-type')?.includes('application/json')
      ? await response.json()
      : await response.text();

    return { status: response.status, body: responseBody };
  } finally {
    await new Promise((resolve, reject) => server.close(
      (error) => error ? reject(error) : resolve(),
    ));
  }
}

async function requestWithAiAuthorization(router, fixture, user, method, route, body) {
  const app = express();
  const jwtSecret = 'test-ai-authorization-secret';
  const users = createUserService(fixture.db);

  app.use(express.json());
  app.use(createAuthMiddleware(jwtSecret, { getAuthState: users.getAuthState }));
  app.use(createRoleMiddleware('radiologist'));
  app.use(router);

  const server = app.listen(0, '127.0.0.1');

  await new Promise((resolve) => server.once('listening', resolve));

  try {
    const headers = {};

    if (user) {
      headers.Authorization = `Bearer ${jwt.sign(
        {},
        jwtSecret,
        { subject: String(user.id) },
      )}`;
    }

    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    const response = await fetch(
      `http://127.0.0.1:${server.address().port}${route}`,
      {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );

    const responseBody = response.headers.get('content-type')?.includes('application/json')
      ? await response.json()
      : await response.text();

    return { status: response.status, body: responseBody };
  } finally {
    await new Promise((resolve, reject) => server.close(
      (error) => error ? reject(error) : resolve(),
    ));
  }
}

async function requestWithAdministratorRole(router, user, method, route, body) {
  const app = express();

  app.use(express.json());

  app.use((req, _res, next) => {
    req.user = user;
    next();
  });

  app.use(createRoleMiddleware('administrator'));
  app.use(router);

  const server = app.listen(0, '127.0.0.1');

  await new Promise((resolve) => server.once('listening', resolve));

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}${route}`,
      {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );

    const responseBody = response.headers.get('content-type')?.includes('application/json')
      ? await response.json()
      : await response.text();

    return { status: response.status, body: responseBody };
  } finally {
    await new Promise((resolve, reject) => server.close(
      (error) => error ? reject(error) : resolve(),
    ));
  }
}

function createMockOrthanc({ dicomPatientIds = {} } = {}) {
  const studies = [
    { id: 'orthanc-study-a', patientId: 'dicom-patient-a' },
    { id: 'orthanc-study-b', patientId: 'dicom-patient-a' },
    { id: 'orthanc-study-c', patientId: 'dicom-patient-b' },
    { id: 'orthanc-study-d', patientId: 'dicom-patient-new' },
  ];

  const defaultPatientIds = {
    'dicom-patient-a': 'TEST-001',
    'dicom-patient-b': 'TEST-002',
    'dicom-patient-new': 'TEST-001',
  };

  const patientIds = {
    ...defaultPatientIds,
    ...dicomPatientIds,
  };

  return {
    async findPatientByDicomPatientId(id) {
      const PatientID = patientIds[id];

      if (!PatientID) return null;

      return {
        ID: `orthanc-${id}`,
        PatientID,
      };
    },

    async listStudies() {
      return studies;
    },

    async getHealth() {
      return { connected: true };
    },

    async getOrthancStatus() {
      return { connected: true };
    },

    async getStudyProfile(id) {
      const selected = studies.find((study) => study.id === id);
      const modality = selected?.patientId === 'dicom-patient-new' ? 'MR' : 'CT';

      return {
        id,
        patientId: selected?.patientId,
        modalitiesInStudy: modality,
        primarySeries: { modality },
        studyDescription: `Study ${id}`,
      };
    },

    async listSeriesForStudy() {
      return [];
    },

    async getInstance(id) {
      const parentStudy = id === 'instance-b' || id === 'prior-b'
        ? 'orthanc-study-b'
        : id === 'prior-allowed'
          ? 'orthanc-study-prior'
          : id === 'instance-c'
            ? 'orthanc-study-c'
            : 'orthanc-study-a';

      return { ID: id, ParentStudy: parentStudy };
    },

    async getInstanceStudy(id) {
      const instance = await this.getInstance(id);
      const tags = await this.getInstanceTags(id);

      return {
        orthancStudyId: instance.ParentStudy,
        patientId: tags.PatientID,
      };
    },

    async getInstanceTags(id) {
      return {
        PatientID: id === 'instance-c' || id === 'prior-c'
          ? 'dicom-patient-b'
          : 'dicom-patient-a',
      };
    },

    async getInstancePreview() {
      return {
        buffer: Buffer.from('preview'),
        contentType: 'image/jpeg',
      };
    },

    async getInstanceRendered() {
      return {
        buffer: Buffer.from('rendered'),
        contentType: 'image/png',
      };
    },

    async getSeries(id) {
      return {
        ParentStudy: id === 'series-b' ? 'orthanc-study-b' : 'orthanc-study-a',
        Instances: id === 'series-many'
          ? Array.from({ length: 199 }, (_, index) => `series-${index}`)
          : ['instance-a'],
      };
    },
  };
}

test('study comparison lists and compares only linked, verified studies assigned to the user', async () => {
  const fixture = createFixture();

  try {
    const orthanc = createMockOrthanc();

    const router = createCompareRouter({
      orthanc,
      audit: { log() {} },
      studies: fixture.studies,
      patientMappings: fixture.mappings,
    });

    const radiologist = {
      id: fixture.radiologistId,
      role: 'radiologist',
      username: 'radiologist-a',
    };

    const practitioner = {
      id: fixture.practitionerId,
      role: 'practitioner',
      username: 'practitioner',
    };

    const administrator = {
      id: fixture.adminId,
      role: 'administrator',
      username: 'admin',
    };

    const radiologistStudies = await requestWithUser(router, radiologist, 'GET', '/studies');

    assert.equal(radiologistStudies.status, 200);
    assert.deepEqual(
      radiologistStudies.body.studies.map((study) => study.id),
      ['orthanc-study-a'],
    );

    assert.equal((await requestWithUser(
      router,
      radiologist,
      'GET',
      '/compare?leftStudyId=orthanc-study-a&rightStudyId=orthanc-study-b',
    )).status, 403);

    assert.equal((await requestWithUser(
      router,
      radiologist,
      'GET',
      '/compare?leftStudyId=orthanc-study-a&rightStudyId=orthanc-study-d',
    )).status, 403);

    const samePatientComparison = await requestWithUser(
      router,
      practitioner,
      'GET',
      '/compare?leftStudyId=orthanc-study-a&rightStudyId=orthanc-study-b',
    );

    assert.equal(samePatientComparison.status, 200);
    assert.equal(samePatientComparison.body.comparison.left.patientId, 'dicom-patient-a');

    const otherPatientComparison = await requestWithUser(
      router,
      practitioner,
      'GET',
      '/compare?leftStudyId=orthanc-study-a&rightStudyId=orthanc-study-c',
    );

    assert.equal(otherPatientComparison.status, 409);
    assert.equal(
      (await requestWithUser(router, administrator, 'GET', '/studies')).status,
      403,
    );
  } finally {
    closeFixture(fixture);
  }
});

test('exposure index returns only rows for linked, verified, user-assigned studies', async () => {
  const fixture = createFixture();

  try {
    const orthanc = createMockOrthanc();

    orthanc.getExposureIndexRows = async () => [
      { id: 'a', orthancStudyId: 'orthanc-study-a', patientId: 'dicom-patient-a' },
      { id: 'b', orthancStudyId: 'orthanc-study-b', patientId: 'dicom-patient-a' },
      { id: 'c', orthancStudyId: 'orthanc-study-c', patientId: 'dicom-patient-b' },
      { id: 'd', orthancStudyId: 'orthanc-study-d', patientId: 'dicom-patient-new' },
    ];

    const router = createExposureRouter({
      orthanc,
      audit: { log() {} },
      studies: fixture.studies,
      patientMappings: fixture.mappings,
    });

    const radiologist = { id: fixture.radiologistId, role: 'radiologist' };
    const practitioner = { id: fixture.practitionerId, role: 'practitioner' };

    const radiologistRows = await requestWithUser(router, radiologist, 'GET', '/');

    assert.deepEqual(
      radiologistRows.body.rows.map((row) => row.id),
      ['a'],
    );

    const practitionerRows = await requestWithUser(router, practitioner, 'GET', '/');

    assert.deepEqual(
      practitionerRows.body.rows.map((row) => row.id),
      ['a', 'b', 'c'],
    );
  } finally {
    closeFixture(fixture);
  }
});

test('radiologist imaging access is tied to the exact linked request and study', async () => {
  const fixture = createFixture();

  try {
    const orthanc = createMockOrthanc();

    const router = createImagingRouter({
      orthanc,
      studies: fixture.studies,
      patients: {},
      patientMappings: fixture.mappings,
      audit: { log() {} },
    });

    const user = {
      id: fixture.radiologistId,
      role: 'radiologist',
      username: 'radiologist-a',
    };

    const deniedStudy = await requestWithUser(router, user, 'GET', '/studies/orthanc-study-b');
    assert.equal(deniedStudy.status, 403);

    const deniedPreview = await requestWithUser(router, user, 'GET', '/instances/instance-b/preview');
    assert.equal(deniedPreview.status, 403);

    const deniedRendered = await requestWithUser(router, user, 'GET', '/instances/instance-b/rendered');
    assert.equal(deniedRendered.status, 403);

    const deniedTags = await requestWithUser(router, user, 'GET', '/instances/instance-b/tags');
    assert.equal(deniedTags.status, 403);

    const list = await requestWithUser(router, user, 'GET', '/studies/');

    assert.equal(list.status, 200);
    assert.deepEqual(list.body.studies.map((study) => study.id), ['orthanc-study-a']);

    const allowedStudy = await requestWithUser(router, user, 'GET', '/studies/orthanc-study-a');

    assert.equal(allowedStudy.status, 200);
    assert.equal(allowedStudy.body.sourceStudyId, fixture.assignedStudyId);

    assert.equal(
      (await requestWithUser(router, user, 'GET', '/instances/instance-a/preview')).status,
      200,
    );

    assert.equal(
      (await requestWithUser(router, user, 'GET', '/instances/instance-a/rendered')).status,
      200,
    );

    assert.equal(
      (await requestWithUser(router, user, 'GET', '/instances/instance-a/tags')).status,
      200,
    );

    const admin = { id: fixture.adminId, role: 'administrator' };

    assert.equal(
      (await requestWithUser(router, admin, 'GET', '/studies/orthanc-study-b')).status,
      200,
    );

    const practitioner = { id: fixture.practitionerId, role: 'practitioner' };

    assert.equal(
      (await requestWithUser(router, practitioner, 'GET', '/studies/orthanc-study-b')).status,
      200,
    );
  } finally {
    closeFixture(fixture);
  }
});

test('only administrators can explicitly link an Orthanc study to an exactly matching request', async () => {
  const fixture = createFixture();

  try {
    const orthanc = createMockOrthanc();

    const router = createImagingRouter({
      orthanc,
      studies: fixture.studies,
      patients: {},
      patientMappings: fixture.mappings,
      requests: createRequestService(fixture.db),
      audit: { log() {} },
    });

    const assignedRequest = fixture.db.prepare(
      'SELECT id FROM imaging_requests WHERE assigned_radiologist_id = ?',
    ).get(fixture.radiologistId);

    const administrator = {
      id: fixture.adminId,
      role: 'administrator',
      username: 'admin',
    };

    const radiologist = {
      id: fixture.radiologistId,
      role: 'radiologist',
      username: 'radiologist-a',
    };

    const wrongModalityRequest = fixture.db.prepare(
      `INSERT INTO imaging_requests (patient_id, requested_by, assigned_radiologist_id, examination, modality)
       VALUES (?, ?, ?, 'Brain MR', 'MR')`,
    ).run(fixture.patientId, fixture.practitionerId, fixture.radiologistId);

    const wrongModality = await requestWithUser(
      router,
      administrator,
      'POST',
      '/studies/orthanc-study-a/link',
      { requestId: wrongModalityRequest.lastInsertRowid },
    );

    assert.equal(wrongModality.status, 409);

    assert.equal((await requestWithUser(
      router,
      radiologist,
      'POST',
      '/studies/orthanc-study-a/link',
      { requestId: assignedRequest.id },
    )).status, 403);

    const linked = await requestWithUser(
      router,
      administrator,
      'POST',
      '/studies/orthanc-study-a/link',
      { requestId: assignedRequest.id },
    );

    assert.equal(linked.status, 200);
    assert.equal(linked.body.study.imagingRequestId, assignedRequest.id);

    const linkedAgain = await requestWithUser(
      router,
      administrator,
      'POST',
      '/studies/orthanc-study-a/link',
      { requestId: assignedRequest.id },
    );

    assert.equal(linkedAgain.status, 200);

    assert.equal(
      fixture.db.prepare(
        'SELECT COUNT(*) AS count FROM imaging_studies WHERE orthanc_study_id = ?',
      ).get('orthanc-study-a').count,
      1,
    );

    const otherPatientRequest = fixture.db.prepare(
      'SELECT id FROM imaging_requests WHERE patient_id = ?',
    ).get(fixture.secondPatientId);

    const mismatched = await requestWithUser(
      router,
      administrator,
      'POST',
      '/studies/orthanc-study-a/link',
      { requestId: otherPatientRequest.id },
    );

    assert.equal(mismatched.status, 409);
  } finally {
    closeFixture(fixture);
  }
});

test('administrator DICOM mapping workflow verifies only PatientIDs present in Orthanc', async () => {
  const fixture = createFixture();

  try {
    const orthanc = createMockOrthanc();

    const patientMappings = createPatientMappingService(fixture.db, {
      audit: { log() {} },
      orthanc,
    });

    const router = createAdminRouter({
      db: fixture.db,
      audit: { log() {}, list() { return { entries: [] }; } },
      users: {},
      schedule: {},
      alerts: {},
      orthanc,
      patientMappings,
      patients: fixture.patients,
    });

    const administrator = {
      id: fixture.adminId,
      role: 'administrator',
      username: 'admin',
    };

    const created = await requestWithUser(
      router,
      administrator,
      'POST',
      '/patient-mappings',
      {
        patientId: fixture.patientId,
        orthancPatientId: 'dicom-patient-new',
      },
    );

    assert.equal(created.status, 201);
    assert.equal(created.body.mapping.status, 'pending');

    const missingIdentity = await requestWithUser(
      router,
      administrator,
      'POST',
      '/patient-mappings',
      {
        patientId: fixture.patientId,
        orthancPatientId: 'not-in-orthanc',
      },
    );

    assert.equal(missingIdentity.status, 404);

    const verified = await requestWithUser(
      router,
      administrator,
      'POST',
      `/patient-mappings/${created.body.mapping.id}/verify`,
    );

    assert.equal(verified.status, 200);
    assert.equal(verified.body.mapping.status, 'verified');
  } finally {
    closeFixture(fixture);
  }
});

test('administrator patient management searches, registers, edits, archives, and audits without changing existing patients', async () => {
  const fixture = createFixture();
  const auditEntries = [];

  try {
    const router = createAdminRouter({
      db: fixture.db,
      audit: {
        log(entry) {
          auditEntries.push(entry);
        },
        list() {
          return { entries: [] };
        },
      },
      users: {},
      patients: fixture.patients,
      schedule: {},
      alerts: {},
      orthanc: createMockOrthanc(),
      patientMappings: fixture.mappings,
    });

    const administrator = {
      id: fixture.adminId,
      role: 'administrator',
      username: 'admin',
    };

    const practitioner = {
      id: fixture.practitionerId,
      role: 'practitioner',
      username: 'practitioner',
    };

    const radiologist = {
      id: fixture.radiologistId,
      role: 'radiologist',
      username: 'radiologist-a',
    };

    const existingPatients = fixture.patients.search({ status: 'all' });

    const searched = await requestWithAdministratorRole(
      router,
      administrator,
      'GET',
      '/patients?q=TEST-001&status=all',
    );

    assert.equal(searched.status, 200);
    assert.deepEqual(searched.body.patients.map((patient) => patient.mrn), ['TEST-001']);

    const registered = await requestWithAdministratorRole(
      router,
      administrator,
      'POST',
      '/patients',
      {
        mrn: 'DEMO-IVY-TEST-003',
        firstName: 'Ivy',
        lastName: 'Test',
        notes: 'De-identified demonstration record; not a real patient.',
      },
    );

    assert.equal(registered.status, 201);
    assert.notEqual(String(registered.body.patient.id), 'dicom-patient-new');
    assert.equal(registered.body.patient.dateOfBirth, null);
    assert.equal(registered.body.patient.sex, null);

    const duplicate = await requestWithAdministratorRole(
      router,
      administrator,
      'POST',
      '/patients',
      {
        mrn: 'demo-ivy-test-003',
        firstName: 'Ivy',
        lastName: 'Test',
      },
    );

    assert.equal(duplicate.status, 409);

    const details = await requestWithAdministratorRole(
      router,
      administrator,
      'GET',
      `/patients/${registered.body.patient.id}`,
    );

    assert.equal(details.status, 200);
    assert.equal(
      details.body.patient.notes,
      'De-identified demonstration record; not a real patient.',
    );

    const updated = await requestWithAdministratorRole(
      router,
      administrator,
      'PATCH',
      `/patients/${registered.body.patient.id}`,
      { notes: 'Updated demo label.' },
    );

    assert.equal(updated.status, 200);
    assert.equal(updated.body.patient.notes, 'Updated demo label.');

    const archived = await requestWithAdministratorRole(
      router,
      administrator,
      'PATCH',
      `/patients/${registered.body.patient.id}/status`,
      { status: 'archived' },
    );

    assert.equal(archived.body.patient.status, 'archived');

    const activated = await requestWithAdministratorRole(
      router,
      administrator,
      'PATCH',
      `/patients/${registered.body.patient.id}/status`,
      { status: 'active' },
    );

    assert.equal(activated.body.patient.status, 'active');

    for (const user of [practitioner, radiologist]) {
      assert.equal(
        (await requestWithAdministratorRole(router, user, 'GET', '/patients')).status,
        403,
      );

      assert.equal((await requestWithAdministratorRole(
        router,
        user,
        'POST',
        '/patients',
        {
          mrn: 'NOT-ALLOWED',
          firstName: 'No',
          lastName: 'Access',
        },
      )).status, 403);

      assert.equal((await requestWithAdministratorRole(
        router,
        user,
        'GET',
        `/patients/${fixture.patientId}`,
      )).status, 403);

      assert.equal((await requestWithAdministratorRole(
        router,
        user,
        'PATCH',
        `/patients/${fixture.patientId}`,
        { notes: 'Not allowed.' },
      )).status, 403);

      assert.equal((await requestWithAdministratorRole(
        router,
        user,
        'PATCH',
        `/patients/${fixture.patientId}/status`,
        { status: 'archived' },
      )).status, 403);
    }

    const afterPatients = fixture.patients.search({ status: 'all' });

    for (const original of existingPatients) {
      assert.ok(afterPatients.some(
        (patient) => patient.id === original.id && patient.mrn === original.mrn,
      ));
    }

    assert.deepEqual(
      auditEntries.map((entry) => entry.action),
      [
        'admin_patient_list',
        'admin_patient_create',
        'admin_patient_view',
        'admin_patient_update',
        'admin_patient_archive',
        'admin_patient_activate',
      ],
    );

    const internalIdSearch = await requestWithAdministratorRole(
      router,
      administrator,
      'GET',
      `/patients?q=${registered.body.patient.id}&status=all`,
    );

    assert.ok(internalIdSearch.body.patients.some(
      (patient) => patient.id === registered.body.patient.id,
    ));

    const nameSearch = await requestWithAdministratorRole(
      router,
      administrator,
      'GET',
      '/patients?q=Ivy+Test&status=all',
    );

    assert.ok(nameSearch.body.patients.some(
      (patient) => patient.id === registered.body.patient.id,
    ));
  } finally {
    closeFixture(fixture);
  }
});

test('verified Ivy Test mapping and matching request link the exact Orthanc study', async () => {
  const fixture = createFixture();
  const auditEntries = [];

  try {
    const orthanc = createMockOrthanc({
      dicomPatientIds: {
        'dicom-patient-new': 'DEMO-IVY-TEST-003',
      },
    });

    const patientMappings = createPatientMappingService(fixture.db, {
      audit: {
        log(entry) {
          auditEntries.push(entry);
        },
      },
      orthanc,
    });

    const administrator = {
      id: fixture.adminId,
      role: 'administrator',
      username: 'admin',
    };

    const ivy = fixture.patients.create({
      mrn: 'DEMO-IVY-TEST-003',
      firstName: 'Ivy',
      lastName: 'Test',
      notes: 'De-identified demonstration record; not a real patient.',
      createdBy: fixture.adminId,
    });

    const requests = createRequestService(fixture.db);

    const request = requests.create({
      patientId: ivy.id,
      requestedBy: fixture.adminId,
      examination: 'Brain MRI demonstration',
      modality: 'MR',
    });

    const adminRouter = createAdminRouter({
      db: fixture.db,
      audit: {
        log(entry) {
          auditEntries.push(entry);
        },
        list() {
          return { entries: [] };
        },
      },
      users: {},
      patients: fixture.patients,
      schedule: {},
      alerts: {},
      orthanc,
      patientMappings,
    });

    const created = await requestWithAdministratorRole(
      adminRouter,
      administrator,
      'POST',
      '/patient-mappings',
      {
        patientId: ivy.id,
        orthancPatientId: 'dicom-patient-new',
        patientName: 'Ivy Test',
      },
    );

    assert.equal(created.status, 201);
    assert.equal(created.body.mapping.status, 'pending');

    const verified = await requestWithAdministratorRole(
      adminRouter,
      administrator,
      'POST',
      `/patient-mappings/${created.body.mapping.id}/verify`,
    );

    assert.equal(verified.status, 200);
    assert.equal(verified.body.mapping.status, 'verified');
    assert.equal(verified.body.mapping.patientId, ivy.id);

    const imagingRouter = createImagingRouter({
      orthanc,
      studies: fixture.studies,
      patients: fixture.patients,
      patientMappings,
      requests,
      audit: {
        log(entry) {
          auditEntries.push(entry);
        },
      },
    });

    const linked = await requestWithUser(
      imagingRouter,
      administrator,
      'POST',
      '/studies/orthanc-study-d/link',
      { requestId: request.id },
    );

    assert.equal(linked.status, 200);
    assert.equal(linked.body.study.patientId, ivy.id);
    assert.equal(linked.body.study.imagingRequestId, request.id);
    assert.equal(linked.body.study.orthancStudyId, 'orthanc-study-d');

    assert.ok(auditEntries.some(
      (entry) => entry.action === 'orthanc_study_link',
    ));
  } finally {
    closeFixture(fixture);
  }
});

test('radiologist request lists separate assigned work from the unassigned queue and claims cannot reassign', () => {
  const fixture = createFixture();

  try {
    const requests = createRequestService(fixture.db);

    const assignedToMe = requests.list({
      assignedRadiologistId: fixture.radiologistId,
      assignedRadiologistOnly: true,
    });

    assert.ok(assignedToMe.length > 0);

    assert.ok(assignedToMe.every(
      (request) => Number(request.assignedRadiologistId) === Number(fixture.radiologistId),
    ));

    const queue = requests.list({
      assignedRadiologistId: fixture.radiologistId,
    });

    assert.ok(queue.every(
      (request) => !request.assignedRadiologistId
        || Number(request.assignedRadiologistId) === Number(fixture.radiologistId),
    ));

    const otherAssignedRequest = fixture.db.prepare(
      'SELECT id FROM imaging_requests WHERE assigned_radiologist_id = ?',
    ).get(fixture.otherRadiologistId);

    assert.throws(
      () => requests.assign(otherAssignedRequest.id, fixture.radiologistId),
      (error) => error.status === 409,
    );
  } finally {
    closeFixture(fixture);
  }
});

test('AI creation checks exact study assignment and derives patient identity from DICOM', async () => {
  const fixture = createFixture();

  try {
    const orthanc = createMockOrthanc();
    const getInstance = orthanc.getInstance.bind(orthanc);

    orthanc.getInstance = async (id) => {
      const instance = await getInstance(id);

      if (id === 'instance-a') {
        delete instance.ParentStudy;
        instance.ParentSeries = 'series-a';
      }

      return instance;
    };

    orthanc.getInstanceStudy = async (id) => {
      const instance = await orthanc.getInstance(id);
      const series = instance.ParentSeries
        ? await orthanc.getSeries(instance.ParentSeries)
        : null;
      const tags = await orthanc.getInstanceTags(id);

      return {
        orthancStudyId: instance.ParentStudy || series?.ParentStudy,
        patientId: id === 'prior-missing-patient' ? null : tags.PatientID,
      };
    };

    const priorRequestId = fixture.db.prepare(
      `INSERT INTO imaging_requests (patient_id, requested_by, assigned_radiologist_id, examination, modality)
       VALUES (?, ?, ?, 'CT prior', 'CT')`,
    ).run(
      fixture.patientId,
      fixture.practitionerId,
      fixture.radiologistId,
    ).lastInsertRowid;

    fixture.db.prepare(
      `INSERT INTO imaging_studies (patient_id, imaging_request_id, orthanc_study_id, description)
       VALUES (?, ?, 'orthanc-study-prior', 'Authorized prior study')`,
    ).run(fixture.patientId, priorRequestId);

    let enqueued;

    const aiJobs = {
      async validateInputSize() {
        return true;
      },
      enqueue(input) {
        enqueued = input;
        return { id: 17 };
      },
    };

    const router = createAiRouter({
      db: fixture.db,
      studies: fixture.studies,
      aiJobs,
      aiClient: { capabilities: { restore: {}, compare: {} }, async health() {} },
      orthanc,
      patientMappings: fixture.mappings,
      resultsDirectory: fixture.directory,
    });

    const radiologist = {
      id: fixture.radiologistId,
      role: 'radiologist',
    };

    const assigned = await requestWithUser(router, radiologist, 'POST', '/jobs', {
      capability: 'restore',
      sourceStudyId: fixture.assignedStudyId,
      instanceId: 'instance-a',
      patientId: fixture.secondPatientId,
    });

    assert.equal(assigned.status, 201);
    assert.equal(enqueued.patientId, fixture.patientId);

    const validPrior = await requestWithUser(router, radiologist, 'POST', '/jobs', {
      capability: 'compare',
      sourceStudyId: fixture.assignedStudyId,
      instanceId: 'instance-a',
      priorInstanceId: 'prior-allowed',
    });

    assert.equal(validPrior.status, 201);
    assert.equal(enqueued.patientId, fixture.patientId);
    assert.equal(enqueued.input.priorInstanceId, 'prior-allowed');

    const missingPriorPatientId = await requestWithUser(
      router,
      radiologist,
      'POST',
      '/jobs',
      {
        capability: 'compare',
        sourceStudyId: fixture.assignedStudyId,
        instanceId: 'instance-a',
        priorInstanceId: 'prior-missing-patient',
      },
    );

    assert.equal(missingPriorPatientId.status, 409);
    assert.match(
      missingPriorPatientId.body.error,
      /prior DICOM instance does not contain a PatientID/,
    );

    const unassigned = await requestWithUser(router, radiologist, 'POST', '/jobs', {
      capability: 'restore',
      sourceStudyId: fixture.otherStudyId,
      instanceId: 'instance-b',
    });

    assert.equal(unassigned.status, 403);

    const mismatchedSource = await requestWithUser(router, radiologist, 'POST', '/jobs', {
      capability: 'restore',
      sourceStudyId: fixture.assignedStudyId,
      instanceId: 'instance-b',
    });

    assert.equal(mismatchedSource.status, 409);

    const wrongPriorPatient = await requestWithUser(router, radiologist, 'POST', '/jobs', {
      capability: 'compare',
      sourceStudyId: fixture.assignedStudyId,
      instanceId: 'instance-a',
      priorInstanceId: 'prior-c',
    });

    assert.equal(wrongPriorPatient.status, 409);
  } finally {
    closeFixture(fixture);
  }
});

test('AI job and result routes do not substitute requester ownership for exact study assignment', async () => {
  const fixture = createFixture();

  try {
    const router = createAiRouter({
      db: fixture.db,
      studies: fixture.studies,
      aiJobs: {
        list() {
          return [
            {
              id: 8,
              requestedBy: fixture.radiologistId,
              patientId: fixture.patientId,
              sourceStudyId: fixture.otherStudyId,
              capability: 'restore',
            },
          ];
        },
        getJob() {
          return {
            id: 8,
            requestedBy: fixture.radiologistId,
            patientId: fixture.patientId,
            sourceStudyId: fixture.otherStudyId,
            capability: 'restore',
          };
        },
        getResult() {
          return { id: 9, jobId: 8, filePath: null, overlayPath: null };
        },
        markReviewed() {
          throw new Error('Review must not be reached');
        },
        retry() {
          throw new Error('Retry must not be reached');
        },
      },
      aiClient: { capabilities: { restore: {}, compare: {}, synthetic: {} } },
      orthanc: createMockOrthanc(),
      patientMappings: fixture.mappings,
      resultsDirectory: fixture.directory,
    });

    const user = {
      id: fixture.radiologistId,
      role: 'radiologist',
    };

    assert.equal(
      (await requestWithAiAuthorization(router, fixture, null, 'GET', '/capabilities')).status,
      401,
    );

    assert.equal(
      (await requestWithAiAuthorization(router, fixture, user, 'GET', '/capabilities')).status,
      200,
    );

    assert.equal(
      (await requestWithAiAuthorization(router, fixture, user, 'GET', '/jobs')).status,
      200,
    );

    assert.deepEqual(
      (await requestWithAiAuthorization(router, fixture, user, 'GET', '/jobs')).body.jobs,
      [],
    );

    assert.equal(
      (await requestWithAiAuthorization(router, fixture, user, 'GET', '/jobs/8')).status,
      403,
    );

    assert.equal(
      (await requestWithAiAuthorization(router, fixture, user, 'GET', '/results/9/file')).status,
      403,
    );

    assert.equal(
      (await requestWithAiAuthorization(router, fixture, user, 'GET', '/results/9/overlay')).status,
      403,
    );

    assert.equal(
      (await requestWithAiAuthorization(router, fixture, user, 'POST', '/results/9/review', {})).status,
      403,
    );

    assert.equal(
      (await requestWithAiAuthorization(router, fixture, user, 'POST', '/jobs/8/retry', {})).status,
      403,
    );

    const administrator = {
      id: fixture.adminId,
      role: 'administrator',
    };

    for (const [method, route, body] of [
      ['GET', '/capabilities'],
      ['GET', '/health'],
      ['GET', '/jobs'],
      ['GET', '/jobs/8'],
      ['POST', '/jobs', { capability: 'synthetic' }],
      ['GET', '/results/9/file'],
      ['GET', '/results/9/overlay'],
      ['POST', '/results/9/review', {}],
      ['POST', '/jobs/8/retry', {}],
    ]) {
      assert.equal(
        (await requestWithAiAuthorization(router, fixture, administrator, method, route, body)).status,
        403,
      );
    }
  } finally {
    closeFixture(fixture);
  }
});

test('AI instance limit counts a series combined with selected and prior instances', async () => {
  const fixture = createFixture();

  try {
    const orthanc = createMockOrthanc();

    const jobs = createAiJobService(fixture.db, {
      aiClient: {
        capabilities: {},
        async process() {
          return {};
        },
      },
      orthanc,
      resultsDirectory: fixture.directory,
    });

    assert.equal(
      await jobs.validateInputSize({ seriesId: 'series-many' }),
      true,
    );

    await assert.rejects(
      jobs.validateInputSize({
        seriesId: 'series-many',
        instanceId: 'instance-a',
        priorInstanceId: 'prior-a',
      }),
      (error) => error.status === 413,
    );

    orthanc.getSeries = async () => ({
      Instances: Array.from({ length: 198 }, (_, index) => `series-${index}`),
    });

    assert.equal(
      await jobs.validateInputSize({
        seriesId: 'series-many',
        instanceId: 'instance-a',
        priorInstanceId: 'prior-a',
      }),
      true,
    );
  } finally {
    closeFixture(fixture);
  }
});

test('recovery resumes queued and interrupted jobs without duplicating results or rerunning completed jobs', async () => {
  const fixture = createFixture();

  try {
    const userId = fixture.radiologistId;

    const job = fixture.db.prepare(
      `INSERT INTO ai_jobs (capability, status, requested_by, input_json)
       VALUES ('restore', ?, ?, '{}')`,
    );

    const queuedId = job.run('queued', userId).lastInsertRowid;
    const interruptedId = job.run('running', userId).lastInsertRowid;
    const interruptedWithResultId = job.run('running', userId).lastInsertRowid;
    const completedId = job.run('completed', userId).lastInsertRowid;
    const exhaustedId = job.run('running', userId).lastInsertRowid;

    fixture.db.prepare(
      'UPDATE ai_jobs SET retry_count = 3 WHERE id = ?',
    ).run(exhaustedId);

    const insertResult = fixture.db.prepare(
      `INSERT INTO ai_results (job_id, capability, result_kind, label)
       VALUES (?, 'restore', 'restore', 'Existing result')`,
    );

    insertResult.run(interruptedWithResultId);
    insertResult.run(completedId);

    let processCount = 0;

    const jobs = createAiJobService(fixture.db, {
      aiClient: {
        capabilities: { restore: {} },
        async process() {
          processCount += 1;
          return { label: 'Recovered result' };
        },
      },
      orthanc: createMockOrthanc(),
      resultsDirectory: fixture.directory,
    });

    jobs.recoverInterruptedJobs();

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const remaining = fixture.db.prepare(
        `SELECT COUNT(*) AS count FROM ai_jobs
         WHERE id IN (?, ?) AND status != 'completed'`,
      ).get(queuedId, interruptedId).count;

      if (remaining === 0) break;

      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    assert.equal(processCount, 2);

    assert.equal(
      fixture.db.prepare('SELECT status FROM ai_jobs WHERE id = ?').get(completedId).status,
      'completed',
    );

    assert.equal(
      fixture.db.prepare('SELECT COUNT(*) AS count FROM ai_results WHERE job_id = ?')
        .get(interruptedWithResultId).count,
      1,
    );

    assert.equal(
      fixture.db.prepare('SELECT COUNT(*) AS count FROM ai_results WHERE job_id = ?')
        .get(completedId).count,
      1,
    );

    assert.equal(
      fixture.db.prepare('SELECT COUNT(*) AS count FROM ai_results WHERE job_id = ?')
        .get(queuedId).count,
      1,
    );

    assert.equal(
      fixture.db.prepare('SELECT COUNT(*) AS count FROM ai_results WHERE job_id = ?')
        .get(interruptedId).count,
      1,
    );

    assert.equal(
      fixture.db.prepare('SELECT retry_count FROM ai_jobs WHERE id = ?').get(interruptedId).retry_count,
      1,
    );

    assert.equal(
      fixture.db.prepare('SELECT status FROM ai_jobs WHERE id = ?').get(exhaustedId).status,
      'failed',
    );

    assert.equal(
      fixture.db.prepare('SELECT retry_count FROM ai_jobs WHERE id = ?').get(exhaustedId).retry_count,
      3,
    );
  } finally {
    closeFixture(fixture);
  }
});

test('AI processing rejection is stored for review but job status remains failed', async () => {
  const fixture = createFixture();

  try {
    const jobs = createAiJobService(fixture.db, {
      aiClient: {
        capabilities: { segment3d: {} },
        async process() {
          return {
            result_kind: 'segmentation_rejected',
            label: '3D visualisation unavailable: insufficient volume data',
            warnings: ['At least eight slices are required.'],
            metrics: { slice_count: 2 },
          };
        },
      },
      orthanc: {
        async getSeries() {
          return { Instances: ['one', 'two'] };
        },
        async getInstanceFile() {
          return Buffer.from('test-dicom');
        },
      },
      resultsDirectory: fixture.directory,
    });

    const job = jobs.enqueue({
      capability: 'segment3d',
      requestedBy: fixture.radiologistId,
      patientId: fixture.patientId,
      sourceStudyId: fixture.assignedStudyId,
      input: { seriesId: 'test-series' },
    });

    let updated = job;

    for (
      let attempt = 0;
      attempt < 50 && ['queued', 'running'].includes(updated.status);
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      updated = jobs.getJob(job.id);
    }

    assert.equal(updated.status, 'failed');
    assert.match(updated.error, /insufficient volume data/);
    assert.equal(updated.results.length, 1);
    assert.equal(updated.results[0].resultKind, 'segmentation_rejected');
  } finally {
    closeFixture(fixture);
  }
});

test('result file helpers reject traversal and symlink paths', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orthoviewplus-results-'));
  const outside = path.join(
    path.dirname(directory),
    `${path.basename(directory)}-outside.png`,
  );

  try {
    assert.throws(
      () => writeResultFile(
        directory,
        '../outside.png',
        Buffer.from('bad').toString('base64'),
      ),
      /filename/i,
    );

    fs.writeFileSync(outside, 'outside');

    const linkPath = path.join(directory, 'job-1-linked.png');

    try {
      fs.symlinkSync(outside, linkPath);

      assert.throws(
        () => resolveResultFile(directory, linkPath),
        /Invalid result path/,
      );
    } catch (error) {
      if (!['EPERM', 'EACCES'].includes(error.code)) {
        throw error;
      }
    }

    const savedPath = writeResultFile(
      directory,
      'job-1-safe.png',
      Buffer.from('safe').toString('base64'),
    );

    assert.equal(
      fs.readFileSync(resolveResultFile(directory, savedPath), 'utf8'),
      'safe',
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
    fs.rmSync(outside, { force: true });
  }
});
