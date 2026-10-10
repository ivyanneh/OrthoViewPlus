# OrthoView+ Development Notes

## 1. Project Structure

The project is organized into the following main areas:

* `client/` — React frontend application.
* `server/` — Node.js and Express backend.
* `database/` — Database design documentation.
* `docs/architecture/` — System architecture documentation.
* `docs/project-documentation/` — Project overview, requirements, testing, and development notes.
* `docs/screenshots/` — Project screenshots for documentation and demonstrations.

## 2. Technology Decisions

### Frontend

React and Vite are used to develop and run the web interface.

### Backend

Node.js and Express provide API endpoints, authentication, and communication with Orthanc.

### Database

SQLite is used for application data, with better-sqlite3 providing database access.

### Imaging Integration

The application communicates with Orthanc through its REST API. A separate Orthanc plugin is not part of the chosen architecture.

## 3. Authentication and Security

The application uses password hashing rather than plaintext password storage. Backend configuration and credentials must remain private.

New accounts are intended to be managed by authorized administrators rather than through unrestricted public registration.

## 4. Development Environment

The backend development command is:

`npm.cmd run dev`

Run this command from the `server` directory in PowerShell.

The frontend development command is:

`npm.cmd run dev`

Run this command from the `client` directory in a separate terminal.

The configured development addresses are normally the backend at `http://localhost:3001` and the frontend at the Vite address shown in the terminal.

## 5. Version Control

Git is used for version control, and GitHub hosts the project repository.

Environment files, database files, installed dependencies, and generated build output should be excluded from version control where appropriate.

## 6. Development Progress

Update this section as work is completed.

For each change, record:

* Date.
* Feature or issue.
* Files changed.
* Testing performed.
* Result.
* Outstanding problems.

## 7. Outstanding Work

Record incomplete features, bugs, planned improvements, and any work awaiting verification.

Do not mark planned work as completed until it has been implemented and tested.
