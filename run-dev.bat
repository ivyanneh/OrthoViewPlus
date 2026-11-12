@echo off
start "OrthoViewPlus Server" cmd /c "cd server && node src/index.js && pause"
start "OrthoViewPlus AI Service" cmd /c "cd ai-service && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 && pause"
start "OrthoViewPlus Client" cmd /c "cd client && npm run dev && pause"
