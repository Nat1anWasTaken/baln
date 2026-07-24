SHELL := /bin/bash
.PHONY: dev build test db-up db-down migrate start frontend-deps

frontend-deps:
	@test -f frontend/pnpm-lock.yaml || (echo "frontend/pnpm-lock.yaml is missing; run pnpm install in frontend/" >&2; exit 1)
	@if test ! -d frontend/node_modules || test ! -f frontend/node_modules/.baln-lock || ! cmp -s frontend/pnpm-lock.yaml frontend/node_modules/.baln-lock; then \
		cd frontend && pnpm install --frozen-lockfile && cp pnpm-lock.yaml node_modules/.baln-lock; \
	fi

db-up:
	docker compose up -d --wait postgres

db-down:
	docker compose down

migrate:
	@test -f backend/.env || (echo "backend/.env is required; copy backend/.env.example and configure it." >&2; exit 1)
	cd backend && cargo run --bin baln-migrate -- up

dev: frontend-deps
	@test -f backend/.env || (echo "backend/.env is required; copy backend/.env.example and configure it." >&2; exit 1)
	$(MAKE) db-up
	$(MAKE) migrate
	cd frontend && pnpm concurrently --kill-others --names backend,vite --prefix-colors blue,magenta \
		"cd ../backend && cargo run --bin baln-backend" "pnpm dev"

build: frontend-deps
	cd frontend && pnpm test && pnpm build
	@test -f frontend/dist/index.html || (echo "frontend/dist/index.html was not generated" >&2; exit 1)
	cd backend && cargo build --release --bin baln-backend

test: frontend-deps
	cd frontend && pnpm test
	cd backend && cargo test

start:
	@test -f frontend/dist/index.html || (echo "Run 'make build' first: frontend/dist/index.html is missing." >&2; exit 1)
	@test -x backend/target/release/baln-backend || (echo "Run 'make build' first: release backend is missing." >&2; exit 1)
	@test -f backend/.env || (echo "backend/.env is required." >&2; exit 1)
	cd backend && FRONTEND_DIST_DIR=../frontend/dist ./target/release/baln-backend
