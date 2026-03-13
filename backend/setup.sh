#!/bin/bash
echo "Setting up Prahari Backend..."
cd backend
python -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
echo "✅ Backend setup complete"
echo "Run: source venv/bin/activate && uvicorn main:app --reload --port 8000"