# Local PostgreSQL progress API

This service provides browser-progress persistence for the local Docker stack. It is intentionally single-user: the Docker deployment uses the fixed `local-default` profile and should not be exposed directly to the public internet.

## Endpoints

- `GET /health` verifies the PostgreSQL connection.
- `GET /progress` retrieves the saved profile and up to 60 recent attempts.
- `PUT /progress` saves a progress payload and separates attempts from the profile record.
- `DELETE /progress` removes the local profile and its attempts.

## Data model

`learner_profiles` stores the current progress JSON document. `exam_attempts` stores attempt JSON independently, indexed by completion time, so an expanding history does not cause the profile record to grow without bound.

The database URL is read from `DATABASE_URL`. The Docker Compose service supplies it automatically; a local development URL can use the same PostgreSQL-compatible connection string.
