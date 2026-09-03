# Architecture overview

ArchReady is designed as a local-first study application. The browser remains usable without a running backend, while Docker deployment adds durable PostgreSQL storage behind a private API.

```text
Browser UI
  │
  ├── localStorage: responsive progress cache
  │
  └── Nginx web container ── /api/* ──> FastAPI ──> PostgreSQL volume
```

## Trust boundaries

- The web container is the only service bound to the host, by default on `127.0.0.1`.
- The FastAPI service and PostgreSQL database are reachable only on the internal Compose network.
- The browser never receives database credentials.
- Progress APIs use a local fixed profile only in the Docker deployment. Do not expose this local mode to an untrusted network.

## Client persistence

The UI writes progress to browser storage first. When a cloud-sync configuration is enabled, the client debounces a copy of the same progress payload to the configured progress API. Authentication tokens remain in `sessionStorage`, not persistent browser storage.

## Data model

`learner_profiles` contains the current profile document. `exam_attempts` stores attempts independently and is indexed by completion time. Separating attempt history keeps the profile document from growing unbounded as a learner continues studying.

## Deployment modes

- **Static UI:** serve the repository files from a local HTTP server; progress remains browser-local.
- **Docker Compose:** run Nginx, FastAPI, and PostgreSQL together for local durable persistence.
- **Optional AWS sync:** configure the browser with an authenticated API endpoint. This mode is disabled by default.
