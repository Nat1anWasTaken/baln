SHELL := /bin/bash

ROOT_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
BACKEND_DIR := $(ROOT_DIR)/backend
FRONTEND_DIR := $(ROOT_DIR)/frontend

.DEFAULT_GOAL := help

.PHONY: help dev check-env db wait-db frontend-deps migrate down

help:
	@echo "Baln development commands:"
	@echo "  make dev      Start PostgreSQL, migrate, and run the backend + frontend"
	@echo "  make db       Start PostgreSQL"
	@echo "  make migrate  Apply pending backend migrations"
	@echo "  make down     Stop local Docker Compose services"

dev: check-env db wait-db frontend-deps migrate
	@echo "Backend: http://localhost:8080"
	@echo "Frontend: http://localhost:5173"
	@echo "Press Ctrl-C to stop the application servers."
	@set -e; \
		cleanup() { \
			trap - INT TERM EXIT; \
			kill "$$backend_pid" "$$frontend_pid" 2>/dev/null || true; \
			wait "$$backend_pid" "$$frontend_pid" 2>/dev/null || true; \
		}; \
		(cd "$(BACKEND_DIR)" && exec cargo run --bin baln-backend) & \
		backend_pid=$$!; \
		(cd "$(FRONTEND_DIR)" && exec pnpm dev) & \
		frontend_pid=$$!; \
		trap 'cleanup; exit 130' INT TERM; \
		trap cleanup EXIT; \
		while kill -0 "$$backend_pid" 2>/dev/null && \
			kill -0 "$$frontend_pid" 2>/dev/null; do \
			sleep 1; \
		done; \
		status=0; \
		if ! kill -0 "$$backend_pid" 2>/dev/null; then \
			wait "$$backend_pid" || status=$$?; \
		else \
			wait "$$frontend_pid" || status=$$?; \
		fi; \
		cleanup; \
		exit "$$status"

check-env:
	@test -f "$(BACKEND_DIR)/.env" || { \
		echo "Missing backend/.env. Copy backend/.env.example and configure it first."; \
		exit 1; \
	}

db:
	@docker compose -f "$(ROOT_DIR)/compose.yaml" up -d postgres

wait-db:
	@echo "Waiting for PostgreSQL..."
	@until docker compose -f "$(ROOT_DIR)/compose.yaml" exec -T postgres \
		pg_isready -U baln -d baln >/dev/null 2>&1; do \
		sleep 1; \
	done

frontend-deps:
	@pnpm --dir "$(FRONTEND_DIR)" install --frozen-lockfile

migrate: check-env db wait-db
	@cd "$(BACKEND_DIR)" && cargo run --quiet --bin baln-migrate -- up

down:
	@docker compose -f "$(ROOT_DIR)/compose.yaml" down
