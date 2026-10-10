# OrthoView+ System Requirements

## 1. Functional Requirements

### FR-01: User Authentication

The system shall allow authorized users to log in using their credentials.

### FR-02: Role-Based Access

The system shall provide separate practitioner and administrator workspaces according to assigned roles.

### FR-03: User Management

The system shall allow authorized administrators to manage user accounts and applicable account restrictions.

### FR-04: Imaging Study Information

The system shall provide an interface for accessing supported imaging study information through the backend and Orthanc REST API.

### FR-05: Exposure Information

The system shall display available exposure-related information for supported CR/DX imaging studies when the required metadata is available.

### FR-06: Scan Comparison

The system shall provide an interface for comparing selected imaging metadata, such as acquisition parameters and examination dates, when those values are available.

### FR-07: System Dashboard

The system shall present relevant system statistics and monitoring information supported by the available backend data.

### FR-08: Audit Logging

The system shall record relevant user and administrative activities according to the implemented audit rules.

### FR-09: Audit Log Access

The system shall restrict access to administrative audit records according to user permissions.

### FR-10: Imaging Schedule

The administrator workspace is intended to support examination scheduling and relevant operational alerts, subject to the implemented functionality.

### FR-11: Modality Monitoring

The administrator workspace is intended to provide monitoring information for supported imaging modalities.

## 2. Non-Functional Requirements

### NFR-01: Security

Passwords shall be stored as hashes, not plaintext. Sensitive backend credentials shall not be exposed to the frontend or committed to version control.

### NFR-02: Usability

The interface should provide clear navigation and distinguish practitioner functions from administrator functions.

### NFR-03: Maintainability

The application should separate frontend, backend, database, and imaging-server responsibilities.

### NFR-04: Reliability

The system should handle invalid input, failed requests, and unavailable backend services without exposing sensitive implementation details.

### NFR-05: Data Integrity

Application records should be stored consistently, and database changes should preserve the integrity of existing data.

### NFR-06: Compatibility

The web application should operate in a supported modern browser and in the configured development environment.

## 3. Scope Limitations

* The application is an imaging workflow interface, not an AI diagnostic tool.
* Orthanc remains responsible for managing imaging resources.
* Displayed metadata depends on the information available from Orthanc.
* Features described as intended or planned must not be reported as completed until verified.

## 4. Requirement Verification

Each requirement should be checked against the implementation and documented test results. Requirements may be updated as the project evolves.
