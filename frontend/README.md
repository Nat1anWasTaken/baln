# Baln Frontend

Baln 的 mobile-first 個人複式記帳介面，使用 Vite、React、TypeScript、Tailwind CSS 與 shadcn/ui。

## Local development

需求：

- Node.js 24
- pnpm 10
- 執行於 `http://localhost:8080` 的 Baln backend

建立環境設定並啟動開發伺服器：

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Backend 的開發設定須包含：

```text
FRONTEND_ORIGIN=http://localhost:5173
FRONTEND_AUTH_CALLBACK_URL=http://localhost:5173/auth/callback
```

## Commands

```bash
pnpm dev             # 開發伺服器
pnpm typecheck       # TypeScript
pnpm lint            # ESLint、Oxlint 與 shadcn 元件政策
pnpm test            # Vitest + MSW
pnpm test:e2e        # Playwright Chromium
pnpm build           # production build
pnpm format:check    # Prettier
```

Access token 只保存在記憶體；重新整理頁面時，前端會使用 backend 的 HTTP-only refresh cookie 恢復登入狀態。
