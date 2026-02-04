# RL Gym Visualizer - Development Commands

SHELL := /bin/bash

BACKEND_HOST ?= 127.0.0.1
BACKEND_PORT ?= 8000
FRONTEND_HOST ?= 127.0.0.1
FRONTEND_PORT ?= 3000
NEXT_PUBLIC_API_URL ?= http://$(BACKEND_HOST):$(BACKEND_PORT)/api/v1
RLV_RUNS_DIR ?= $(CURDIR)/backend/runs

.PHONY: help install install-backend install-frontend dev dev-check backend frontend test-smoke test clean

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
	@echo "  make clean      Remove generated files and caches"
	@echo ""
	@echo "Common overrides:"
	@echo "  BACKEND_PORT=8010 FRONTEND_PORT=3010 make dev"
	@echo "  RLV_RUNS_DIR=backend/runs-local make dev"
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
	cd backend && RLV_RUNS_DIR="$(RLV_RUNS_DIR)" .venv/bin/uvicorn app.main:app --reload --host "$(BACKEND_HOST)" --port "$(BACKEND_PORT)"

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
