Set-Location C:\Users\Dell\OneDrive\Desktop\AI-projects\auto-checkin-system\backend
$env:OPENBLAS_NUM_THREADS = '1'
.\venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
