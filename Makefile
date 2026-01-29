# RL Gym Visualizer - Development Commands

.PHONY: help install dev backend frontend clean

help:
	@echo "RL Gym Visualizer - Development Commands"
	@echo ""
	@echo "Usage:"
	@echo "  make install    Install all dependencies (backend + frontend)"
	@echo "  make dev        Start both backend and frontend in development mode"
	@echo "  make backend    Start only the backend server"
	@echo "  make frontend   Start only the frontend server"
	@echo "  make clean      Remove generated files and caches"
	@echo ""

# Install all dependencies
install: install-backend install-frontend

install-backend:
	@echo "Installing backend dependencies..."
	cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt

install-frontend:
	@echo "Installing frontend dependencies..."
	cd frontend && npm install

# Development servers
dev:
	@echo "Starting development servers..."
	@echo "Backend: http://localhost:8000"
	@echo "Frontend: http://localhost:3000"
	@make -j2 backend frontend

backend:
	@echo "Starting backend server..."
	cd backend && . .venv/bin/activate && uvicorn app.main:app --reload --port 8000

frontend:
	@echo "Starting frontend server..."
	cd frontend && npm run dev

# Cleanup
clean:
	@echo "Cleaning up..."
	rm -rf backend/.venv
	rm -rf backend/__pycache__
	rm -rf backend/app/__pycache__
	rm -rf frontend/node_modules
	rm -rf frontend/.next
	rm -rf runs/
	rm -f *.db
