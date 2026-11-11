import sqlite3
import os

DB_PATH = r'C:\Users\ivymu\OrthoViewPlus\server\data\orthoviewplus.db'
db = sqlite3.connect(DB_PATH)
cursor = db.cursor()

# Get all patient data
print("=== PATIENTS ===")
cursor.execute("SELECT * FROM patients")
rows = cursor.fetchall()
cursor.execute("PRAGMA table_info(patients)")
cols = cursor.fetchall()
print("Columns:", [c[1] for c in cols])
for row in rows:
    print("  Row:", row)

# Get all imaging requests
print("\n=== IMAGING REQUESTS ===")
cursor.execute("SELECT * FROM imaging_requests")
rows = cursor.fetchall()
cursor.execute("PRAGMA table_info(imaging_requests)")
cols = cursor.fetchall()
print("Columns:", [c[1] for c in cols])
for row in rows:
    print("  Row:", row)

# Get all imaging studies
print("\n=== IMAGING STUDIES ===")
cursor.execute("SELECT * FROM imaging_studies")
rows = cursor.fetchall()
cursor.execute("PRAGMA table_info(imaging_studies)")
cols = cursor.fetchall()
print("Columns:", [c[1] for c in cols])
for row in rows:
    print("  Row:", row)

# Get all appointments
print("\n=== APPOINTMENTS ===")
cursor.execute("SELECT * FROM appointments")
rows = cursor.fetchall()
cursor.execute("PRAGMA table_info(appointments)")
cols = cursor.fetchall()
print("Columns:", [c[1] for c in cols])
for row in rows:
    print("  Row:", row)

# Get all patient-DICOM mappings
print("\n=== PATIENT-DICOM MAPPINGS ===")
cursor.execute("SELECT * FROM patient_dicom_mappings")
rows = cursor.fetchall()
cursor.execute("PRAGMA table_info(patient_dicom_mappings)")
cols = cursor.fetchall()
print("Columns:", [c[1] for c in cols])
for row in rows:
    print("  Row:", row)

db.close()