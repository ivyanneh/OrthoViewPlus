# OrthoView+

A web-based clinical interface for enhancing medical imaging workflows among healthcare practitioners.

OrthoView+ is a workstation-style web application. Practitioners sign in, review imaging workflow status, and will later retrieve studies from an Orthanc DICOM server. It is not an AI diagnosis, interpretation, or decision-support system.

## Architecture

```
React frontend
    ↓
Express / Node.js REST API
    ↓
Orthanc REST API
    ↓
DICOM data
```

Application accounts and audit events are stored in SQLite. Orthanc credentials stay on the backend only.

## Technologies

- Frontend: React, JavaScript, Vite, React Router, Axios
- Backend: Node.js, Express, Axios, better-sqlite3, bcryptjs, JSON Web Tokens, CORS, dotenv
- Imaging: Orthanc REST API (structure in place; live connection is optional for this milestone)

## Project structure

```
OrthoViewPlus/
  client/          React + Vite frontend
  server/          Express API, SQLite, Orthanc client
  .env.example     Environment variable template
  README.md
```

## Install dependencies

From the project root:

```powershell
cd client
npm install

cd ..\server
npm install
```

## Environment variables

1. Copy `.env.example` to `server/.env` if that file is not already present.
2. Review the values. Important variables:

| Variable | Purpose |
| --- | --- |
| `PORT` | Backend port (default `3001`) |
| `CLIENT_ORIGIN` | Allowed frontend origin |
| `JWT_SECRET` | Secret used to sign session tokens |
| `JWT_EXPIRES_IN` | Token lifetime |
| `DATABASE_PATH` | SQLite file location |
| `DEV_ADMIN_USERNAME` | Local administrator username |
| `DEV_ADMIN_PASSWORD` | Local administrator password |
| `ORTHANC_URL` | Orthanc base URL |
| `ORTHANC_USERNAME` | Orthanc basic-auth username |
| `ORTHANC_PASSWORD` | Orthanc basic-auth password |

Do not put Orthanc credentials, JWT secrets, or account passwords in frontend source files.

The Vite development server proxies `/api` to `http://localhost:3001`.

## Start the backend

```powershell
cd server
npm run dev
```

The API listens at `http://localhost:3001`. On first start it creates the SQLite database (including `users` and `audit_logs`) and seeds the development administrator if that account does not exist.

Confirm health with `GET http://localhost:3001/api/health`.

## Start the frontend

In a second terminal:

```powershell
cd client
npm run dev
```

Open `http://localhost:5173` in Chrome. The first screen is the login page.

## Development login credentials

These values come from `server/.env`, not from React source:

- Username: `admin`
- Password: `OrthoViewDev2026!`

Use them only for local development.

## Current milestone

Included:

- Login with hashed passwords and JWT sessions
- Protected routes and logout
- Dashboard with Orthanc statistics, recent imaging activity, and recent audit activity
- Exposure Index module with Orthanc-backed metadata retrieval and filtering
- Compare Scans module with side-by-side study metadata comparison
- Admin-only audit log with backend authorization enforcement and filtering
- Orthanc health handling that returns friendly unavailable states instead of crashing

Still outside the scope of this prototype:

- Production user management
- Automated tests
