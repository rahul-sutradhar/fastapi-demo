#!/bin/bash

# 1. Run the migrations automatically on boot
echo "🚀 Running database migrations..."
alembic upgrade head

# 2. Start your FastAPI application
echo "🔥 Starting FastAPI app..."
uvicorn app.main:app --host 0.0.0.0 --port 8000