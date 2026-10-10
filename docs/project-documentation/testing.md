# OrthoView+ Testing Documentation

## 1. Purpose

This document records the testing approach used to verify the OrthoView+ application.

## 2. Testing Areas

### 2.1 Authentication

Verify that:

* Authorized credentials allow login.
* Invalid credentials are rejected.
* Passwords are stored as hashes rather than plaintext.
* Protected endpoints enforce authentication.
* Logout behaves as expected.

### 2.2 Role-Based Authorization

Verify that:

* Practitioner accounts receive the appropriate practitioner permissions.
* Administrator accounts receive the appropriate administrative permissions.
* Unauthorized users cannot access restricted endpoints.
* Administrative operations require appropriate authorization.

### 2.3 Database

Verify that:

* The SQLite database initializes successfully.
* Required tables are created.
* The development seed process behaves as expected.
* Account records are stored correctly.
* Audit records are persisted correctly.
* Invalid database operations are handled appropriately.

### 2.4 Orthanc Integration

Verify that:

* The backend can communicate with the configured Orthanc server.
* Available study information can be retrieved.
* Failed requests are handled appropriately.
* Missing imaging metadata does not cause unexpected application failures.

### 2.5 User Interface

Verify that:

* The login page renders correctly.
* Successful login opens the appropriate dashboard.
* Navigation links lead to the intended pages.
* Forms validate required information.
* Loading, empty, and error states are handled appropriately.

### 2.6 Audit Logging

Verify that:

* Relevant activities generate audit records according to the implementation.
* Recorded events contain the expected information.
* Audit records can be viewed by authorized administrators.
* Unauthorized users cannot access restricted audit information.

## 3. Test Results

Record actual results in the table below.

| Test ID | Test                      | Expected Result                                        | Actual Result | Status  |
| ------- | ------------------------- | ------------------------------------------------------ | ------------- | ------- |
| T-01    | Valid administrator login | Login succeeds                                         | To be tested  | Pending |
| T-02    | Invalid login             | Login is rejected                                      | To be tested  | Pending |
| T-03    | Database initialization   | Required schema is created                             | To be tested  | Pending |
| T-04    | Role-based access         | Access follows assigned permissions                    | To be tested  | Pending |
| T-05    | Orthanc connectivity      | Supported requests return expected responses           | To be tested  | Pending |
| T-06    | Audit record creation     | Configured events are recorded                         | To be tested  | Pending |
| T-07    | Logout                    | Session or authentication state is cleared as designed | To be tested  | Pending |

## 4. Usability Evaluation

The planned evaluation uses the System Usability Scale (SUS) with approximately three to five healthcare practitioners, subject to approval and participant availability.

Record participant feedback, completed questionnaires, calculated SUS scores, and observations only after the evaluation has been conducted.

## 5. Testing Limitations

Tests involving unavailable services, incomplete features, or unavailable participant feedback should be identified as pending rather than reported as successful.
