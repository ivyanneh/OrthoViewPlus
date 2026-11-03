# OrthoView+ AI service

Python FastAPI service for assistive image processing. It does not diagnose patients or overwrite original DICOM files.

## Run (Windows PowerShell)

```powershell
cd ai-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
pytest
```

The Node.js backend is the only intended client.
