# Prahari Surveillance Backend

FastAPI + YOLOv9 backend for ICU CCTV surveillance.

## Local Development
cd backend
pip install -r requirements.txt
cp .env.example .env
# Fill in your values in .env
uvicorn main:app --reload --port 8000

## Deployment (Render)
1. Connect GitHub repo to Render
2. Set root directory to: backend
3. Build command: pip install -r requirements.txt
4. Start command: uvicorn main:app --host 0.0.0.0 --port $PORT
5. Add environment variables from .env.example

## Health Check
GET http://localhost:8000/health