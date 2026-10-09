# Simulation Results Dashboard

Web dashboard for reviewing engineering simulation results, comparing revisions and tracking follow-up demands.

## Layout

- `backend/` — FastAPI service (Python, managed with uv)
- `frontend/` — React + TypeScript app (Vite)
- `Inputs/` — supplied frequency-response CSVs, one folder per revision

## Commands

Requires `uv`, Node.js and `make`.

| Command        | What it does                                  |
| -------------- | --------------------------------------------- |
| `make install` | Install backend and frontend dependencies     |
| `make import`  | Import the CSVs in `Inputs/` into the database |
| `make dev`     | Run the API (port 8000) and the web app       |
| `make test`    | Run the backend tests                         |
| `make lint`    | ruff, oxlint and Prettier checks              |

Design decisions are recorded in [DECISIONS.md](DECISIONS.md).
