import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { createDatabase } from './db.js';
import { seedDevelopmentAdmin } from './seed.js';
import { createAuditService } from './services/audit.js';
import { createOrthancService } from './services/orthanc.js';
import { createAuthMiddleware, createRoleMiddleware } from './middleware/auth.js';
import { createAuthRouter } from './routes/auth.js';
import { createHealthRouter } from './routes/health.js';
import { createAuditRouter } from './routes/audit.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createExposureRouter } from './routes/exposure.js';
import { createCompareRouter } from './routes/compare.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const DATABASE_PATH = path.resolve(__dirname, '..', process.env.DATABASE_PATH || './data/orthoviewplus.db');

if (!JWT_SECRET || JWT_SECRET === 'change-this-to-a-long-random-string') {
  console.warn('Warning: JWT_SECRET is missing or still set to the example value. Set a unique secret before deployment.');
}

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in server/.env');
}

const db = createDatabase(DATABASE_PATH);
const seedResult = seedDevelopmentAdmin(db, {
  username: process.env.DEV_ADMIN_USERNAME,
  password: process.env.DEV_ADMIN_PASSWORD,
});

const audit = createAuditService(db);
const orthanc = createOrthancService({
  url: process.env.ORTHANC_URL || 'http://localhost:8042',
  username: process.env.ORTHANC_USERNAME,
  password: process.env.ORTHANC_PASSWORD,
});
const requireAuth = createAuthMiddleware(JWT_SECRET);
const requireAdministrator = createRoleMiddleware('administrator');

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: '32kb' }));

app.use('/api/health', createHealthRouter({ orthanc }));
app.use('/api/auth', createAuthRouter({ db, audit, jwtSecret: JWT_SECRET, jwtExpiresIn: JWT_EXPIRES_IN, requireAuth }));
app.use('/api/audit', requireAuth, requireAdministrator, createAuditRouter({ audit }));
app.use('/api/dashboard', requireAuth, createDashboardRouter({ orthanc, audit }));
app.use('/api/exposure', requireAuth, createExposureRouter({ orthanc, audit }));
app.use('/api/compare', requireAuth, createCompareRouter({ orthanc, audit }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

app.listen(PORT, () => {
  console.log(`OrthoView+ API listening on http://localhost:${PORT}`);
  console.log(`SQLite database: ${DATABASE_PATH}`);
  if (seedResult.created) {
    console.log(`Development administrator created: ${process.env.DEV_ADMIN_USERNAME}`);
  }
});
