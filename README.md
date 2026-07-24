# Baln

Baln 是以繁體中文呈現的輕量個人財務應用程式。React SPA、JSON API、Swagger 與健康檢查在正式環境由同一個 Axum origin 提供。

## 必要工具

- Rust 1.91（`backend/rust-toolchain.toml` 會選擇正確版本）
- Node.js 22+ 與 pnpm 10+
- Docker 與 Docker Compose
- PostgreSQL client 並非必要；遷移由 Rust binary 執行

## 初次設定

```bash
cp backend/.env.example backend/.env
```

請在 `backend/.env` 設定 Google OAuth client 與至少 32 bytes 的 `JWT_SECRET`。開發環境的前端 callback 是 `http://localhost:5173/auth/callback`；Google backend redirect 是 `http://localhost:8080/api/v1/auth/google/callback`。正式環境則將 `FRONTEND_ORIGIN`、`FRONTEND_AUTH_CALLBACK_URL` 與 OAuth redirect 改為公開 backend origin，並保持 `COOKIE_SECURE=true`。

## 開發

```bash
make dev
```

這個命令會在需要時安裝鎖定的前端套件、等待 PostgreSQL healthy、執行遷移，再以有名稱的輸出同時啟動 Vite（5173）及 Axum（8080）。Vite 會把 `/api` 與 `/health` proxy 到 backend。按 Ctrl-C 會由 `concurrently` 結束兩個 child process；資料庫會繼續運作。

個別資料庫命令：

```bash
make db-up
make migrate
make db-down
```

## 測試與正式建置

```bash
make test
make build
make start
```

`make build` 先執行前端單元測試及 TypeScript/Vite production build，確認 `frontend/dist/index.html` 存在，再建立 Rust release binary。`make start` 從 `backend/` 啟動 release binary，因此預設的 `FRONTEND_DIST_DIR=../frontend/dist` 可同時供應 SPA 與 API；巢狀 React Router URL 可直接重新載入。

若前端尚未建置，backend 仍可啟動並提供 API，且只記錄一次警告。部署時必須將 `frontend/dist` 與 binary 一同發布。Vite hashed assets 使用長效 immutable cache；`index.html` 使用 no-cache。

## API contracts

backend 啟動後，可更新或檢查由 OpenAPI 產生的 TypeScript contracts：

```bash
cd frontend
pnpm api:types
pnpm api:types:check
```

Swagger 位於 `/api/docs`，OpenAPI JSON 位於 `/api/openapi.json`，健康檢查位於 `/health/live` 與 `/health/ready`。
