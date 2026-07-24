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
- Remote MCP over stateless Streamable HTTP
- OAuth 2.1 Authorization Code + PKCE for MCP clients

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
- MCP endpoint: `http://localhost:8080/mcp`
- OAuth protected-resource metadata:
  `http://localhost:8080/.well-known/oauth-protected-resource/mcp`

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

The bearer value may also be a user-generated personal API token. Personal
tokens start with `baln_pat_`, have the same ledger access as their owner, and
remain valid until their optional expiration or explicit revocation. The
plaintext value is returned only when the token is created.

Refresh and logout requests require the configured frontend `Origin` header.

## ChatGPT and MCP

Baln is an OAuth authorization server and resource server for the MCP endpoint.
Google remains the upstream identity provider for the Baln browser session.
MCP clients never receive the browser JWT or personal API tokens.

The remote endpoint is:

```text
https://b.nath.tw/mcp
```

The MCP OAuth implementation provides dynamic client registration, exact
redirect-URI matching, Authorization Code with mandatory PKCE S256, resource
binding, 15-minute access tokens, and rotating 30-day refresh tokens. The
available scopes are:

```text
ledger:read ledger:write ledger:delete offline_access
```

Entry tools accept positive semantic movements:

```json
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
```

The server converts each movement to balanced postings. Agents do not submit
signed amounts, debit/credit labels, totals, user IDs, posting IDs, or
deduplication keys. `create_entries` accepts up to 100 entries and commits the
whole batch atomically.

Every tool returns a natural-language summary plus structured content. Errors
state whether the agent should call another tool, retry, reconnect, or ask the
user a concrete question.

### MCP Inspector

Start Baln locally, expose it through an HTTPS development tunnel, then launch
the Inspector:

```bash
npx @modelcontextprotocol/inspector
```

Connect the Inspector to the tunnel URL ending in `/mcp`, complete the Baln
OAuth consent flow, and verify:

1. `tools/list` includes the natural-language descriptions and OAuth security
   schemes.
2. `get_entry_creation_context` returns the current date and active account
   keys.
3. `create_entry` creates one balanced entry.
4. Retrying the identical JSON-RPC request does not create a duplicate.
5. A batch containing an invalid account creates zero entries and explains the
   required correction.
6. Revoking the connection under **已連接的應用程式** makes the access and
   refresh tokens unusable.

### ChatGPT web

Enable developer mode in ChatGPT, create a custom app using
`https://b.nath.tw/mcp`, and complete the displayed Baln consent page. Test at
least these prompts:

```text
Record lunch for NT$320 paid in cash.
Record this list of 20 transactions as one batch.
Record a purchase using my card.
```

The last prompt should cause ChatGPT to ask which card when the available
account data does not make the user’s choice unambiguous. Review every write in
Baln and revoke the test connection afterward.

## Core API

```text
GET    /api/v1/auth/me
POST   /api/v1/auth/token
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
GET    /api/v1/auth/api-tokens
POST   /api/v1/auth/api-tokens
DELETE /api/v1/auth/api-tokens/{id}

POST   /api/v1/accounts
GET    /api/v1/accounts
GET    /api/v1/accounts/{id}
PATCH  /api/v1/accounts/{id}
DELETE /api/v1/accounts/{id}
GET    /api/v1/accounts/{id}/balance

POST   /api/v1/entries
GET    /api/v1/entries
GET    /api/v1/entries/{id}
PUT    /api/v1/entries/{id}
DELETE /api/v1/entries/{id}

GET    /api/v1/reports/summary
GET    /api/v1/reports/monthly
```

API-token management requires a signed-in browser session; a personal token
cannot create or revoke tokens. For example, after creating a token in the web
application:

```bash
curl http://localhost:8080/api/v1/accounts \
  -H 'Authorization: Bearer baln_pat_<secret>'
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
cargo run --bin baln-admin -- user ensure --email person@example.com --name "Person"
cargo run --bin baln-admin -- user enable --email person@example.com
cargo run --bin baln-admin -- user disable --email person@example.com
cargo run --bin baln-admin -- user unlink-google --email person@example.com
cargo run --bin baln-admin -- user revoke-sessions --email person@example.com
```

Disabling a user or revoking sessions increments `auth_version`, invalidating
already-issued access JWTs as well as refresh tokens. Personal API tokens are
independent of browser sessions: disabling the user invalidates them, while
revoking sessions does not.

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
They also cover semantic MCP movement conversion, atomic batch rollback,
natural-language recovery metadata, OAuth registration, access-token
authentication, PKCE calculation, and grant revocation.
