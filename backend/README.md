# Baln Backend

Rust/PostgreSQL backend for a multi-user, double-entry personal finance ledger.
The financial model is defined in [`data-specification.md`](./data-specification.md).

## Stack

- Rust 1.91, edition 2024
- Axum and Tokio
- PostgreSQL 18
- sqlx 0.8 with reversible migrations
- Google OpenID Connect with Authorization Code + PKCE
- Short-lived JWT access tokens and rotating refresh tokens

## Repository layout

```text
baln/
├── compose.yaml                 # PostgreSQL development service
├── frontend/
└── backend/
    ├── migrations/             # The only database migration directory
    ├── src/auth/               # Google OIDC, JWT and refresh lifecycle
    ├── src/accounts/           # Account API and balances
    ├── src/entries/            # Atomic Entry + Posting operations
    ├── src/reports/            # Period and monthly summaries
    ├── src/bin/admin.rs        # User provisioning CLI
    ├── src/bin/migrate.rs      # Migration CLI
    └── tests/                  # PostgreSQL invariant tests
```

## Local setup

Start PostgreSQL from the repository root:

```bash
docker compose up -d postgres
```

Create the backend environment file and replace all Google/JWT placeholders:

```bash
cd backend
cp .env.example .env
```

The Google OAuth client must allow this redirect URI:

```text
http://localhost:8080/api/v1/auth/google/callback
```

Apply migrations and provision an allowed user:

```bash
cargo run --bin baln-migrate -- up
cargo run --bin baln-admin -- user create \
  --email person@example.com \
  --name "Person"
```

Run the API:

```bash
cargo run --bin baln-backend
```

Useful development URLs:

- API: `http://localhost:8080/api/v1`
- Swagger UI: `http://localhost:8080/api/docs`
- OpenAPI JSON: `http://localhost:8080/api/openapi.json`
- Liveness: `http://localhost:8080/health/live`
- Readiness: `http://localhost:8080/health/ready`

## Authentication flow

1. Navigate to `GET /api/v1/auth/google/start`.
2. Google redirects to `/api/v1/auth/google/callback`.
3. The backend verifies PKCE, state, nonce, issuer, audience and the ID token.
4. A verified Google email must match a pre-provisioned active user. The first
   successful login permanently binds the Google subject to that user.
5. The callback redirects to `FRONTEND_AUTH_CALLBACK_URL` with a one-time,
   60-second exchange code.
6. `POST /api/v1/auth/token` exchanges it for a 15-minute access JWT and a
   rotating refresh cookie.

Protected endpoints use:

```text
Authorization: Bearer <access-token>
```

Refresh and logout requests require the configured frontend `Origin` header.

## Core API

```text
GET    /api/v1/auth/me
POST   /api/v1/auth/token
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

POST   /api/v1/accounts
GET    /api/v1/accounts
GET    /api/v1/accounts/{id}
PATCH  /api/v1/accounts/{id}
GET    /api/v1/accounts/{id}/balance

POST   /api/v1/entries
GET    /api/v1/entries
GET    /api/v1/entries/{id}
PUT    /api/v1/entries/{id}
DELETE /api/v1/entries/{id}

GET    /api/v1/reports/summary
GET    /api/v1/reports/monthly
```

Entry creation and replacement accept a complete balanced Posting collection.
There are no endpoints for independently creating or mutating Postings.

## Migration management

All migration pairs live directly in `backend/migrations/`:

```text
<version>_<description>.up.sql
<version>_<description>.down.sql
```

Commands:

```bash
cargo run --bin baln-migrate -- info
cargo run --bin baln-migrate -- up
cargo run --bin baln-migrate -- down
```

`down` reverts exactly the latest applied migration. Production deployment
should run the migration binary before starting the API; the API never changes
the schema implicitly.

## User administration

```bash
cargo run --bin baln-admin -- user list
cargo run --bin baln-admin -- user enable --email person@example.com
cargo run --bin baln-admin -- user disable --email person@example.com
cargo run --bin baln-admin -- user unlink-google --email person@example.com
cargo run --bin baln-admin -- user revoke-sessions --email person@example.com
```

Disabling a user or revoking sessions increments `auth_version`, invalidating
already-issued access JWTs as well as refresh tokens.

## Verification

The database user in the development Compose service can create temporary test
databases required by `#[sqlx::test]`.

```bash
DATABASE_URL=postgres://baln:baln_dev@localhost:5432/baln cargo fmt --all -- --check
DATABASE_URL=postgres://baln:baln_dev@localhost:5432/baln cargo clippy --all-targets -- -D warnings
DATABASE_URL=postgres://baln:baln_dev@localhost:5432/baln cargo test --all-targets
```

Tests verify balanced commit behavior, rejected unbalanced entries, tenant
isolation, archived accounts, atomic Posting replacement and dedup replay.
