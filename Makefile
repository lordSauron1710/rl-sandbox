# RL Gym Visualizer - Development Commands

SHELL := /bin/bash

BACKEND_HOST ?= 127.0.0.1
BACKEND_PORT ?= 8000
FRONTEND_HOST ?= 127.0.0.1
FRONTEND_PORT ?= 3000
NEXT_PUBLIC_API_URL ?= http://$(BACKEND_HOST):$(BACKEND_PORT)/api/v1
RLV_RUNS_DIR ?= $(CURDIR)/backend/runs
RLV_DB_PATH ?= $(CURDIR)/backend/data/rl_visualizer.db

.PHONY: help install install-backend install-frontend dev dev-check backend frontend test-smoke test selfhosted-backend-init-env selfhosted-backend-doctor selfhosted-backend-api-url selfhosted-backend-config selfhosted-backend-up selfhosted-backend-health selfhosted-backend-wait-healthy selfhosted-backend-down selfhosted-backend-logs selfhosted-backend-ps selfhosted-backend-backup selfhosted-backend-restore vercel-frontend-status vercel-frontend-doctor vercel-frontend-link vercel-frontend-whoami vercel-frontend-sync-api-url vercel-frontend-sync-api-url-preview vercel-frontend-deploy vercel-frontend-deploy-preview deploy-selfhosted-app-status deploy-selfhosted-app clean

help:
	@echo "RL Gym Visualizer - Development Commands"
	@echo ""
	@echo "Usage:"
	@echo "  make install    Install all dependencies (backend + frontend)"
	@echo "  make dev        Start backend + frontend with shared env config"
	@echo "  make dev-check  Validate dev config/deps without starting servers"
	@echo "  make backend    Start only the backend server"
	@echo "  make frontend   Start only the frontend server"
	@echo "  make test-smoke Run minimal backend smoke test (CI; requires backend up)"
	@echo "  make test       Run full backend test (requires backend up)"
	@echo "  make selfhosted-backend-init-env Create deploy/selfhosted/backend.env"
	@echo "  make selfhosted-backend-doctor   Validate backend deploy prerequisites"
	@echo "  make selfhosted-backend-api-url Print the NEXT_PUBLIC_API_URL value for Vercel"
	@echo "  make selfhosted-backend-config Validate self-hosted backend Compose config"
	@echo "  make selfhosted-backend-up     Build and start the self-hosted backend stack"
	@echo "  make selfhosted-backend-health Query the public backend health endpoint"
	@echo "  make selfhosted-backend-wait-healthy Wait until the public backend is healthy"
	@echo "  make selfhosted-backend-down   Stop the self-hosted backend stack"
	@echo "  make selfhosted-backend-logs   Follow self-hosted backend logs"
	@echo "  make selfhosted-backend-ps     Show self-hosted backend service status"
	@echo "  make selfhosted-backend-backup Export the self-hosted backend data volume"
	@echo "  make selfhosted-backend-restore BACKUP=/abs/path.tar.gz Restore the self-hosted data volume"
	@echo "  make vercel-frontend-status    Show Vercel auth/link status and computed API URL"
	@echo "  make vercel-frontend-link      Link frontend/ to a Vercel project"
	@echo "  make vercel-frontend-doctor    Validate Vercel CLI auth and linkage"
	@echo "  make vercel-frontend-sync-api-url Sync NEXT_PUBLIC_API_URL to Vercel production"
	@echo "  make vercel-frontend-deploy    Deploy frontend/ to Vercel production"
	@echo "  make deploy-selfhosted-app-status Show end-to-end deployment readiness"
	@echo "  make deploy-selfhosted-app     Deploy backend + production frontend"
	@echo "  make clean      Remove generated files and caches"
	@echo ""
	@echo "Common overrides:"
	@echo "  BACKEND_PORT=8010 FRONTEND_PORT=3010 make dev"
	@echo "  RLV_RUNS_DIR=backend/runs-local make dev"
	@echo "  RLV_DB_PATH=backend/data/local.db make dev"
	@echo ""

# Install all dependencies
install: install-backend install-frontend

install-backend:
	@echo "Installing backend dependencies..."
	@if command -v python3 >/dev/null 2>&1; then \
		PYTHON_BIN=python3; \
	elif command -v python >/dev/null 2>&1; then \
		PYTHON_BIN=python; \
	else \
		echo "Python is required (python3 or python not found)."; \
		exit 1; \
	fi; \
	cd backend && $$PYTHON_BIN -m venv .venv && .venv/bin/pip install -r requirements.txt

install-frontend:
	@echo "Installing frontend dependencies..."
	cd frontend && npm install

# Development servers
dev:
	@bash scripts/dev.sh

dev-check:
	@bash scripts/dev.sh --dry-run

backend:
	@if [ ! -x backend/.venv/bin/uvicorn ]; then \
		echo "backend/.venv is missing. Run 'make install' first."; \
		exit 1; \
	fi
	@echo "Starting backend server..."
	cd backend && RLV_RUNS_DIR="$(RLV_RUNS_DIR)" RLV_DB_PATH="$(RLV_DB_PATH)" .venv/bin/uvicorn app.main:app --reload --host "$(BACKEND_HOST)" --port "$(BACKEND_PORT)"

frontend:
	@echo "Starting frontend server..."
	cd frontend && NEXT_PUBLIC_API_URL="$(NEXT_PUBLIC_API_URL)" npm run dev -- --hostname "$(FRONTEND_HOST)" --port "$(FRONTEND_PORT)"

# Tests (backend must be running)
test-smoke:
	@echo "Running backend smoke test (CI)..."
	@bash test-smoke.sh

test:
	@echo "Running full backend test..."
	@bash test-comprehensive.sh

selfhosted-backend-init-env:
	@bash scripts/selfhosted-backend.sh init-env

selfhosted-backend-doctor:
	@bash scripts/selfhosted-backend.sh doctor

selfhosted-backend-api-url:
	@bash scripts/selfhosted-backend.sh api-url

selfhosted-backend-config:
	@bash scripts/selfhosted-backend.sh config

selfhosted-backend-up:
	@bash scripts/selfhosted-backend.sh up

selfhosted-backend-health:
	@bash scripts/selfhosted-backend.sh health

selfhosted-backend-wait-healthy:
	@bash scripts/selfhosted-backend.sh wait-healthy

selfhosted-backend-down:
	@bash scripts/selfhosted-backend.sh down

selfhosted-backend-logs:
	@bash scripts/selfhosted-backend.sh logs

selfhosted-backend-ps:
	@bash scripts/selfhosted-backend.sh ps

selfhosted-backend-backup:
	@bash scripts/selfhosted-backend.sh backup

selfhosted-backend-restore:
	@if [ -z "$(BACKUP)" ]; then \
		echo "Usage: make selfhosted-backend-restore BACKUP=/absolute/path/to/backup.tar.gz"; \
		exit 1; \
	fi
	@bash scripts/selfhosted-backend.sh restore "$(BACKUP)"

vercel-frontend-status:
	@bash scripts/vercel-frontend.sh status

vercel-frontend-doctor:
	@bash scripts/vercel-frontend.sh doctor

vercel-frontend-link:
	@bash scripts/vercel-frontend.sh link

vercel-frontend-whoami:
	@bash scripts/vercel-frontend.sh whoami

vercel-frontend-sync-api-url:
	@bash scripts/vercel-frontend.sh set-api-url production

vercel-frontend-sync-api-url-preview:
	@bash scripts/vercel-frontend.sh set-api-url preview

vercel-frontend-deploy:
	@bash scripts/vercel-frontend.sh deploy production

vercel-frontend-deploy-preview:
	@bash scripts/vercel-frontend.sh deploy preview

deploy-selfhosted-app:
	@bash scripts/deploy-selfhosted-app.sh all

deploy-selfhosted-app-status:
	@bash scripts/deploy-selfhosted-app.sh status

# Cleanup
clean:
	@echo "Cleaning up..."
	rm -rf backend/.venv
	rm -rf backend/venv
	rm -rf backend/__pycache__
	rm -rf backend/app/__pycache__
	rm -rf backend/runs
	rm -f backend/data/*.db
	rm -rf frontend/node_modules
	rm -rf frontend/.next
	rm -f frontend/tsconfig.tsbuildinfo
	rm -rf runs/
	rm -f *.db
