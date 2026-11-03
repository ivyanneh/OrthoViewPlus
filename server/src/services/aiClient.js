import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import FormData from 'form-data';
import { AppError } from '../utils/http.js';

const CAPABILITIES = {
  restore: { endpoint: '/api/ai/restore', label: 'AI-restored image — not a substitute for the original acquisition' },
  completeness: { endpoint: '/api/ai/completeness-check', label: 'Coverage assessment — assistive, requires review' },
  compare: { endpoint: '/api/ai/compare', label: 'Longitudinal comparison — aligned difference map' },
  reconstruct: { endpoint: '/api/ai/reconstruct', label: 'Estimated reconstruction — generated regions, not exact recovery' },
  segment3d: { endpoint: '/api/ai/segment-3d', label: '3D visualisation derived from CT volume — experimental where noted' },
  synthetic: { endpoint: '/api/ai/generate-synthetic', label: 'SYNTHETIC image — not a patient examination' },
  complementary: { endpoint: '/api/ai/generate-complementary-view', label: 'SYNTHETIC complementary view — estimated, not acquired' },
};

export function createAiClient({ baseUrl, timeoutMs = 120000 }) {
  const client = axios.create({
    baseURL: String(baseUrl || '').replace(/\/$/, ''),
    timeout: timeoutMs,
    validateStatus: (status) => status >= 200 && status < 500,
  });

  return {
    capabilities: CAPABILITIES,

    async health() {
      try {
        const response = await client.get('/health');
        return { available: response.status === 200, ...response.data };
      } catch {
        return { available: false, status: 'AI service unavailable' };
      }
    },

    async process({ capability, files, fields }) {
      const spec = CAPABILITIES[capability];
      if (!spec) {
        throw new AppError('Unsupported AI capability.');
      }
      const form = new FormData();
      for (const [key, value] of Object.entries(fields || {})) {
        if (value !== undefined && value !== null) {
          if (key === 'patient_id' || key === 'prior_patient_id') {
            continue;
          }
          form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
        }
      }
      for (const file of files || []) {
        form.append(file.field, file.buffer, { filename: file.filename, contentType: file.contentType || 'application/octet-stream' });
      }
      try {
        const response = await client.post(spec.endpoint, form, {
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });
        if (response.status >= 400) {
          throw new AppError(response.data?.detail || response.data?.error || 'AI processing failed.', response.status);
        }
        return { ...response.data, displayLabel: spec.label };
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        if (!error.response) {
          throw new AppError('The AI processing service is not available.', 503);
        }
        throw new AppError(error.response.data?.detail || error.response.data?.error || 'AI processing failed.', 502);
      }
    },
  };
}

export function writeResultFile(directory, filename, base64Data) {
  fs.mkdirSync(directory, { recursive: true });
  if (!/^[a-zA-Z0-9_-]+\.(png|json)$/.test(filename)) {
    throw new AppError('Invalid result filename.', 400);
  }
  const root = fs.realpathSync(directory);
  const filePath = path.join(root, filename);
  if (path.dirname(filePath) !== root) {
    throw new AppError('Invalid result path.', 400);
  }
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL |
    (fs.constants.O_NOFOLLOW || 0);
  const descriptor = fs.openSync(filePath, flags, 0o600);
  try {
    fs.writeFileSync(descriptor, Buffer.from(base64Data, 'base64'));
  } catch (error) {
    fs.closeSync(descriptor);
    fs.rmSync(filePath, { force: true });
    throw error;
  }
  fs.closeSync(descriptor);
  return filePath;
}

export function resolveResultFile(directory, storedPath) {
  if (!storedPath) return null;
  const root = fs.realpathSync(directory);
  const candidate = path.resolve(storedPath);
  if (path.dirname(candidate) !== root || path.basename(candidate) !== path.basename(storedPath)) {
    throw new AppError('Invalid result path.', 403);
  }
  const stat = fs.lstatSync(candidate);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new AppError('Invalid result path.', 403);
  }
  const resolved = fs.realpathSync(candidate);
  if (path.dirname(resolved) !== root) {
    throw new AppError('Invalid result path.', 403);
  }
  return resolved;
}
