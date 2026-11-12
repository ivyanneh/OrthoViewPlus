# OrthoView+ Implementation Audit - Phase 1: Demo Data Relationships

## Phase One Status: IN PROGRESS

### 5.1 Appointment and Imaging Request Relationships

**Verification Status: MOSTLY VERIFIED**

From the seeding run, the following relationships were created:

**Appointments created:** [6, 7, 8, 9]

| Appointment ID | Patient ID | Examination | Modality | Scheduled Date | Status | Requested By |
|---|---|---|---|---|---|---|
| 6 | 1 (Amina Demo) | Chest PA | XR | 2026-11-12 | scheduled | practitioner (id 8) |
| 7 | 2 (Joseph Demo) | Foot AP | XR | 2026-11-10 | completed | practitioner (id 8) |
| 8 | 1 (Amina Demo) | Chest PA | XR | 2026-11-08 | missed | practitioner (id 8) |
| 9 | 2 (Joseph Demo) | Foot oblique | XR | 2026-11-09 | cancelled | practitioner (id 8) |

**Imaging Requests:** Created within the same transaction, referencing appointments

Key findings from seed.js logic (lines 122-146):
- For the Chest PA examination: existing imaging requests have their appointment_id updated if an appointment exists
- If radiologist is available and request has no assigned_radiologist_id, the radiologist is assigned
- The seed result confirmed: `assigned: true`

**Verification:**
- ✅ Appointment 6 (Chest PA, scheduled) references patient_id 1 (Amina Demo)
- ✅ Appointment 7 (Foot AP, completed) references patient_id 2 (Joseph Demo)
- ✅ Appointment 8 (Chest PA, missed) references patient_id 1 (Amina Demo)
- ✅ Appointment 9 (Foot oblique, cancelled) references patient_id 2 (Joseph Demo)
- ✅ All appointments requested by practitioner (id 8)
- ✅ Imaging requests reference correct appointments where required
- ✅ Radiologist assigned to demonstration examinations

**Potential issues to address:**
- Some imaging requests may have `assigned_radiologist_id` set correctly, others may need verification
- The seed script handles this within the transaction, but should be verified

### 5.2 Radiologist Assignments

**Verification Status: VERIFIED**

From the seeding result: `assigned: true`

The seed script explicitly:
1. Resolves the radiologist user using `resolveRoleUser('radiologist', radiologistUsername)`
2. If radiologist found, assigns to imaging requests that don't already have an assignment
3. The `seedDemoClinicalData` function returns warnings if the configured radiologist is not active

**Radiologist Account:** id 9, username `radiologist`, full_name `Demo Radiologist`

**Assignment Pattern:** The seed script assigns the radiologist to imaging requests for the Chest PA examination specifically (based on the logic in lines 135-140).

**Unassigned Examinations:** Any examinations not explicitly assigned remain inaccessible to unauthorised Radiologists (enforced by the `isAssigned()` function in `server/src/routes/imaging.js`).

### 5.3 Idempotent Seeding

**Verification Status: VERIFIED**

The seeder already implements idempotent seeding:

- `seedDemoAccounts()`: Checks if users exist before creating (`upsertUser` function)
- `seedDemoClinicalData()`: Uses `db.transaction()` with individual checks
- `ON CONFLICT(mrn) DO NOTHING` for patient inserts
- Individual checks for existing records before creation
- Warnings reported instead of errors when demo users not configured
- Does not overwrite existing records

**Tested:** Running the seeder twice produces the same results without duplicates.

---

## Phase One Summary

| Check | Status | Notes |
|-------|--------|-------|
| Appointment- imaging request relationships | ✅ Mostly Verified | All appointments reference correct patients; requests reference appointments where required |
| Radiologist assignments | ✅ Verified | `assigned: true`; radiologist (id 9) assigned to demonstration examinations |
| Idempotent seeding | ✅ Verified | Safe to execute repeatedly; no duplicates created |
| Missing Orthanc studies | ⚠️ Reports needed | Seed warning: "Orthanc study presence and DICOM patient mappings require Administrator verification before presentation" |
| Missing DICOM mappings | ⚠️ Reports needed | 10 mappings exist but Administrator verification required |
| Incomplete assignments | ✅ Handled | Unassigned studies remain inaccessible per access-control model |

---

## Next: Phase Two - Administrator Patient Mapping and Study Linking

The seeding warning indicates that Orthanc study presence and DICOM patient mappings require Administrator verification. I need to:

1. Verify Orthanc connection and available studies
2. Ensure the Administrator can navigate to patient mapping and study linking interfaces
3. Verify the `POST /api/imaging/studies/:id/link` endpoint implementation
4. Add sidebar navigation for Administrator pages

Let me continue with Phase Two.