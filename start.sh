#!/usr/bin/env bash
# One-command start (macOS / Linux): installs what is missing, builds the web front end once,
# and serves the whole app at http://localhost:8000
set -e
cd "$(dirname "$0")"
if [ ! -d backend/.venv ]; then python3 -m venv backend/.venv; fi
source backend/.venv/bin/activate
pip install -q -r backend/requirements.txt
if [ ! -d frontend/node_modules ]; then (cd frontend && npm install); fi
if [ ! -d frontend/dist ] || [ "$1" = "--rebuild" ]; then (cd frontend && npm run build); fi
echo ""
echo "  AI Investment Decision Support is running at http://localhost:8000  (Ctrl+C to stop)"
echo ""
cd backend && python -m uvicorn app.main:app --port 8000
