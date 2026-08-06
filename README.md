# Baln

Baln is a multi-user personal finance ledger built around double-entry bookkeeping. It provides a mobile-first web application for accounts, transactions, balances, and reports, plus an API and OAuth-protected MCP endpoint for scripts and AI clients.

## Features

- Double-entry ledger with balanced entries and postings
- Asset, liability, income, expense, and equity accounts
- Searchable and editable transactions with atomic writes
- Period summaries and monthly income/expense reports
- Google OpenID Connect login with PKCE
- Short-lived access tokens, rotating refresh tokens, and personal API tokens
- OAuth 2.1 + PKCE for MCP clients such as ChatGPT and Gemini
- PostgreSQL migrations, health checks, OpenAPI documentation, and Docker deployment

## Requirements

- Docker with Compose support
- Rust 1.91 or newer, using the toolchain in [`backend/rust-toolchain.toml`](backend/rust-toolchain.toml)
- Node.js 24 and pnpm 10 for frontend development
- A Google OAuth client for local sign-in

## Quick start

### 1. Configure the backend

From the repository root:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- `JWT_SECRET` to a random value of at least 32 bytes

The Google OAuth client must allow this redirect URI:

```text
http://localhost:8080/api/v1/auth/google/callback
```

The checked-in example uses the local PostgreSQL service and frontend URLs. Do not commit `.env` files or production secrets.

The frontend defaults to the local API URL, but you can make it explicit with:

```bash
cp frontend/.env.example frontend/.env
```

Set `VITE_API_BASE_URL` if the backend runs at a different address.

### 2. Start PostgreSQL and prepare the database

```bash
docker compose up -d postgres

cd backend
cargo run --bin baln-migrate -- up
cargo run --bin baln-admin -- user ensure \
  --email person@example.com \
  --name "Person"
```

Only active, pre-provisioned users can sign in. Replace the example email with the Google account you will use.

### 3. Start the application

Run the backend and frontend in separate terminals:

```bash
# Terminal 1
cd backend
cargo run --bin baln-backend
```

```bash
# Terminal 2
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend dev
```

Open [http://localhost:5173](http://localhost:5173) and sign in with the provisioned Google account.

For the same workflow through the repository Makefile, use `make dev` after configuring `backend/.env` and provisioning a user. It starts PostgreSQL, waits for readiness, installs frontend dependencies, applies migrations, and runs both application servers.

## Development URLs

| Service      | URL                                                                              |
| ------------ | -------------------------------------------------------------------------------- |
| Web app      | [http://localhost:5173](http://localhost:5173)                                   |
| REST API     | [http://localhost:8080/api/v1](http://localhost:8080/api/v1)                     |
| Swagger UI   | [http://localhost:8080/api/docs](http://localhost:8080/api/docs)                 |
| OpenAPI JSON | [http://localhost:8080/api/openapi.json](http://localhost:8080/api/openapi.json) |
| Liveness     | [http://localhost:8080/health/live](http://localhost:8080/health/live)           |
| Readiness    | [http://localhost:8080/health/ready](http://localhost:8080/health/ready)         |
| MCP endpoint | [http://localhost:8080/mcp](http://localhost:8080/mcp)                           |

The MCP OAuth discovery endpoints are available at:

```text
http://localhost:8080/.well-known/oauth-protected-resource/mcp
http://localhost:8080/.well-known/oauth-authorization-server
```

## Useful commands

From the repository root:

```bash
make dev       # Start PostgreSQL, migrate, and run backend + frontend
make db        # Start the local PostgreSQL service
make migrate   # Apply pending migrations
make down      # Stop local Docker Compose services
```

Backend commands, run from `backend/`:

```bash
cargo run --bin baln-migrate -- info
cargo run --bin baln-migrate -- up
cargo run --bin baln-migrate -- down

cargo run --bin baln-admin -- user list
cargo run --bin baln-admin -- user enable --email person@example.com
cargo run --bin baln-admin -- user disable --email person@example.com
cargo run --bin baln-admin -- user revoke-sessions --email person@example.com
```

Frontend commands, run from `frontend/` or prefix them with `pnpm --dir frontend`:

```bash
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
pnpm format:check
```

## Verification

The backend integration tests use PostgreSQL and may create temporary test databases. With the development Compose service running:

```bash
cd backend
DATABASE_URL=postgres://baln:baln_dev@localhost:5432/baln cargo fmt --all -- --check
DATABASE_URL=postgres://baln:baln_dev@localhost:5432/baln cargo clippy --all-targets -- -D warnings
DATABASE_URL=postgres://baln:baln_dev@localhost:5432/baln cargo test --all-targets
```

The frontend test suite uses Vitest and MSW. The Playwright smoke tests mock the API, so they do not require a running backend:

```bash
pnpm --dir frontend test
pnpm --dir frontend test:e2e
```

## API and authentication

The REST API is rooted at `/api/v1` and covers authentication, accounts, entries, balances, and reports. Swagger UI and the generated OpenAPI document are available from the URLs above.

Browser sessions use Google OIDC, an in-memory access token, and an HTTP-only refresh cookie. Personal API tokens begin with `baln_pat_`; the plaintext token is shown only when it is created and can be revoked from the web application.

Example API request:

```bash
curl http://localhost:8080/api/v1/accounts \
  -H 'Authorization: Bearer baln_pat_<secret>'
```

## MCP integration

Connect an MCP client to the deployed Baln URL with `/mcp` appended. Local development uses `http://localhost:8080/mcp`.

Baln uses OAuth 2.1 + PKCE with dynamic client registration. Public clients can
register with `token_endpoint_auth_method=none`; confidential clients can use
`client_secret_basic` or `client_secret_post`. In accordance with RFC 7591, an
omitted token endpoint authentication method defaults to `client_secret_basic`.
For Google Account Linking callback URLs, Baln instead selects
`client_secret_post` to match Gemini Spark's token exchange profile.

Resource scopes are:

```text
ledger:read ledger:write ledger:delete
```

The authorization server also accepts the optional `offline_access` scope for
OIDC-style clients, but refresh tokens do not depend on clients requesting it.

When writing entries, use positive movements from one account to another:

```json
{
  "operation_key": "9b6cc2cc-1173-4dab-8f1d-2e456d698b98",
  "entries": [
    {
      "description": "Lunch",
      "movements": [
        {
          "from_account_key": "asset.cash",
          "to_account_key": "expense.restaurant",
          "amount_minor": 320
        }
      ]
    }
  ]
}
```

Use a new UUID `operation_key` for each distinct create operation and reuse it
only when retrying that operation. `create_entries`, `update_entries`, and
`delete_entries` support atomic batches of up to 100 entries and are used even
for a one-entry batch.

## Production deployment

The production Compose file builds the backend and frontend images, runs PostgreSQL and migrations, and provisions the initial user:

```bash
# Create a deployment-specific .env file in the repository root first.
docker compose -f compose.prod.yaml up -d --build
```

Create a root `.env` file with these required variables:

```text
POSTGRES_PASSWORD=replace-me
GOOGLE_CLIENT_ID=replace-me
GOOGLE_CLIENT_SECRET=replace-me
JWT_SECRET=replace-with-at-least-32-random-bytes
INITIAL_USER_EMAIL=person@example.com
INITIAL_USER_NAME=Person
```

Also update `PUBLIC_BASE_URL`, `FRONTEND_ORIGIN`, `GOOGLE_REDIRECT_URL`, and `FRONTEND_AUTH_CALLBACK_URL` for the public HTTPS origin. Put a TLS reverse proxy in front of the frontend container.

For deeper backend, frontend, and data-model details, see [`backend/README.md`](backend/README.md), [`frontend/README.md`](frontend/README.md), and [`backend/data-specification.md`](backend/data-specification.md).
