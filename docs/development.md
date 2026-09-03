# Development workflow

## Frontend-only work

The frontend has no build step. Run a local server from the repository root:

```bash
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173`. In this mode, progress is stored in the browser and no PostgreSQL API is used.

## Full local stack

Use Docker Compose when testing browser-to-API persistence:

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
```

The web application listens only on localhost by default. Stop services with `docker compose down`; do not add `-v` unless deleting study data is intentional.

## Checks before a pull request

Run the checks relevant to the files you changed:

```bash
node --check app.js
node --check cloud-sync.js
node --check services.js
docker compose config --quiet
```

For question-bank changes, run the importer or classifier command documented in the root README and inspect the generated records for duplicates or malformed answer selections.

## Branch workflow

Create one feature branch per coherent change. Keep commits focused and push the feature branch, then open a pull request into `main`. Do not push directly to `main` unless the repository owner explicitly chooses that workflow.
