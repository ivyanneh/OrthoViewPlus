import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { createDatabase } from './db.js';
import { seedDemoAccounts, seedDemoClinicalData } from './seed.js';
import { createAuditService } from './services/audit.js';
import { createOrthancService } from './services/orthanc.js';
import { createAuthMiddleware, createRoleMiddleware } from './middleware/auth.js';
import { createAuthRouter } from './routes/auth.js';
import { createHealthRouter } from './routes/health.js';
import { createAuditRouter } from './routes/audit.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createExposureRouter } from './routes/exposure.js';
import { createCompareRouter } from './routes/compare.js';
import { createAdminRouter } from './routes/admin.js';
import { createClinicalRouter } from './routes/clinical.js';
import { createImagingRouter } from './routes/imaging.js';
import { createAiRouter } from './routes/ai.js';
import { createStatsRouter } from './routes/stats.js';
import { createUserService } from './services/users.js';
import { createAlertService } from './services/alerts.js';
import { createScheduleService } from './services/schedule.js';
import { createNotificationService } from './services/notifications.js';
import { createPatientService } from './services/patients.js';
import { createAppointmentService } from './services/appointments.js';
import { createRequestService } from './services/requests.js';
import { createReportService } from './services/reports.js';
import { createStudyService } from './services/studies.js';
import { createPatientMappingService } from './services/patientMappings.js';
import { createAiClient } from './services/aiClient.js';
import { createAiJobService } from './services/aiJobs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const DATABASE_PATH = path.resolve(__dirname, '..', process.env.DATABASE_PATH || './data/orthoviewplus.db');
const AI_RESULTS_DIR = path.resolve(__dirname, '..', process.env.AI_RESULTS_DIR || './data/ai-results');

if (!JWT_SECRET || JWT_SECRET === 'change-this-to-a-long-random-string') {
  console.warn('Warning: JWT_SECRET is missing or still set to the example value. Set a unique secret before deployment.');
}

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in server/.env or the project .env file.');
}

const db = createDatabase(DATABASE_PATH);
const seedResult = seedDemoAccounts(db, {
  adminUsername: process.env.DEV_ADMIN_USERNAME,
  adminPassword: process.env.DEV_ADMIN_PASSWORD,
  practitionerUsername: process.env.DEV_PRACTITIONER_USERNAME,
  practitionerPassword: process.env.DEV_PRACTITIONER_PASSWORD,
  radiologistUsername: process.env.DEV_RADIOLOGIST_USERNAME,
  radiologistPassword: process.env.DEV_RADIOLOGIST_PASSWORD,
});
seedDemoClinicalData(db);

const audit = createAuditService(db);
const users = createUserService(db);
const alerts = createAlertService(db);
const notifications = createNotificationService(db);
const patients = createPatientService(db);
const appointments = createAppointmentService(db, { notifications, alerts });
const requests = createRequestService(db, { notifications });
const reports = createReportService(db, { notifications });
const studies = createStudyService(db);
const patientMappings = createPatientMappingService(db, { audit });
const schedule = createScheduleService(db, { alerts });
const orthanc = createOrthancService({
  url: process.env.ORTHANC_URL || 'http://localhost:8042',
  username: process.env.ORTHANC_USERNAME,
  password: process.env.ORTHANC_PASSWORD,
  timeoutMs: Number(process.env.ORTHANC_TIMEOUT_MS) || 20000,
});
const aiClient = createAiClient({
  baseUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',
});
const aiJobs = createAiJobService(db, {
  aiClient,
  orthanc,
  resultsDirectory: AI_RESULTS_DIR,
  audit,
});

const requireAuth = createAuthMiddleware(JWT_SECRET, { getAuthState: users.getAuthState });
const requireAdministrator = createRoleMiddleware('administrator');
const requireClinical = createRoleMiddleware(['practitioner', 'radiologist']);
const requireImagingAccess = createRoleMiddleware(['administrator', 'practitioner', 'radiologist']);
const requireAiAccess = createRoleMiddleware(['administrator', 'radiologist']);

appointments.processOverdue();
setInterval(() => {
  try {
    appointments.processOverdue();
  } catch (error) {
    console.error('Appointment status processor failed:', error.message);
  }
}, 60 * 1000).unref();

aiJobs.recoverInterruptedJobs();

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: '2mb' }));

app.use('/api/health', createHealthRouter({ orthanc, aiClient }));
app.use('/api/auth', createAuthRouter({ db, audit, alerts, users, jwtSecret: JWT_SECRET, jwtExpiresIn: JWT_EXPIRES_IN, requireAuth }));
app.use('/api/audit', requireAuth, requireAdministrator, createAuditRouter({ audit }));
app.use('/api/admin', requireAuth, requireAdministrator, createAdminRouter({ db, audit, users, patients, schedule, alerts, orthanc, patientMappings }));
app.use('/api/stats', requireAuth, requireAdministrator, createStatsRouter({ db, users, patients, appointments, orthanc, audit }));
app.use('/api/dashboard', requireAuth, createDashboardRouter({ orthanc, audit }));
app.use('/api/exposure', requireAuth, requireClinical, createExposureRouter({ orthanc, audit }));
app.use('/api/compare', requireAuth, requireClinical, createCompareRouter({ orthanc, audit }));
app.use('/api/clinical', requireAuth, createClinicalRouter({ patients, appointments, requests, reports, studies, notifications, audit, users }));
app.use('/api/imaging', requireAuth, requireImagingAccess, createImagingRouter({ orthanc, studies, patients, patientMappings, requests, audit }));
app.use('/api/ai', requireAuth, requireAiAccess, createAiRouter({ db, studies, aiJobs, aiClient, orthanc, patientMappings, resultsDirectory: AI_RESULTS_DIR }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

app.listen(PORT, () => {
  console.log(`OrthoView+ API listening on http://localhost:${PORT}`);
  console.log(`SQLite database: ${DATABASE_PATH}`);
  if (seedResult.some((item) => item.created)) {
    console.log('Development demo accounts were created where missing.');
  }
});
