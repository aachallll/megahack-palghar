# Prahari ICU Intelligence

AI-powered ICU telemetry and surveillance monitoring system.

## Monorepo Structure
- `/frontend` — React + Vite + Supabase (deploy to Vercel)
- `/backend` — FastAPI + YOLOv9 (deploy to Render)

## Prerequisites
- **Node.js** (v18+) & **npm** — for the frontend
- **Python** (3.10+) — for the backend
- **Supabase** account with project URL & keys
- **Groq** API key (free at [groq.com](https://groq.com))

## Local Development

### 1. Frontend

```bash
cd frontend
npm install
cp .env.example .env
```

Fill in `.env` with your credentials:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_BACKEND_URL=http://localhost:8000
VITE_SURVEILLANCE_WS_URL=ws://localhost:8000
VITE_GROQ_API_KEY=your_groq_api_key_here
```

Start the dev server:
```bash
npm run dev
```
Frontend runs at **http://localhost:8080**

---

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
```

> **Note (Python 3.13+):** If `numpy==1.26.4` or `Pillow==10.4.0` fail to install, install dependencies manually with relaxed versions:
> ```bash
> pip install fastapi==0.115.0 "uvicorn[standard]==0.30.6" "websockets>=13.0" opencv-python-headless==4.10.0.84 "numpy>=1.26" python-multipart==0.0.9 supabase==2.7.4 python-dotenv==1.0.1 "Pillow>=10.4" supervision==0.22.0 groq==0.11.0 aiofiles==23.2.1
> ```

> **Note (PyTorch – optional):** `torch` and `torchvision` are required for YOLOv9 object detection. Without them the backend starts in **mock detection mode** (all other features work normally). Install separately if needed:
> ```bash
> pip install torch torchvision
> ```

Fill in `.env` with your credentials:
```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
GROQ_API_KEY=your_groq_api_key
CAMERA_SOURCE=0
MODEL_CONFIDENCE=0.45
PORT=8000
HOST=0.0.0.0
FRONTEND_URL=http://localhost:8080
```

Start the backend server:
```bash
python -m uvicorn main:app --reload --port 8000
```
Backend runs at **http://localhost:8000**

---

## Running Both Together

Open **two terminals** and run:

| Terminal | Commands |
|----------|----------|
| Terminal 1 (Frontend) | `cd frontend` → `npm run dev` |
| Terminal 2 (Backend) | `cd backend` → `python -m uvicorn main:app --reload --port 8000` |

## Deployment
- **Frontend**: Push to GitHub → Connect to Vercel → Set root directory to `/frontend`
- **Backend**: Push to GitHub → Connect to Render → Set root directory to `/backend`