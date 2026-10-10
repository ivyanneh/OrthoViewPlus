# OrthoView+ Project Overview

## 1. Project Title

A Web-based Clinical Interface for Enhancing Medical Imaging Workflows among Healthcare Practitioners

## 2. Introduction

OrthoView+ is a web-based application designed to improve how healthcare practitioners interact with medical imaging workflow information. It provides a dedicated interface that works with an Orthanc imaging server through its REST API.

The project aims to organize imaging-related information and provide relevant monitoring and administrative functions through a role-based interface.

## 3. Problem Statement

Medical imaging workflows involve interacting with imaging studies, exposure information, system activity, and related operational details. A focused interface can help organize these tasks and make relevant information easier to access.

OrthoView+ explores how a web-based interface can support these workflows without replacing the underlying imaging server.

## 4. Project Objectives

The project aims to:

* Develop a web-based interface for imaging workflow information.
* Integrate with Orthanc through its REST API.
* Present relevant exposure information for supported imaging studies.
* Provide scan comparison interfaces for selected imaging metadata.
* Support system monitoring and audit logging.
* Separate practitioner and administrator functions.
* Evaluate usability with a small group of healthcare practitioners.

## 5. Intended Users

### Healthcare Practitioners

The practitioner workspace is intended to provide access to clinical imaging workflow features, including study information, exposure information, scan comparison, and personal activity where implemented.

### System Administrators

The administrator workspace is intended to support user management, audit review, system monitoring, and other administrative functions as implemented.

## 6. Technology Stack

* Frontend: React and Vite.
* Backend: Node.js and Express.
* Application database: SQLite.
* Database library: better-sqlite3.
* Imaging server: Orthanc.
* Backend communication with Orthanc: REST API.
* Version control: Git and GitHub.
* Development environment: Visual Studio Code.

## 7. Scope

The project focuses on the interface and workflow layer around an Orthanc imaging server. It does not aim to replace the imaging server or provide AI-based diagnosis.

Development and demonstration should use suitable sample imaging data rather than unauthorized real patient data.

## 8. Development Approach

The project follows an iterative and incremental development approach. The application is developed in stages, with functionality tested and refined as the system evolves.

## 9. Evaluation

The planned usability evaluation uses the System Usability Scale (SUS) with approximately three to five healthcare practitioners, subject to participant availability and approval.

Evaluation activities and results should be documented only when they have actually taken place.
