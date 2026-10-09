.PHONY: install import dev dev-api dev-web test lint format

install:
	cd backend && uv sync
	cd frontend && npm install

import:
	cd backend && uv run python -m app.cli import

dev:
	$(MAKE) -j2 dev-api dev-web

dev-api:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

dev-web:
	cd frontend && npm run dev

test:
	cd backend && uv run pytest

lint:
	cd backend && uv run ruff check . && uv run ruff format --check . && uv run pyright
	cd frontend && npm run lint && npm run format:check

format:
	cd backend && uv run ruff format .
	cd frontend && npm run format
