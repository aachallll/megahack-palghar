@echo off
echo Setting up Prahari Backend...
cd backend
python -m venv venv
call venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
echo Backend setup complete
echo Run: venv\Scripts\activate && uvicorn main:app --reload --port 8000