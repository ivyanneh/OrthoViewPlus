# OrthoView+ Project Overview

## Project

OrthoView+ is an academic, web-based clinical interface for imaging workflow coordination around Orthanc. It combines React/Vite, an Express API, SQLite application records, Orthanc-managed DICOM resources, and a Python FastAPI service containing experimental image-processing prototypes.

## Purpose and scope

The project provides role-specific patient, request, study, reporting, scheduling, notification and administrative workflows. It is not a PACS replacement or diagnostic system. Orthanc remains the DICOM source of truth; SQLite contains application metadata and explicit links to Orthanc resources.

## Intended roles

- **Administrator:** account and patient management, identity mapping, exact study/request linking, scheduling, operational monitoring, alerts and audit review.
- **Practitioner:** permitted patient registration and lookup, requests, appointments, relevant history, authorized study/report review, exposure information, comparison and notifications.
- **Radiologist:** assigned requests and studies, DICOM review, same-patient authorized comparison, radiology reports, and radiologist-only experimental AI processing/result review.

## Identity and imaging workflow

An application patient is distinct from a DICOM PatientID. An administrator creates a pending mapping, verifies it manually, and links the exact Orthanc study to an imaging request for the same internal patient. Radiologist study access depends on assignment to that request; a patient's existence or a requester's ownership alone does not grant study access. A matching patient name does not automatically verify identity.

## Experimental processing

Seven assistive prototypes are in scope: restoration, completeness assessment, longitudinal comparison, anatomical reconstruction, 3D visualization, synthetic phantom generation, and complementary-view synthesis. Similar-case retrieval is excluded. These capabilities use classical image-processing algorithms (OpenCV, NumPy, scikit-image) and procedural synthetic phantom generation, not trained predictive AI models. Synthetic/derived outputs are labelled, reviewed by a radiologist, and not claimed as clinical or diagnostic results.

## Technology

- Frontend: React and Vite.
- API: Node.js and Express.
- Database: SQLite and better-sqlite3.
- Imaging archive: Orthanc REST API.
- Processing service: Python FastAPI.

## Evaluation and limitations

Usability evaluation with healthcare practitioners and the System Usability Scale (SUS) is planned, not completed or evidenced here. No clinical validation, diagnostic accuracy evaluation, or production hospital deployment is claimed. See [testing](./testing.md) for automated verification and service-integration limitations.
