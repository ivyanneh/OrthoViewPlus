import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { createOrthancService } from '../src/services/orthanc.js';

async function withMockOrthanc(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function respondJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

test('Orthanc service exports instance, series, tag, image and study lookups', async () => {
  await withMockOrthanc((request, response) => {
    if (request.url === '/instances/instance-1') return respondJson(response, 200, { ID: 'instance-1', ParentStudy: 'study-1' });
    if (request.url === '/series/series-1') return respondJson(response, 200, { ID: 'series-1', ParentStudy: 'study-1', Instances: ['instance-1'] });
    if (request.url === '/instances/instance-1/simplified-tags') return respondJson(response, 200, { PatientID: 'P-1' });
    if (request.url === '/instances/instance-1/file') {
      response.writeHead(200, { 'content-type': 'application/dicom' });
      response.end(Buffer.from('dicom-data'));
      return;
    }
    if (request.method === 'POST' && request.url === '/tools/find') {
      request.resume();
      return respondJson(response, 200, [{
        ID: 'study-1',
        RequestedTags: { PatientID: 'P-1', StudyDate: '20260101', StudyDescription: 'CT study' },
        Series: ['series-1'],
      }]);
    }
    return respondJson(response, 404, { error: 'not found' });
  }, async (url) => {
    const orthanc = createOrthancService({ url, timeoutMs: 2000 });
    assert.equal((await orthanc.getInstance('instance-1')).ParentStudy, 'study-1');
    assert.equal((await orthanc.getSeries('series-1')).ParentStudy, 'study-1');
    assert.equal((await orthanc.getInstanceTags('instance-1')).PatientID, 'P-1');
    assert.equal((await orthanc.getInstanceFile('instance-1')).toString(), 'dicom-data');
    assert.equal((await orthanc.listStudies({ limit: 50 }))[0].id, 'study-1');
  });
});

test('Orthanc resolves an instance study through its parent series when ParentStudy is absent', async () => {
  await withMockOrthanc((request, response) => {
    if (request.url === '/instances/mr-instance') {
      return respondJson(response, 200, { ID: 'mr-instance', ParentSeries: 'mr-series' });
    }
    if (request.url === '/series/mr-series') {
      return respondJson(response, 200, {
        ID: 'mr-series',
        ParentStudy: 'mr-study',
        Instances: ['mr-instance'],
      });
    }
    if (request.url === '/instances/mr-instance/simplified-tags') {
      return respondJson(response, 200, { PatientID: 'DEMO-MR-PATIENT' });
    }
    return respondJson(response, 404, { error: 'not found' });
  }, async (url) => {
    const orthanc = createOrthancService({ url, timeoutMs: 2000 });
    assert.deepEqual(await orthanc.getInstanceStudy('mr-instance'), {
      instance: { ID: 'mr-instance', ParentSeries: 'mr-series' },
      series: { ID: 'mr-series', ParentStudy: 'mr-study', Instances: ['mr-instance'] },
      tags: { PatientID: 'DEMO-MR-PATIENT' },
      orthancStudyId: 'mr-study',
      patientId: 'DEMO-MR-PATIENT',
    });
  });
});

test('Orthanc rejects inconsistent or unrelated instance and series relationships', async () => {
  await withMockOrthanc((request, response) => {
    if (request.url === '/instances/wrong-instance') {
      return respondJson(response, 200, { ID: 'wrong-instance', ParentSeries: 'mr-series' });
    }
    if (request.url === '/series/mr-series') {
      return respondJson(response, 200, {
        ID: 'mr-series',
        ParentStudy: 'mr-study',
        Instances: ['another-instance'],
      });
    }
    return respondJson(response, 404, { error: 'not found' });
  }, async (url) => {
    const orthanc = createOrthancService({ url, timeoutMs: 2000 });
    await assert.rejects(orthanc.getInstanceStudy('wrong-instance'), (error) => error.status === 409);
  });
});

test('Orthanc study lookup distinguishes an empty archive from an unavailable service', async () => {
  await withMockOrthanc((request, response) => {
    if (request.method === 'POST' && request.url === '/tools/find') {
      request.resume();
      return respondJson(response, 200, []);
    }
    return respondJson(response, 503, { error: 'offline' });
  }, async (url) => {
    const orthanc = createOrthancService({ url, timeoutMs: 2000 });
    assert.deepEqual(await orthanc.listStudies(), []);
  });

  await withMockOrthanc((request, response) => {
    if (request.method === 'POST' && request.url === '/tools/find') {
      request.resume();
      return respondJson(response, 503, { error: 'offline' });
    }
    return respondJson(response, 503, { error: 'offline' });
  }, async (url) => {
    const orthanc = createOrthancService({ url, timeoutMs: 2000 });
    await assert.rejects(orthanc.listStudies(), (error) => error.status === 503);
  });
});

test('exposure index requests only recognized Orthanc DICOM tags', async () => {
  await withMockOrthanc((request, response) => {
    if (request.method === 'POST' && request.url === '/tools/find') {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        const query = JSON.parse(body);
        assert.ok(query.RequestedTags.includes('XRayTubeCurrent'));
        assert.ok(!query.RequestedTags.includes('TubeCurrent'));
        respondJson(response, 200, [{
          ID: 'instance-1',
          ParentSeries: 'series-1',
          RequestedTags: {
            PatientID: 'P-1',
            PatientName: 'Demo Patient',
            Modality: 'XR',
            ExposureIndex: '120',
          },
        }]);
      });
      return;
    }
    if (request.url === '/series/series-1') {
      return respondJson(response, 200, { ID: 'series-1', ParentStudy: 'study-1' });
    }
    return respondJson(response, 404, { error: 'not found' });
  }, async (url) => {
    const orthanc = createOrthancService({ url, timeoutMs: 2000 });
    const rows = await orthanc.getExposureIndexRows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].orthancStudyId, 'study-1');
    assert.equal(rows[0].patientId, 'P-1');
    assert.equal(rows[0].exposureIndex, '120');
  });
});

test('study profile resolves PatientID from Orthanc PatientMainDicomTags when MainDicomTags omits it', async () => {
  await withMockOrthanc((request, response) => {
    if (request.url === '/studies/study-patient-tags') {
      return respondJson(response, 200, {
        ID: 'study-patient-tags',
        MainDicomTags: { StudyDate: '20240808', StudyDescription: 'Volunteer Siemens RC' },
        PatientMainDicomTags: { PatientID: 'Ultra_fast_Brain', PatientName: 'Ivy Test' },
        Series: ['series-patient-tags'],
      });
    }
    if (request.url === '/series/series-patient-tags') {
      return respondJson(response, 200, {
        ID: 'series-patient-tags',
        MainDicomTags: { Modality: 'MR' },
        Instances: ['instance-patient-tags'],
      });
    }
    if (request.url === '/instances/instance-patient-tags') {
      return respondJson(response, 200, { ID: 'instance-patient-tags' });
    }
    if (request.url === '/instances/instance-patient-tags/simplified-tags') {
      return respondJson(response, 200, { InstanceNumber: '1' });
    }
    return respondJson(response, 404, { error: 'not found' });
  }, async (url) => {
    const orthanc = createOrthancService({ url, timeoutMs: 2000 });
    const profile = await orthanc.getStudyProfile('study-patient-tags');
    assert.equal(profile.patientId, 'Ultra_fast_Brain');
    assert.equal(profile.patientName, 'Ivy Test');
    assert.equal(profile.studyDate, '20240808');
  });
});

test('study profile preserves missing PatientID as null rather than inventing identity', async () => {
  await withMockOrthanc((request, response) => {
    if (request.url === '/studies/study-no-patient-id') {
      return respondJson(response, 200, {
        ID: 'study-no-patient-id',
        MainDicomTags: { StudyDate: '20240808' },
        PatientMainDicomTags: { PatientName: 'Ivy Test' },
        Series: [],
      });
    }
    return respondJson(response, 404, { error: 'not found' });
  }, async (url) => {
    const orthanc = createOrthancService({ url, timeoutMs: 2000 });
    const profile = await orthanc.getStudyProfile('study-no-patient-id');
    assert.equal(profile.patientId, null);
    assert.equal(profile.patientName, 'Ivy Test');
  });
});
