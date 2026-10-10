# OrthoView+ Database Design

## 1. Overview

OrthoView+ uses SQLite as its application database. The backend accesses the database using the better-sqlite3 library.

SQLite stores application-specific information, while Orthanc manages medical imaging resources.

## 2. Database Location

The development database is located at:

`server/data/orthoviewplus.db`

The database is generated and accessed by the backend. The database file should not be committed to GitHub.

## 3. Database Responsibilities

The database supports application functions such as:

* User account management.
* Authentication-related account information.
* Audit logging.
* Other application state that requires persistence.

The exact tables and fields are defined by the SQL schema in `server/src/db.js`.

## 4. User Accounts and Password Security

User account records support authentication and role-based access.

Passwords must not be stored as plaintext. The application uses password hashing with bcrypt/bcryptjs. Authentication must compare the submitted password against the stored hash.

Account creation and administrative account management should follow the authorization rules implemented by the backend.

## 5. Audit Logging

The audit log is intended to record relevant user and administrative activities.

The actual audit table name, column names, timestamps, recorded events, and relationships must be documented from the implemented database schema and audit routes.

## 6. Database Initialization

The backend initializes the database through its database setup code. The development seed script prepares the initial administrator account where configured.

The actual initialization and seeding behavior should be verified against `server/src/db.js` and `server/seed.js`.

## 7. Database Security and Maintenance

* Exclude database files from version control.
* Keep passwords as secure hashes.
* Restrict database access to the backend.
* Avoid placing real patient information in development databases.
* Back up any required data before making schema changes.
* Document schema changes as the application evolves.

## 8. Schema Reference

Complete this section using the actual SQL table definitions in `server/src/db.js`.

For each table, document:

* Table name.
* Purpose.
* Column names and data types.
* Primary keys.
* Foreign keys, if present.
* Required and optional fields.
* Important constraints and indexes, if present.

Do not document columns or relationships that are not present in the actual implementation.
