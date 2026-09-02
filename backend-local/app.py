import os
from contextlib import contextmanager
from typing import Any

import psycopg
from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel
from psycopg.types.json import Jsonb


DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://archready:archready@db:5432/archready",
)
LOCAL_USER_ID = "local-default"

app = FastAPI(title="ArchReady Progress API", docs_url=None, redoc_url=None)


class ProgressPayload(BaseModel):
    progress: dict[str, Any]


@contextmanager
def connection():
    with psycopg.connect(DATABASE_URL) as conn:
        yield conn


def initialize_database() -> None:
    with connection() as conn, conn.cursor() as cursor:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS learner_profiles (
                user_id TEXT PRIMARY KEY,
                progress JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS exam_attempts (
                user_id TEXT NOT NULL,
                attempt_id TEXT NOT NULL,
                completed_at BIGINT NOT NULL DEFAULT 0,
                attempt JSONB NOT NULL,
                PRIMARY KEY (user_id, attempt_id),
                FOREIGN KEY (user_id) REFERENCES learner_profiles(user_id)
                    ON DELETE CASCADE
            )
            """
        )
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS exam_attempts_recent_idx
            ON exam_attempts (user_id, completed_at DESC)
            """
        )


@app.on_event("startup")
def startup() -> None:
    initialize_database()


@app.get("/health")
def health() -> dict[str, str]:
    try:
        with connection() as conn, conn.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except psycopg.Error as error:
        raise HTTPException(status_code=503, detail="Database unavailable") from error
    return {"status": "healthy", "storage": "postgresql"}


@app.get("/progress")
def get_progress() -> dict[str, Any]:
    with connection() as conn, conn.cursor() as cursor:
        cursor.execute(
            "SELECT progress FROM learner_profiles WHERE user_id = %s",
            (LOCAL_USER_ID,),
        )
        profile = cursor.fetchone()
        if not profile:
            return {"progress": None}
        progress = dict(profile[0])
        cursor.execute(
            """
            SELECT attempt FROM exam_attempts
            WHERE user_id = %s
            ORDER BY completed_at DESC
            LIMIT 60
            """,
            (LOCAL_USER_ID,),
        )
        progress["attempts"] = [row[0] for row in cursor.fetchall()]
        return {"progress": progress}


@app.put("/progress")
def put_progress(payload: ProgressPayload) -> dict[str, bool]:
    progress = dict(payload.progress)
    attempts = progress.pop("attempts", [])
    if not isinstance(attempts, list):
        raise HTTPException(status_code=400, detail="Progress attempts must be a list")
    attempts = attempts[:60]

    with connection() as conn, conn.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO learner_profiles (user_id, progress, updated_at)
            VALUES (%s, %s, NOW())
            ON CONFLICT (user_id) DO UPDATE
            SET progress = EXCLUDED.progress, updated_at = NOW()
            """,
            (LOCAL_USER_ID, Jsonb(progress)),
        )

        retained_ids: list[str] = []
        for attempt in attempts:
            if not isinstance(attempt, dict):
                continue
            attempt_id = str(attempt.get("id") or attempt.get("completedAt") or "")
            if not attempt_id:
                continue
            retained_ids.append(attempt_id)
            cursor.execute(
                """
                INSERT INTO exam_attempts
                    (user_id, attempt_id, completed_at, attempt)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (user_id, attempt_id) DO UPDATE
                SET completed_at = EXCLUDED.completed_at,
                    attempt = EXCLUDED.attempt
                """,
                (
                    LOCAL_USER_ID,
                    attempt_id,
                    int(attempt.get("completedAt") or 0),
                    Jsonb(attempt),
                ),
            )

        if retained_ids:
            cursor.execute(
                """
                DELETE FROM exam_attempts
                WHERE user_id = %s AND NOT (attempt_id = ANY(%s))
                """,
                (LOCAL_USER_ID, retained_ids),
            )
        else:
            cursor.execute(
                "DELETE FROM exam_attempts WHERE user_id = %s",
                (LOCAL_USER_ID,),
            )
    return {"saved": True}


@app.delete("/progress", status_code=204)
def delete_progress() -> Response:
    with connection() as conn, conn.cursor() as cursor:
        cursor.execute(
            "DELETE FROM learner_profiles WHERE user_id = %s",
            (LOCAL_USER_ID,),
        )
    return Response(status_code=204)
