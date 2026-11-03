import { randomUUID } from 'node:crypto';
import { AppError } from '../utils/http.js';
import { writeResultFile } from './aiClient.js';

const SELECT_JOB = `
  SELECT j.id, j.capability, j.status, j.requested_by AS requestedBy, j.patient_id AS patientId,
         j.source_study_id AS sourceStudyId, j.orthanc_instance_id AS orthancInstanceId,
         j.input_json AS inputJson, j.error, j.created_at AS createdAt, j.started_at AS startedAt,
         j.completed_at AS completedAt, j.retry_count AS retryCount
  FROM ai_jobs j
`;

const SELECT_RESULT = `
  SELECT id, job_id AS jobId, capability, source_study_id AS sourceStudyId, result_kind AS resultKind,
         file_path AS filePath, overlay_path AS overlayPath, metadata_json AS metadataJson,
         label, review_status AS reviewStatus, created_at AS createdAt
  FROM ai_results
`;

const MAX_CONCURRENT = Math.max(1, Number(process.env.AI_MAX_CONCURRENT) || 2);
const MAX_INSTANCES = Math.max(1, Number(process.env.AI_MAX_INSTANCES) || 200);
const MAX_RETRIES = 3;

export function createAiJobService(db, { aiClient, orthanc, resultsDirectory, audit }) {
  let activeCount = 0;
  const queue = [];
  const running = new Set();

  function getJob(id) {
    const job = db.prepare(`${SELECT_JOB} WHERE j.id = ?`).get(Number(id));
    if (!job) return null;
    return {
      ...job,
      input: job.inputJson ? JSON.parse(job.inputJson) : null,
      results: db.prepare(`${SELECT_RESULT} WHERE job_id = ?`).all(job.id).map(publicResult),
    };
  }

  function publicResult(row) {
    return {
      ...row,
      metadata: row.metadataJson ? JSON.parse(row.metadataJson) : null,
      fileUrl: row.filePath ? `/api/ai/results/${row.id}/file` : null,
      overlayUrl: row.overlayPath ? `/api/ai/results/${row.id}/overlay` : null,
    };
  }

  async function inputInstanceIds({ instanceId, priorInstanceId, seriesId }) {
    let seriesInstances = [];
    if (seriesId) {
      const series = await orthanc.getSeries(seriesId);
      seriesInstances = Array.isArray(series?.Instances) ? series.Instances : [];
    }
    const count = Number(Boolean(instanceId)) + Number(Boolean(priorInstanceId)) + seriesInstances.length;
    if (count > MAX_INSTANCES) {
      throw new AppError(`AI input contains ${count} instances, exceeding configured limit of ${MAX_INSTANCES}.`, 413);
    }
    return seriesInstances;
  }

  async function collectFiles({ instanceId, priorInstanceId, seriesId }) {
    const seriesInstances = await inputInstanceIds({ instanceId, priorInstanceId, seriesId });
    const files = [];
    if (instanceId) {
      const buffer = await orthanc.getInstanceFile(instanceId);
      files.push({ field: 'image', buffer, filename: `${instanceId}.dcm`, contentType: 'application/dicom' });
    }
    if (priorInstanceId) {
      const buffer = await orthanc.getInstanceFile(priorInstanceId);
      files.push({ field: 'prior_image', buffer, filename: `${priorInstanceId}.dcm`, contentType: 'application/dicom' });
    }
    if (seriesId) {
      for (const id of seriesInstances) {
        const buffer = await orthanc.getInstanceFile(id);
        files.push({ field: 'volume', buffer, filename: `${id}.dcm`, contentType: 'application/dicom' });
      }
    }
    return files;
  }

  const startJob = db.transaction((jobId) => {
    const jobRow = db.prepare('SELECT * FROM ai_jobs WHERE id = ?').get(jobId);
    if (!jobRow || jobRow.status !== 'queued') return null;
    const existingResult = db.prepare('SELECT id FROM ai_results WHERE job_id = ? LIMIT 1').get(jobId);
    if (existingResult) {
      db.prepare(`UPDATE ai_jobs SET status = 'completed', completed_at = COALESCE(completed_at, datetime('now')), error = NULL WHERE id = ?`).run(jobId);
      return null;
    }
    db.prepare(`UPDATE ai_jobs SET status = 'running', started_at = datetime('now'), completed_at = NULL, error = NULL WHERE id = ?`).run(jobId);
    return jobRow;
  });

  async function runJob(jobId) {
    const jobRow = startJob(jobId);
    if (!jobRow) return;
    const input = jobRow.input_json ? JSON.parse(jobRow.input_json) : {};
    try {
      const files = jobRow.capability === 'synthetic' ? [] : await collectFiles(input);
      const output = await aiClient.process({
        capability: jobRow.capability,
        files,
        fields: {
          exam_type: input.examType || '',
          body_part: input.bodyPart || '',
          notes: input.notes || '',
        },
      });

      const processingRejected = /_(?:rejected|failed)$/.test(String(output.result_kind || ''));
      const processingError = processingRejected
        ? String(output.label || output.warnings?.[0] || 'AI processing did not produce an accepted result.')
        : null;

      const fileToken = randomUUID();
      const saved = [];
      if (output.image_base64) saved.push(writeResultFile(resultsDirectory, `job-${jobId}-${fileToken}-primary.png`, output.image_base64));
      if (output.overlay_base64) saved.push(writeResultFile(resultsDirectory, `job-${jobId}-${fileToken}-overlay.png`, output.overlay_base64));
      let overlayPath = output.overlay_base64 ? saved[saved.length - 1] : null;
      if (output.mesh) {
        const meshPath = writeResultFile(resultsDirectory, `job-${jobId}-${fileToken}-mesh.json`, Buffer.from(JSON.stringify(output.mesh)).toString('base64'));
        saved.unshift(meshPath);
      }

      const completeJob = db.transaction(() => {
        const existingResult = db.prepare('SELECT id FROM ai_results WHERE job_id = ? LIMIT 1').get(jobId);
        if (!existingResult) {
          db.prepare(
            `INSERT INTO ai_results (job_id, capability, source_study_id, result_kind, file_path, overlay_path, metadata_json, label)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            jobId,
            jobRow.capability,
            jobRow.source_study_id,
            output.result_kind || jobRow.capability,
            saved[0] || null,
            overlayPath,
            JSON.stringify({
              method: output.method,
              licence: output.licence,
              warnings: output.warnings || [],
              metrics: output.metrics || {},
              experimental: Boolean(output.experimental),
              synthetic: Boolean(output.synthetic),
              meshIncluded: Boolean(output.mesh),
            }),
            output.displayLabel || output.label || jobRow.capability,
          );
        }
        db.prepare(
          `UPDATE ai_jobs
           SET status = ?, completed_at = datetime('now'), error = ?
           WHERE id = ?`,
        ).run(processingRejected ? 'failed' : 'completed', processingError, jobId);
      });
      completeJob();
      audit?.log({
        userId: jobRow.requested_by,
        action: processingRejected ? 'ai_job_failed' : 'ai_job_completed',
        target: `ai_job:${jobId}`,
        description: processingRejected
          ? `AI job ${jobId} (${jobRow.capability}) returned a rejected or failed result.`
          : `AI job ${jobId} (${jobRow.capability}) completed.`,
      });
    } catch (error) {
      const message = error?.message || 'AI processing failed.';
      db.prepare(`UPDATE ai_jobs SET status = 'failed', completed_at = datetime('now'), error = ? WHERE id = ? AND status = 'running'`).run(message, jobId);
      audit?.log({ userId: jobRow.requested_by, action: 'ai_job_failed', target: `ai_job:${jobId}`, description: `AI job ${jobId} failed: ${message}` });
    }
  }

  function pump() {
    while (activeCount < MAX_CONCURRENT && queue.length > 0) {
      const jobId = queue.shift();
      if (running.has(jobId)) continue;
      running.add(jobId);
      activeCount += 1;
      runJob(jobId).catch((error) => console.error('AI job failed', error)).finally(() => {
        running.delete(jobId);
        activeCount = Math.max(0, activeCount - 1);
        pump();
      });
    }
  }

  function schedule(jobId) {
    queue.push(jobId);
    pump();
  }

  function recoverInterruptedJobs() {
    const jobsToSchedule = db.transaction(() => {
      const rows = db.prepare("SELECT id, status, retry_count AS retryCount FROM ai_jobs WHERE status IN ('queued', 'running')").all();
      const queued = [];
      for (const row of rows) {
        const existingResult = db.prepare('SELECT id FROM ai_results WHERE job_id = ? LIMIT 1').get(row.id);
        if (existingResult) {
          db.prepare(`UPDATE ai_jobs SET status = 'completed', completed_at = COALESCE(completed_at, datetime('now')), error = NULL WHERE id = ?`).run(row.id);
          continue;
        }
        if (row.status === 'running') {
          if (row.retryCount >= MAX_RETRIES) {
            db.prepare(`UPDATE ai_jobs SET status = 'failed', completed_at = datetime('now'), error = ? WHERE id = ?`).run('Maximum automatic recovery attempts reached.', row.id);
            continue;
          }
          db.prepare(
            `UPDATE ai_jobs
             SET status = 'queued', started_at = NULL, completed_at = NULL,
                 retry_count = retry_count + 1, last_retry_at = datetime('now'),
                 error = 'Recovered after interrupted processing.'
             WHERE id = ? AND status = 'running'`,
          ).run(row.id);
        }
        queued.push(row.id);
      }
      return queued;
    })();
    for (const jobId of jobsToSchedule) schedule(jobId);
  }

  return {
    getJob,
    recoverInterruptedJobs,
    validateInputSize(input) {
      return inputInstanceIds(input || {}).then(() => true);
    },
    list({ requestedBy, limit = 50 } = {}) {
      const filter = requestedBy === undefined ? '' : 'WHERE j.requested_by = @requestedBy';
      const params = { limit: Math.min(Math.max(Number(limit) || 50, 1), 200) };
      if (requestedBy !== undefined) params.requestedBy = Number(requestedBy);
      const rows = db.prepare(`${SELECT_JOB} ${filter} ORDER BY j.created_at DESC LIMIT @limit`).all(params);
      return rows.map((job) => ({ ...job, input: job.inputJson ? JSON.parse(job.inputJson) : null }));
    },
    getResult(id) {
      const row = db.prepare(`${SELECT_RESULT} WHERE id = ?`).get(Number(id));
      return row ? publicResult(row) : null;
    },
    markReviewed(id, userId) {
      const result = this.getResult(id);
      if (!result) throw new AppError('AI result not found.', 404);
      db.prepare(`UPDATE ai_results SET review_status = 'reviewed' WHERE id = ?`).run(Number(id));
      audit?.log({ userId, action: 'ai_result_reviewed', target: `ai_result:${id}`, description: `Radiologist reviewed AI result ${id}.` });
      return this.getResult(id);
    },
    enqueue({ capability, requestedBy, patientId, sourceStudyId, input, auditUser }) {
      if (!aiClient.capabilities[capability]) throw new AppError('Unsupported AI capability.');
      if (capability !== 'synthetic' && !input?.instanceId && !input?.seriesId) throw new AppError('An Orthanc instance or series is required for this capability.');
      const result = db
        .prepare(`INSERT INTO ai_jobs (capability, requested_by, patient_id, source_study_id, orthanc_instance_id, input_json) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(capability, requestedBy, patientId ?? null, sourceStudyId ?? null, input?.instanceId ?? null, JSON.stringify(input || {}));
      audit?.log({ userId: auditUser, action: 'ai_job_queued', target: `ai_job:${result.lastInsertRowid}`, description: `Queued AI capability "${capability}".` });
      schedule(result.lastInsertRowid);
      return getJob(result.lastInsertRowid);
    },
    retry(id, auditUser) {
      const job = getJob(id);
      if (!job) throw new AppError('AI job not found.', 404);
      if (job.status !== 'failed') throw new AppError('Only failed jobs can be retried.', 409);
      // Bounded retry policy: max 3 retries per job
      if (job.retryCount >= MAX_RETRIES) throw new AppError(`Maximum retry count (${MAX_RETRIES}) reached for this job.`, 409);
      db.prepare(`UPDATE ai_jobs SET status = 'queued', error = NULL, retry_count = retry_count + 1, last_retry_at = datetime('now') WHERE id = ?`).run(job.id);
      audit?.log({ userId: auditUser, action: 'ai_job_retried', target: `ai_job:${job.id}`, description: `Retried AI job ${job.id} (attempt ${job.retryCount + 2}/3).` });
      schedule(job.id);
      return getJob(job.id);
    },
  };
}
