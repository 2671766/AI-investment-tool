"""Vercel entry point: runs the FastAPI app in backend/ as a serverless function at /api/*.

Vercel serves the built React app (frontend/dist) as static files; only /api calls reach here.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.main import app  # noqa: E402,F401
