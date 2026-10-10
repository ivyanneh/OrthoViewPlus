# OrthoView+ System Architecture

## 1. Project Overview

OrthoView+ is a web-based clinical interface designed to enhance medical imaging workflows among healthcare practitioners. It provides an interface for interacting with medical imaging data managed by an Orthanc server.

The system focuses on imaging workflow organization, exposure information, scan comparison, system monitoring, and user activity auditing. It is not an AI diagnostic system and does not provide automated clinical diagnoses.

## 2. Architecture Overview

OrthoView+ uses a client-server architecture consisting of three main components:

1. React frontend
2. Node.js and Express backend
3. Orthanc medical imaging server

SQLite is used for application data that needs to be stored separately from the medical imaging data managed by Orthanc.

## 3. System Components

### 3.1 Frontend

Technology: React and Vite.

Responsibilities:

* Provide the login interface.
* Display role-specific dashboards and navigation.
* Present imaging workflow information.
* Display exposure information and scan comparison interfaces.
* Provide administrative interfaces for user management and system monitoring.
* Display activity and audit information according to user permissions.

### 3.2 Backend

Technology: Node.js and Express.

Responsibilities:

* Handle authentication and authorization.
* Provide API endpoints for the frontend.
* Communicate with Orthanc through its REST API.
* Access application data stored in SQLite.
* Record relevant user activity in the audit log.
* Keep sensitive server configuration and Orthanc credentials on the backend.

### 3.3 Database

Technology: SQLite, accessed using better-sqlite3.

Responsibilities:

* Store application-specific information.
* Store user account information and password hashes.
* Store audit records and other application data supported by the implementation.

The SQLite database is separate from Orthanc's management of medical imaging studies and related imaging resources.

### 3.4 Orthanc Server

Orthanc manages medical imaging resources and exposes a REST API used by the OrthoView+ backend.

The backend retrieves or updates information through supported Orthanc API operations. The frontend does not need direct access to Orthanc credentials.

## 4. Architecture Flow

The general request flow is:

1. A user interacts with the React frontend.
2. The frontend sends a request to the Express backend.
3. The backend validates the request and applies the relevant authentication and authorization rules.
4. The backend communicates with SQLite, Orthanc, or both, depending on the operation.
5. The backend returns an appropriate response to the frontend.
6. The frontend displays the resulting information.

## 5. Security Considerations

* Passwords must be stored as secure hashes rather than plaintext.
* Authentication and authorization are handled by the backend.
* Administrative functions must be restricted to authorized administrators.
* Orthanc credentials must not be exposed in frontend code.
* Environment files containing secrets must not be committed to GitHub.
* Audit records should capture relevant security and administrative activities.
* Only appropriate demonstration or authorized imaging data should be used during development and testing.

## 6. Development Environment

The project is developed using Visual Studio Code and Git/GitHub.

The frontend and backend run as separate development processes. The SQLite database is maintained by the backend.

## 7. Architecture Scope

OrthoView+ acts as a web interface and middleware layer around Orthanc. It does not replace Orthanc, implement an independent DICOM storage server, or perform AI-based diagnosis.

## 8. Future Improvements

Potential improvements include additional imaging workflow features, expanded audit reporting, more comprehensive automated tests, and usability evaluation with healthcare practitioners.

Future improvements should be distinguished from functionality already implemented.

