OrthoView+
A Web-based Clinical Interface for Enhancing Medical Imaging Workflows among Healthcare Practitioners

OrthoView+ is a web-based clinical interface designed to support healthcare practitioners in reviewing and managing medical imaging workflow information.

The system provides a structured workspace for accessing imaging studies, reviewing exposure information, comparing scan metadata, and monitoring system activity.

Features
Secure user authentication
Role-based practitioner and administrator workspaces
Medical imaging study and workflow management
Exposure Index monitoring
Comparative scan metadata review
Activity and audit logging
Administrator user management
Imaging workflow monitoring
Dashboard statistics and system information
System Architecture
Healthcare Practitioner / Administrator
                 |
                 v
          React Frontend
                 |
                 v
        Node.js / Express API
             /          \
            v            v
        SQLite        Orthanc
     Application      DICOM Server
        Data
Technology Stack
React - Frontend interface
JavaScript - Application development
Node.js - Backend runtime
Express.js - REST API
SQLite - Application data and audit records
Orthanc - DICOM imaging server
Axios - API communication
GitHub - Version control
VS Code / Cursor - Development environment

Main Modules

Practitioner Workspace

Dashboard
Patients & Studies
Exposure Index
Compare Scans
Imaging Workflow
My Activity

Administrator Workspace

Admin Dashboard
User Management
Imaging Schedule
Alerts
Audit Logs
Modality Monitoring
System Administration

Data Responsibilities

SQLite stores application-level information such as:

User accounts
Roles
Password hashes
Audit records
Application state

Orthanc stores and provides access to:

DICOM studies
Series
Instances
Medical imaging metadata
Imaging-related information such as exposure values

Project Structure

OrthoViewPlus/
├── client/          # React frontend
├── server/          # Express backend
├── README.md
├── .gitignore
Development

The application is developed using an iterative and incremental approach.

The frontend communicates with the Express backend, which handles application logic, authentication, SQLite data, and communication with the Orthanc DICOM server.

Project Scope

OrthoView+ is a clinical imaging workflow interface. It is not intended to provide automated diagnosis, clinical decision-making, or AI-generated medical recommendations.

The project is developed as an academic final-year project using demonstration DICOM data.

Author

Ivy Mumbua Munyao

Bachelor Bachelor of business Information Technology
Strathmore University