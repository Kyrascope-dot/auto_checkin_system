# Auto Check-In System — Face Recognition

Enroll employees with face photos, then detect and identify them from any image.

## Tech Stack

| Layer     | Tech                                      |
| --------- | ----------------------------------------- |
| Frontend  | React 18 + Tailwind CSS 3 + Axios + Vite  |
| Backend   | Python FastAPI + Uvicorn                   |
| Face AI   | InsightFace (buffalo_l) + ONNX Runtime     |
| Vector DB | ChromaDB (cosine similarity)               |

## Quick Start

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

Runs on **http://localhost:8000** — Swagger docs at `/docs`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on **http://localhost:5173** — proxies `/api` calls to the backend.

## API Endpoints

| Method | Endpoint                       | Description                     |
| ------ | ------------------------------ | ------------------------------- |
| POST   | `/api/employees/enroll`        | Enroll with name + photos       |
| POST   | `/api/detect`                  | Detect & identify faces         |
| GET    | `/api/employees`               | List all enrolled employees     |
| GET    | `/api/employees/{id}`          | Get employee details            |
| DELETE | `/api/employees/{id}`          | Remove employee                 |
| GET    | `/api/health`                  | Health check                    |

## Pages

- **Detect** — Upload an image → see bounding boxes + matched employee cards
- **Enroll** — Register a new employee with 1–5 face photos
- **Employees** — View / delete enrolled employees
