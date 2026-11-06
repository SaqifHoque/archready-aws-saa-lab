"""Hosted progress API. Browser capabilities isolate anonymous learners."""
import hashlib
import json
import logging
import os
import secrets
from urllib.parse import urlparse

import psycopg
from psycopg.types.json import Jsonb
from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, Field

app = FastAPI(title="ArchReady hosted progress", docs_url=None, redoc_url=None)
COOKIE = "archready_session"

def connection():
    return psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=10)

def identity(request: Request):
    token = request.cookies.get(COOKIE, "")
    if len(token) != 43:
        raise HTTPException(401, "Open ArchReady before synchronizing progress.")
    return hashlib.sha256(token.encode()).hexdigest()

@app.middleware("http")
async def protect(request, call_next):
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if request.headers.get("sec-fetch-site") == "cross-site" or (origin and urlparse(origin).netloc != request.headers.get("host")):
            return Response(status_code=403)
        if request.headers.get("content-type", "").split(";")[0] != "application/json":
            return Response(status_code=415)
        if len(await request.body()) > 512_000:
            return Response(status_code=413)
    try:
        response = await call_next(request)
    except (psycopg.Error, KeyError):
        logging.exception("Progress service unavailable")
        response = Response('Database service unavailable', status_code=503)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response

@app.get("/api/health")
def health(request: Request, response: Response):
    with connection() as conn:
        conn.execute("SELECT 1 FROM learner_profiles LIMIT 1")
    if len(request.cookies.get(COOKIE, "")) != 43:
        response.set_cookie(COOKIE, secrets.token_urlsafe(32), max_age=31536000,
                            httponly=True, secure=request.url.scheme == "https", samesite="strict", path="/api")
    return {"status": "healthy", "storage": "postgresql", "identity": "private-browser"}

@app.get("/api/progress")
def get_progress(request: Request):
    with connection() as conn:
        row = conn.execute("SELECT progress FROM learner_profiles WHERE user_id=%s", (identity(request),)).fetchone()
    return {"progress": row[0] if row else None}

class Progress(BaseModel):
    progress: dict = Field(default_factory=dict)

@app.put("/api/progress")
def save_progress(payload: Progress, request: Request):
    data = payload.progress
    if not isinstance(data.get("attempts", []), list) or len(data.get("attempts", [])) > 60:
        raise HTTPException(400, "At most 60 exam attempts can be saved.")
    with connection() as conn:
        conn.execute("INSERT INTO learner_profiles(user_id,progress) VALUES(%s,%s) ON CONFLICT(user_id) DO UPDATE SET progress=EXCLUDED.progress,updated_at=now()", (identity(request), Jsonb(data)))
    return {"saved": True}
