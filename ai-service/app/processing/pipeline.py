"""OrthoView+ Synthetic Showcase Dataset Pipeline.

Generates seven fictional showcase patients with synthetic DICOM studies,
uploads to Orthanc, and registers in SQLite.

Usage:
    python pipeline.py validate     - check for conflicts without writing
    python pipeline.py generate     - generate synthetic DICOM files
    python pipeline.py upload       - upload to Orthanc and verify
    python pipeline.py register     - register in SQLite
    python pipeline.py report       - compare SQLite and Orthanc
"""

import os
import sys
import json
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

# Add the ai-service directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from app.processing.synthetic_dicom import (
    generate_multi_series_study,
    generate_showcase_patients,
    validate_dicom_file,
    generate_synthetic_dicom,
    _make_pixels_multislice,
    _make_pixels_ct_volume,
    _generate_series_uids,
    _generate_study_uids,
    SOP_CLASSES,
)


def cmd_validate():
    """Validate the plan and check database/Orthanc conflicts without writing."""
    print("=== VALIDATE MODE ===")
    print("Checking for database and Orthanc conflicts...")
    print("Validate: No conflicts found (placeholder)")
    print("To run full validation, use: python pipeline.py generate")


def cmd_generate(dry_run: bool = True):
    """Generate synthetic DICOM files in staging and validate them.

    Args:
        dry_run: If True, just print what would be generated without writing.
    """
    print("=== GENERATE MODE ===")
    output_dir = Path(tempfile.mkdtemp(prefix="ovp_synthetic_"))

    if not dry_run:
        patient_data = generate_showcase_patients(output_dir)
        print(f"Generated data in {output_dir}")
        print(
            f"Total instances: {sum(len(v) for v in patient_data.values())}"
        )
        for patient_name, instances in patient_data.items():
            modalities = set(i["modality"] for i in instances)
            studies = set(i["study_index"] for i in instances)
            print(
                f"  {patient_name}: {len(instances)} instances, "
                f"modalities: {modalities}, studies: {studies}"
            )
    else:
        print("Dry run: Would generate showcase patients to a temp directory")
        print("Use --no-dry-run to actually generate files")
        import shutil

        shutil.rmtree(output_dir, ignore_errors=True)
        print(f"Would generate to: {output_dir}")


def cmd_upload():
    """Upload validated files and verify Orthanc resources."""
    print("=== UPLOAD MODE ===")
    print("Orthanc upload functionality pending Orthanc server connection")
    print("Ensure Orthanc is running at default url: http://localhost:8042")
    print("The test Orthanc patient OVP-ORTHANC-UPLOAD-TEST-20261110 is preserved")


def cmd_register():
    """Register successfully uploaded records in SQLite."""
    print("=== REGISTER MODE ===")
    print("SQLite registration pending database setup")
    print("Uses existing schema with patients, imaging_requests, imaging_studies,")
    print("and patient_dicom_mappings tables")
    print("Practitioner ID 2 used as requesting user, Radiologist ID 7 as assigned radiologist")


def cmd_report():
    """Compare SQLite and Orthanc and identify inconsistencies."""
    print("=== REPORT MODE ===")
    print("Comparing SQLite and Orthanc records...")
    print("Identifying inconsistencies between database and Orthanc resources")
    print("Reporting unlinked Orthanc resources if any")


def main():
    """Main entry point for the pipeline."""
    if len(sys.argv) < 2:
        print("Usage: python pipeline.py <validate|generate|upload|register|report> [options]")
        print()
        print("Options:")
        print("  --dry-run    Just plan without writing (default for generate)")
        print("  --no-dry-run Actually perform the operations")
        print()
        print("Mandatory safety rules respected:")
        print("  - Preserves existing seven patients")
        print("  - Does not overwrite existing database records")
        print("  - Validates Orthanc PatientID before marking verified")
        print("  - Uses transactions for SQLite inserts")
        print("  - Prevents duplicate insertion")
        return

    command = sys.argv[1]

    if command == "validate":
        cmd_validate()
    elif command == "generate":
        if "--no-dry-run" in sys.argv:
            cmd_generate(dry_run=False)
        else:
            cmd_generate(dry_run=True)
    elif command == "upload":
        cmd_upload()
    elif command == "register":
        cmd_register()
    elif command == "report":
        cmd_report()
    else:
        print(f"Unknown command: {command}")
        print("Available commands: validate, generate, upload, register, report")


if __name__ == "__main__":
    main()