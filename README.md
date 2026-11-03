# OrthoView+

**A Web-based Clinical Interface for Enhancing Medical Imaging Workflows among Healthcare Practitioners**

## Project Overview

OrthoView+ is a web-based clinical interface designed to enhance medical imaging workflows among healthcare practitioners. It provides a structured environment for managing patients, accessing and reviewing DICOM imaging studies, monitoring exposure information, comparing scans, and coordinating imaging-related activities.

The system integrates with Orthanc, a DICOM server, to retrieve and display medical imaging data. It also provides experimental image-processing capabilities to support the review and visualization of medical images.

OrthoView+ supports three user roles: Administrator, Practitioner, and Radiologist, each with dedicated workspaces and role-based access permissions.

## Features

### 1. User Authentication and Access Control
- Secure user authentication.
- Role-based access control for Administrators, Practitioners, and Radiologists.
- Protected application routes and workflow-specific permissions.
- User account and status management.
- Activity and audit logging.

### 2. Administrator Workspace
- Administrative dashboard and system statistics.
- Patient management.
- Patient DICOM identity mapping and verification.
- Imaging study management and patient-study linking.
- User management.
- Imaging appointment scheduling.
- System alerts and notifications.
- Audit log monitoring.
- Modality monitoring and system administration.

### 3. Practitioner Workspace
- Practitioner dashboard.
- Patient registration and management within permitted workflows.
- Patient and imaging study access.
- Imaging request creation and tracking.
- Appointment management.
- Exposure Index monitoring.
- Comparative scan review.
- Imaging workflow monitoring.
- Notifications and activity history.
- Access to approved radiology reports.

### 4. Radiologist Workspace
- Radiologist dashboard.
- Assigned imaging requests and claimable requests.
- Access to assigned patient imaging studies.
- DICOM image viewing and study review.
- Patient imaging history.
- AI-assisted image-processing capabilities.
- Comparative scan review.
- Radiology report drafting and approval.
- Notifications and workflow management.

### 5. AI-Assisted Image Processing

OrthoView+ incorporates seven experimental image-processing capabilities:

1. **Patient-Specific Anatomical Reconstruction** – Supports anatomical reconstruction using patient-specific DICOM information.
2. **Damaged-Image Repair and Restoration** – Applies image enhancement techniques such as denoising and contrast adjustment.
3. **Longitudinal Multi-Scan Comparison** – Supports comparison of imaging studies over time using image alignment and difference visualization.
4. **3D Anatomical Representation** – Generates three-dimensional anatomical representations from suitable imaging series.
5. **Scan Completeness Checking** – Examines image coverage and identifies potential missing regions.
6. **Complementary-View Synthesis** – Generates estimated complementary views from available imaging information.
7. **Synthetic Medical-Image Generation** – Produces procedural synthetic imaging cases for demonstration and experimentation.

These capabilities use classical image-processing algorithms and procedural synthetic phantom generation, including OpenCV, NumPy, and scikit-image. They are not trained predictive AI models and have not undergone clinical validation.

## System Architecture

OrthoView+ uses a multi-layer architecture consisting of a React frontend, Node.js/Express backend, SQLite application database, Orthanc DICOM server, and a Python-based AI service.

```text
             Healthcare Users
       Administrator / Practitioner
                Radiologist
                    |
                    v
              React Frontend
                    |
                    v
           Node.js / Express API
              /           \
             v             v
          SQLite         Orthanc
      Application DB    DICOM Server
                           |
                           v
                    DICOM Studies
                           |
                           v
                   Python FastAPI
                      AI Service
                           |
                           v
                 Image Processing
                  and AI Results
                           |
                           v
                  Express Backend
                           |
                           v
                   React Frontend
```

The Express backend manages application logic, authentication, authorization, database operations, and communication with Orthanc and the AI service. Orthanc manages DICOM imaging data, while the Python service handles the experimental image-processing operations.

## Technology Stack

| Technology | Purpose |
|---|---|
| React | Frontend development |
| JavaScript | Frontend and backend application development |
| Node.js | Backend runtime |
| Express.js | REST API and backend services |
| Python | AI service development |
| FastAPI | AI service API |
| SQLite | Application data storage |
| better-sqlite3 | SQLite database integration |
| Orthanc | DICOM imaging server |
| OpenCV | Image processing and enhancement |
| NumPy | Numerical and image-processing operations |
| scikit-image | Image-processing algorithms |
| Axios | Frontend API communication |
| Git and GitHub | Version control |
| VS Code / Cursor | Development environment |

## Database and Data Responsibilities

### SQLite

SQLite stores application-level information, including:

- User accounts and roles.
- Password hashes.
- Patient and application records.
- Patient-to-DICOM identity mappings.
- Imaging workflow information.
- Appointments and scheduling records.
- Notifications.
- Radiology reports.
- AI job records.
- Audit logs.

### Orthanc

Orthanc manages medical imaging information, including:

- DICOM studies.
- DICOM series.
- DICOM instances.
- Medical imaging metadata.
- Imaging files and rendered images.
- Available imaging-related metadata, including exposure information.

DICOM imaging files remain managed by Orthanc rather than being stored directly in the application's SQLite database.

## Security and Access Control

OrthoView+ incorporates security controls to protect application and imaging information:

- Role-based authorization.
- Workflow-specific patient and study access.
- Verified DICOM patient identity mappings.
- Patient identity checks during applicable AI operations.
- Radiologist assignment validation.
- Restricted AI result access.
- Server-controlled result file paths.
- Path traversal protection.
- Audit logging.
- Protected backend configuration and Orthanc credentials.

## Project Structure

```text
OrthoViewPlus/
│
├── client/                       # React frontend
│   └── src/
│       ├── components/            # Reusable UI components
│       └── pages/                 # Application pages and workspaces
│
├── server/                       # Node.js / Express backend
│   ├── src/
│   │   ├── routes/                # API routes
│   │   ├── services/              # Application services
│   │   └── ...
│   ├── tests/                     # Backend tests
│   └── ...
│
├── ai-service/                    # Python FastAPI AI service
│   └── app/
│       ├── routes/                # AI API endpoints
│       └── ...
│
├── database/
│   └── database-design.md
│
├── docs/
│   ├── architecture/
│   │   └── system-architecture.md
│   ├── project-documentation/
│   │   ├── development-notes.md
│   │   ├── project-overview.md
│   │   ├── requirements.md
│   │   └── testing.md
│   └── screenshots/
│
├── .env.example
├── .gitignore
└── README.md
```

## Development Approach

The project follows an Object-Oriented Analysis and Design (OOAD) approach combined with Iterative and Incremental Development.

The system is developed in separate but integrated components. The React frontend communicates with the Express backend through REST APIs. The backend manages application operations and connects to SQLite, Orthanc, and the Python-based AI service.

## Project Scope and Limitations

OrthoView+ is an academic clinical imaging workflow interface intended to support healthcare practitioners in accessing and managing medical imaging information.

The AI-assisted capabilities are experimental image-processing functions. They are not intended to provide automated medical diagnosis, clinical decision-making, or clinically validated medical recommendations.

The system is developed using demonstration DICOM data. It is not presented as a clinically validated or production-certified hospital system.

## Author

**Ivy Mumbua Munyao**

Bachelor of Business Information Technology (BBIT)  
Strathmore University
