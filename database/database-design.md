# OrthoView+ Database Design

## Overview and ownership

The backend uses SQLite via `better-sqlite3` (`server/src/db.js`, with additive migrations). SQLite stores application records and references. Orthanc owns DICOM resources and image files; the application does not duplicate those files in SQLite. The configured database path is `DATABASE_PATH`, defaulting to `server/data/orthoviewplus.db`. Database files must remain out of version control and real patient information must not be used in development fixtures.

Foreign-key enforcement and WAL mode are enabled by the backend. Schema changes are additive and migrations preserve existing records.

## Tables and relationships

| Table | Purpose and key relationships |
|---|---|
| `users` | Unique case-insensitive username, password hash, role, and migrated profile/account state; referenced by requests, assignments, appointments, reports, audit logs, notifications and mappings. |
| `patients` | Unique case-insensitive internal `mrn`, required first and last names, optional date of birth/sex/notes, active/archived state, creator and timestamps. Do not use DICOM PatientID as the internal MRN. |
| `patient_dicom_mappings` | Links application `patient_id` to `orthanc_patient_id`; pending/verified/rejected status, verifier, DICOM name/birth-date metadata and notes. A partial unique index prevents one Orthanc PatientID from being verified to multiple internal patients. |
| `appointments` | Patient, scheduled examination/modality, requester, assigned user, lifecycle status and timestamps. |
| `imaging_requests` | Patient, optional appointment, required requester, optional assigned radiologist, examination, modality, priority, clinical indication and workflow status. |
| `imaging_studies` | Internal patient/request/appointment references and Orthanc study ID/UID and metadata. One Orthanc study can have at most one internal study row through a partial unique index. Source is constrained to original, AI-derived or synthetic. |
| `radiology_reports` | Patient, optional study/request, radiologist, findings/impression, draft/approved state and timestamps. |
| `notifications` | User-owned notification content, optional resource reference, read timestamp and creation timestamp. |
| `ai_jobs` | Requesting radiologist, optional internal patient/study/Orthanc instance, capability, queued/running/completed/failed status, serialized inputs, error and retry state. |
| `ai_results` | Job-owned result kind, source study, file references, metadata, display label and pending/reviewed state. A unique index allows at most one result row per job. |
| `audit_logs` | Optional actor, action, target, description and timestamp. |
| `imaging_schedule` | Operational schedule entries, assigned user, creator and scheduled/completed/cancelled state. |
| `alerts` | Operational alert type, description, resource and reviewed state/actor. |

The schema's SQL definitions and foreign keys are authoritative. Indexes support MRN/name lookup, patient/request/study relationships, schedules, audit review, notifications and AI job/result queries.

## Identity and study relationship

The intended link chain is application patient → verified DICOM PatientID mapping → exact Orthanc study → exact internal imaging-study row → imaging request → requester or assigned radiologist. A matching DICOM name is not proof of identity. Administrators create and verify mappings and link the exact study to a request for the mapped patient; radiologists receive access only to assigned studies. Practitioners receive request/appointment-scoped access.

## Initialization and maintenance

`server/src/db.js` creates the schema and performs idempotent additive migrations. Preserve database files before any schema maintenance. Do not delete completed AI results or replace an existing database as a recovery method.
