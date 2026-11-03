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
