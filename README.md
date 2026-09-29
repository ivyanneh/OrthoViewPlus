# OrthoView+

A web-based clinical interface for enhancing medical imaging workflows among healthcare practitioners.

OrthoView+ is a workstation-style web application. Practitioners sign in, review imaging workflow status, and retrieve studies from an Orthanc DICOM server. It is not an AI diagnosis, interpretation, or decision-support system.

## Architecture

```text
React frontend
      ↓
Express / Node.js REST API
      ↓
Orthanc REST API
      ↓
DICOM data