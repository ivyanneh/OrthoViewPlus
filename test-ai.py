import requests
import json

# Test AI service health
health_response = requests.get('http://localhost:8000/health')
print("AI Service Health:", health_response.json())

# Test a simple synthetic generation (no DICOM file needed)
print("\nTesting synthetic generation...")
try:
    response = requests.post(
        'http://localhost:8000/api/ai/generate-synthetic',
        data={
            'modality': 'DX',
            'anatomy': 'chest',
            'view': 'PA'
        }
    )
    print("Synthetic generation response:", response.status_code)
    print(response.text[:500] if response.text else "No response")
except Exception as e:
    print(f"Error: {e}")
