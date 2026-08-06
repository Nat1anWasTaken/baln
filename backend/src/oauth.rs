use std::collections::HashSet;

use axum::{
    Form, Json, Router,
    body::Body,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, Request, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Redirect, Response},
    routing::{get, post},
};
use base64::{
    Engine,
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
};
use chrono::{DateTime, Duration, Utc};
use rand::{RngCore, rngs::OsRng};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool};
use subtle::ConstantTimeEq;
use uuid::Uuid;

use crate::{
    ApiError, ApiResult,
    app::AppState,
    auth::{AuthenticatedSession, User},
};

const ACCESS_TOKEN_PREFIX: &str = "baln_mcp_at_";
const REFRESH_TOKEN_PREFIX: &str = "baln_mcp_rt_";
const AUTHORIZATION_CODE_PREFIX: &str = "baln_mcp_code_";
const RESOURCE_SCOPES: [&str; 3] = ["ledger:read", "ledger:write", "ledger:delete"];
const AUTHORIZATION_SCOPES: [&str; 4] = [
    RESOURCE_SCOPES[0],
    RESOURCE_SCOPES[1],
    RESOURCE_SCOPES[2],
    "offline_access",
];

#[derive(Clone, Debug)]
pub struct OAuthPrincipal {
    pub user: User,
    pub grant_id: Uuid,
    pub scopes: HashSet<String>,
}

impl OAuthPrincipal {
    pub fn require_scope(&self, scope: &str) -> Result<(), ToolAuthorizationError> {
        if self.scopes.contains(scope) {
            Ok(())
        } else {
            Err(ToolAuthorizationError {
                required_scope: scope.to_owned(),
            })
        }
    }
}

#[derive(Debug)]
pub struct ToolAuthorizationError {
    pub required_scope: String,
}

pub fn public_router() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/authorize", get(authorize))
        .route("/token", post(token))
        .route("/revoke", post(revoke))
}

pub fn account_router() -> Router<AppState> {
    Router::new()
        .route("/consent/{id}", get(consent_details).post(consent))
        .route("/connected-apps", get(connected_apps))
        .route("/connected-apps/{id}", post(revoke_connected_app))
}

pub async fn protected_resource_metadata(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "resource": format!("{}/mcp", state.config.public_base_url),
        "authorization_servers": [state.config.public_base_url],
        "bearer_methods_supported": ["header"],
        "scopes_supported": RESOURCE_SCOPES
    }))
}

pub async fn authorization_server_metadata(State(state): State<AppState>) -> Json<Value> {
    let base = &state.config.public_base_url;
    Json(json!({
        "issuer": base,
        "authorization_endpoint": format!("{base}/oauth/authorize"),
        "token_endpoint": format!("{base}/oauth/token"),
        "registration_endpoint": format!("{base}/oauth/register"),
        "revocation_endpoint": format!("{base}/oauth/revoke"),
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none", "client_secret_basic", "client_secret_post"],
        "scopes_supported": AUTHORIZATION_SCOPES
    }))
}

#[derive(Debug, Deserialize)]
struct RegistrationRequest {
    client_name: Option<String>,
    redirect_uris: Vec<String>,
    token_endpoint_auth_method: Option<String>,
    grant_types: Option<Vec<String>>,
    response_types: Option<Vec<String>>,
}

async fn register(
    State(state): State<AppState>,
    Json(request): Json<RegistrationRequest>,
) -> Response {
    match register_client(&state.pool, request).await {
        Ok(value) => (StatusCode::CREATED, Json(value)).into_response(),
        Err((code, description)) => oauth_error(StatusCode::BAD_REQUEST, code, description),
    }
}

async fn register_client(
    pool: &PgPool,
    request: RegistrationRequest,
) -> Result<Value, (&'static str, String)> {
    if request.redirect_uris.is_empty()
        || request
            .redirect_uris
            .iter()
            .any(|uri| !valid_redirect_uri(uri))
    {
        return Err((
            "invalid_redirect_uri",
            "Provide at least one HTTPS redirect URI. HTTP is accepted only for localhost."
                .to_owned(),
        ));
    }
    let token_endpoint_auth_method = request
        .token_endpoint_auth_method
        .as_deref()
        .unwrap_or("client_secret_basic");
    if !matches!(
        token_endpoint_auth_method,
        "none" | "client_secret_basic" | "client_secret_post"
    ) {
        return Err((
            "invalid_client_metadata",
            "Baln supports token_endpoint_auth_method values of none, client_secret_basic, and client_secret_post."
                .to_owned(),
        ));
    }
    if request.grant_types.as_ref().is_some_and(|values| {
        values
            .iter()
            .any(|value| value != "authorization_code" && value != "refresh_token")
    }) || request
        .response_types
        .as_ref()
        .is_some_and(|values| values.iter().any(|value| value != "code"))
    {
        return Err((
            "invalid_client_metadata",
            "Baln supports the authorization_code and refresh_token grants with the code response type."
                .to_owned(),
        ));
    }
    let client_id = format!("baln_client_{}", random_secret());
    let client_secret =
        (token_endpoint_auth_method != "none").then(|| format!("baln_mcp_cs_{}", random_secret()));
    let client_secret_hash = client_secret.as_deref().map(hash);
    let client_name = request
        .client_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("ChatGPT MCP client")
        .to_owned();
    sqlx::query(
        r#"
        INSERT INTO oauth_clients (
            id, client_id, client_name, redirect_uris,
            token_endpoint_auth_method, client_secret_hash
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(&client_id)
    .bind(&client_name)
    .bind(&request.redirect_uris)
    .bind(token_endpoint_auth_method)
    .bind(client_secret_hash)
    .execute(pool)
    .await
    .map_err(|_| {
        (
            "server_error",
            "Baln could not register the OAuth client. Try again.".to_owned(),
        )
    })?;
    let mut response = json!({
        "client_id": client_id,
        "client_id_issued_at": Utc::now().timestamp(),
        "client_name": client_name,
        "redirect_uris": request.redirect_uris,
        "token_endpoint_auth_method": token_endpoint_auth_method,
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"]
    });
    if let Some(client_secret) = client_secret {
        response["client_secret"] = Value::String(client_secret);
        response["client_secret_expires_at"] = Value::from(0);
    }
    Ok(response)
}

#[derive(Debug, Deserialize)]
struct AuthorizeQuery {
    response_type: Option<String>,
    client_id: String,
    redirect_uri: String,
    scope: Option<String>,
    state: Option<String>,
    code_challenge: Option<String>,
    code_challenge_method: Option<String>,
    resource: Option<String>,
}

async fn authorize(State(state): State<AppState>, Query(query): Query<AuthorizeQuery>) -> Response {
    match begin_authorization(&state, query).await {
        Ok(url) => Redirect::temporary(&url).into_response(),
        Err((status, code, description)) => oauth_error(status, code, description),
    }
}

async fn begin_authorization(
    state: &AppState,
    query: AuthorizeQuery,
) -> Result<String, (StatusCode, &'static str, String)> {
    if query.response_type.as_deref() != Some("code") {
        return Err((
            StatusCode::BAD_REQUEST,
            "unsupported_response_type",
            "Baln requires response_type=code.".to_owned(),
        ));
    }
    if query.code_challenge_method.as_deref() != Some("S256")
        || query.code_challenge.as_deref().is_none_or(str::is_empty)
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "invalid_request",
            "This connection requires PKCE with code_challenge_method=S256.".to_owned(),
        ));
    }
    let client = sqlx::query_as::<_, OAuthClient>(
        "SELECT client_id, redirect_uris FROM oauth_clients WHERE client_id = $1",
    )
    .bind(&query.client_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(server_oauth_error)?
    .ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "invalid_client",
            "The OAuth client is not registered with Baln.".to_owned(),
        )
    })?;
    if !client.redirect_uris.contains(&query.redirect_uri) {
        return Err((
            StatusCode::BAD_REQUEST,
            "invalid_request",
            "The redirect URI does not exactly match a registered URI.".to_owned(),
        ));
    }
    let expected_resource = format!("{}/mcp", state.config.public_base_url);
    if query.resource.as_deref() != Some(expected_resource.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            "invalid_target",
            format!("The OAuth resource must be {expected_resource}."),
        ));
    }
    let scopes = parse_scopes(query.scope.as_deref())
        .map_err(|description| (StatusCode::BAD_REQUEST, "invalid_scope", description))?;
    let id = Uuid::now_v7();
    sqlx::query(
        r#"
        INSERT INTO oauth_authorization_requests
                    (id, client_id, redirect_uri, state, code_challenge, resource, scopes, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
    )
    .bind(id)
    .bind(&client.client_id)
    .bind(&query.redirect_uri)
    .bind(&query.state)
    .bind(query.code_challenge.expect("validated"))
    .bind(expected_resource)
    .bind(&scopes)
    .bind(Utc::now() + Duration::minutes(10))
    .execute(&state.pool)
    .await
    .map_err(server_oauth_error)?;
    Ok(format!(
        "{}/oauth/consent?request_id={id}",
        state.config.frontend_origin.trim_end_matches('/')
    ))
}

#[derive(Debug, FromRow)]
struct OAuthClient {
    client_id: String,
    redirect_uris: Vec<String>,
}

#[derive(Debug, FromRow)]
struct PendingAuthorization {
    client_id: String,
    client_name: String,
    redirect_uri: String,
    state: Option<String>,
    code_challenge: String,
    resource: String,
    scopes: Vec<String>,
    expires_at: DateTime<Utc>,
    consumed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
struct ConsentDetails {
    request_id: Uuid,
    client_name: String,
    scopes: Vec<String>,
    expires_at: DateTime<Utc>,
}

async fn consent_details(
    State(state): State<AppState>,
    AuthenticatedSession(_): AuthenticatedSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<ConsentDetails>> {
    let request = load_pending_authorization(&state.pool, id).await?;
    ensure_pending(&request)?;
    Ok(Json(ConsentDetails {
        request_id: id,
        client_name: request.client_name,
        scopes: request.scopes,
        expires_at: request.expires_at,
    }))
}

#[derive(Debug, Deserialize)]
struct ConsentDecision {
    approve: bool,
}

async fn consent(
    State(state): State<AppState>,
    AuthenticatedSession(user): AuthenticatedSession,
    Path(id): Path<Uuid>,
    Json(decision): Json<ConsentDecision>,
) -> ApiResult<Json<Value>> {
    let mut transaction = state.pool.begin().await?;
    let request = sqlx::query_as::<_, PendingAuthorization>(
        r#"
        SELECT r.client_id, c.client_name, r.redirect_uri, r.state,
               r.code_challenge, r.resource, r.scopes, r.expires_at, r.consumed_at
          FROM oauth_authorization_requests r
          JOIN oauth_clients c ON c.client_id = r.client_id
         WHERE r.id = $1
         FOR UPDATE OF r
        "#,
    )
    .bind(id)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or_else(|| ApiError::not_found("OAuth authorization request"))?;
    ensure_pending(&request)?;
    sqlx::query("UPDATE oauth_authorization_requests SET consumed_at = now() WHERE id = $1")
        .bind(id)
        .execute(&mut *transaction)
        .await?;

    let redirect_url = if decision.approve {
        let grant_id = Uuid::now_v7();
        sqlx::query(
            r#"
            INSERT INTO oauth_grants (id, user_id, client_id, resource, scopes)
            VALUES ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(grant_id)
        .bind(user.id)
        .bind(&request.client_id)
        .bind(&request.resource)
        .bind(&request.scopes)
        .execute(&mut *transaction)
        .await?;
        let code = format!("{AUTHORIZATION_CODE_PREFIX}{}", random_secret());
        sqlx::query(
            r#"
            INSERT INTO oauth_authorization_codes
                        (code_hash, grant_id, redirect_uri, code_challenge, expires_at)
                 VALUES ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(hash(&code))
        .bind(grant_id)
        .bind(&request.redirect_uri)
        .bind(&request.code_challenge)
        .bind(Utc::now() + Duration::seconds(60))
        .execute(&mut *transaction)
        .await?;
        redirect_with_params(
            &request.redirect_uri,
            &[("code", code.as_str())],
            request.state.as_deref(),
        )?
    } else {
        redirect_with_params(
            &request.redirect_uri,
            &[
                ("error", "access_denied"),
                (
                    "error_description",
                    "The user declined access to their Baln ledger.",
                ),
            ],
            request.state.as_deref(),
        )?
    };
    transaction.commit().await?;
    Ok(Json(json!({
        "status": if decision.approve { "approved" } else { "denied" },
        "redirect_url": redirect_url
    })))
}

fn ensure_pending(request: &PendingAuthorization) -> ApiResult<()> {
    if request.consumed_at.is_some() {
        return Err(ApiError::conflict(
            "authorization_request_used",
            "This authorization request has already been completed. Return to ChatGPT and reconnect if necessary.",
        ));
    }
    if request.expires_at <= Utc::now() {
        return Err(ApiError::bad_request(
            "authorization_request_expired",
            "This authorization request has expired. Return to ChatGPT and start the connection again.",
        ));
    }
    Ok(())
}

async fn load_pending_authorization(pool: &PgPool, id: Uuid) -> ApiResult<PendingAuthorization> {
    sqlx::query_as::<_, PendingAuthorization>(
        r#"
        SELECT r.client_id, c.client_name, r.redirect_uri, r.state,
               r.code_challenge, r.resource, r.scopes, r.expires_at, r.consumed_at
          FROM oauth_authorization_requests r
          JOIN oauth_clients c ON c.client_id = r.client_id
         WHERE r.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| ApiError::not_found("OAuth authorization request"))
}

#[derive(Debug, Deserialize)]
struct TokenRequest {
    grant_type: String,
    client_id: Option<String>,
    client_secret: Option<String>,
    code: Option<String>,
    redirect_uri: Option<String>,
    code_verifier: Option<String>,
    refresh_token: Option<String>,
    resource: Option<String>,
}

#[derive(Debug, Serialize)]
struct OAuthTokenResponse {
    access_token: String,
    token_type: &'static str,
    expires_in: i64,
    scope: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    refresh_token: Option<String>,
}

#[derive(Debug, FromRow)]
struct TokenClient {
    token_endpoint_auth_method: String,
    client_secret_hash: Option<Vec<u8>>,
}

async fn token(
    State(state): State<AppState>,
    headers: HeaderMap,
    Form(mut request): Form<TokenRequest>,
) -> Response {
    let client_id = match authenticate_token_client(&state.pool, &headers, &request).await {
        Ok(client_id) => client_id,
        Err((status, code, description)) => {
            let mut response = oauth_error(status, code, description);
            if status == StatusCode::UNAUTHORIZED {
                response.headers_mut().insert(
                    header::WWW_AUTHENTICATE,
                    HeaderValue::from_static("Basic realm=\"Baln OAuth token\""),
                );
            }
            return response;
        }
    };
    request.client_id = Some(client_id);
    let result = match request.grant_type.as_str() {
        "authorization_code" => exchange_authorization_code(&state, request).await,
        "refresh_token" => refresh_oauth_token(&state, request).await,
        _ => Err((
            "unsupported_grant_type",
            "Baln supports authorization_code and refresh_token grants.".to_owned(),
        )),
    };
    match result {
        Ok(response) => (
            [
                (header::CACHE_CONTROL, "no-store"),
                (header::PRAGMA, "no-cache"),
            ],
            Json(response),
        )
            .into_response(),
        Err((code, description)) => oauth_error(StatusCode::BAD_REQUEST, code, description),
    }
}

async fn authenticate_token_client(
    pool: &PgPool,
    headers: &HeaderMap,
    request: &TokenRequest,
) -> Result<String, (StatusCode, &'static str, String)> {
    let basic_credentials =
        parse_basic_client_credentials(headers).map_err(|_| invalid_client_authentication())?;
    let client_id = match (&basic_credentials, request.client_id.as_deref()) {
        (Some((basic_client_id, _)), Some(form_client_id)) if basic_client_id != form_client_id => {
            return Err(invalid_client_authentication());
        }
        (Some((basic_client_id, _)), _) if !basic_client_id.is_empty() => basic_client_id.clone(),
        (None, Some(form_client_id)) if !form_client_id.is_empty() => form_client_id.to_owned(),
        _ => return Err(invalid_client_authentication()),
    };
    let client = sqlx::query_as::<_, TokenClient>(
        r#"
        SELECT token_endpoint_auth_method, client_secret_hash
          FROM oauth_clients
         WHERE client_id = $1
        "#,
    )
    .bind(&client_id)
    .fetch_optional(pool)
    .await
    .map_err(server_oauth_error)?
    .ok_or_else(invalid_client_authentication)?;

    let authenticated = match client.token_endpoint_auth_method.as_str() {
        "none" => {
            basic_credentials.is_none()
                && request.client_secret.as_deref().is_none_or(str::is_empty)
        }
        "client_secret_basic" => {
            request.client_secret.as_deref().is_none_or(str::is_empty)
                && basic_credentials.as_ref().is_some_and(|(_, secret)| {
                    client_secret_matches(client.client_secret_hash.as_deref(), secret)
                })
        }
        "client_secret_post" => {
            basic_credentials.is_none()
                && request.client_secret.as_deref().is_some_and(|secret| {
                    !secret.is_empty()
                        && client_secret_matches(client.client_secret_hash.as_deref(), secret)
                })
        }
        _ => false,
    };
    if authenticated {
        Ok(client_id)
    } else {
        Err(invalid_client_authentication())
    }
}

fn parse_basic_client_credentials(headers: &HeaderMap) -> Result<Option<(String, String)>, ()> {
    let Some(value) = headers.get(header::AUTHORIZATION) else {
        return Ok(None);
    };
    let value = value.to_str().map_err(|_| ())?;
    let (scheme, encoded) = value.split_once(' ').ok_or(())?;
    if !scheme.eq_ignore_ascii_case("Basic") {
        return Err(());
    }
    let decoded = STANDARD.decode(encoded.trim()).map_err(|_| ())?;
    let decoded = String::from_utf8(decoded).map_err(|_| ())?;
    let (client_id, client_secret) = decoded.split_once(':').ok_or(())?;
    Ok(Some((client_id.to_owned(), client_secret.to_owned())))
}

fn client_secret_matches(stored_hash: Option<&[u8]>, presented_secret: &str) -> bool {
    let presented_hash = hash(presented_secret);
    stored_hash.is_some_and(|stored_hash| bool::from(stored_hash.ct_eq(presented_hash.as_slice())))
}

fn invalid_client_authentication() -> (StatusCode, &'static str, String) {
    (
        StatusCode::UNAUTHORIZED,
        "invalid_client",
        "The OAuth client credentials are missing or invalid.".to_owned(),
    )
}

#[derive(Debug, FromRow)]
struct AuthorizationCodeRow {
    grant_id: Uuid,
    client_id: String,
    redirect_uri: String,
    code_challenge: String,
    scopes: Vec<String>,
    resource: String,
    expires_at: DateTime<Utc>,
    used_at: Option<DateTime<Utc>>,
    revoked_at: Option<DateTime<Utc>>,
}

async fn exchange_authorization_code(
    state: &AppState,
    request: TokenRequest,
) -> Result<OAuthTokenResponse, (&'static str, String)> {
    let client_id = required_token_field(request.client_id, "client_id")?;
    let code = required_token_field(request.code, "code")?;
    let redirect_uri = required_token_field(request.redirect_uri, "redirect_uri")?;
    let verifier = required_token_field(request.code_verifier, "code_verifier")?;
    let mut transaction = state.pool.begin().await.map_err(token_server_error)?;
    let row = sqlx::query_as::<_, AuthorizationCodeRow>(
        r#"
        SELECT c.grant_id, g.client_id, c.redirect_uri, c.code_challenge,
               g.scopes, g.resource, c.expires_at, c.used_at, g.revoked_at
          FROM oauth_authorization_codes c
          JOIN oauth_grants g ON g.id = c.grant_id
         WHERE c.code_hash = $1
         FOR UPDATE OF c, g
        "#,
    )
    .bind(hash(&code))
    .fetch_optional(&mut *transaction)
    .await
    .map_err(token_server_error)?
    .ok_or_else(invalid_grant)?;
    if row.used_at.is_some()
        || row.revoked_at.is_some()
        || row.expires_at <= Utc::now()
        || row.client_id != client_id
        || row.redirect_uri != redirect_uri
        || pkce_challenge(&verifier) != row.code_challenge
        || request
            .resource
            .as_deref()
            .is_some_and(|resource| resource != row.resource)
    {
        return Err(invalid_grant());
    }
    sqlx::query("UPDATE oauth_authorization_codes SET used_at = now() WHERE code_hash = $1")
        .bind(hash(&code))
        .execute(&mut *transaction)
        .await
        .map_err(token_server_error)?;
    let response = issue_oauth_tokens(
        &mut transaction,
        row.grant_id,
        &row.scopes,
        state.config.oauth_access_token_ttl_seconds,
        state.config.oauth_refresh_token_ttl_seconds,
    )
    .await?;
    transaction.commit().await.map_err(token_server_error)?;
    Ok(response)
}

#[derive(Debug, FromRow)]
struct OAuthRefreshRow {
    id: Uuid,
    family_id: Uuid,
    grant_id: Uuid,
    client_id: String,
    scopes: Vec<String>,
    resource: String,
    expires_at: DateTime<Utc>,
    revoked_at: Option<DateTime<Utc>>,
    replaced_by: Option<Uuid>,
    grant_revoked_at: Option<DateTime<Utc>>,
    user_active: bool,
}

async fn refresh_oauth_token(
    state: &AppState,
    request: TokenRequest,
) -> Result<OAuthTokenResponse, (&'static str, String)> {
    let client_id = required_token_field(request.client_id, "client_id")?;
    let raw_token = required_token_field(request.refresh_token, "refresh_token")?;
    let mut transaction = state.pool.begin().await.map_err(token_server_error)?;
    let row = sqlx::query_as::<_, OAuthRefreshRow>(
        r#"
        SELECT r.id, r.family_id, r.grant_id, g.client_id, g.scopes, g.resource,
               r.expires_at, r.revoked_at, r.replaced_by,
               g.revoked_at AS grant_revoked_at, u.active AS user_active
          FROM oauth_refresh_tokens r
          JOIN oauth_grants g ON g.id = r.grant_id
          JOIN users u ON u.id = g.user_id
         WHERE r.token_hash = $1
         FOR UPDATE OF r, g
        "#,
    )
    .bind(hash(&raw_token))
    .fetch_optional(&mut *transaction)
    .await
    .map_err(token_server_error)?
    .ok_or_else(invalid_grant)?;
    if row.revoked_at.is_some() && row.replaced_by.is_some() {
        sqlx::query("UPDATE oauth_grants SET revoked_at = COALESCE(revoked_at, now()), updated_at = now() WHERE id = $1")
            .bind(row.grant_id)
            .execute(&mut *transaction)
            .await
            .map_err(token_server_error)?;
        sqlx::query("UPDATE oauth_refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE family_id = $1")
            .bind(row.family_id)
            .execute(&mut *transaction)
            .await
            .map_err(token_server_error)?;
        transaction.commit().await.map_err(token_server_error)?;
        return Err((
            "invalid_grant",
            "This refresh token was already used, so the Baln connection has been revoked. Reconnect Baln in ChatGPT.".to_owned(),
        ));
    }
    if row.revoked_at.is_some()
        || row.grant_revoked_at.is_some()
        || row.expires_at <= Utc::now()
        || !row.user_active
        || row.client_id != client_id
        || request
            .resource
            .as_deref()
            .is_some_and(|resource| resource != row.resource)
    {
        return Err(invalid_grant());
    }
    let access_token = format!("{ACCESS_TOKEN_PREFIX}{}", random_secret());
    sqlx::query(
        "INSERT INTO oauth_access_tokens (id, grant_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)",
    )
    .bind(Uuid::now_v7())
    .bind(row.grant_id)
    .bind(hash(&access_token))
    .bind(Utc::now() + Duration::seconds(state.config.oauth_access_token_ttl_seconds))
    .execute(&mut *transaction)
    .await
    .map_err(token_server_error)?;
    let replacement_id = Uuid::now_v7();
    let replacement = format!("{REFRESH_TOKEN_PREFIX}{}", random_secret());
    sqlx::query(
        r#"
        INSERT INTO oauth_refresh_tokens
                    (id, family_id, grant_id, token_hash, expires_at)
             VALUES ($1, $2, $3, $4, $5)
        "#,
    )
    .bind(replacement_id)
    .bind(row.family_id)
    .bind(row.grant_id)
    .bind(hash(&replacement))
    .bind(Utc::now() + Duration::seconds(state.config.oauth_refresh_token_ttl_seconds))
    .execute(&mut *transaction)
    .await
    .map_err(token_server_error)?;
    sqlx::query(
        "UPDATE oauth_refresh_tokens SET revoked_at = now(), replaced_by = $2, last_used_at = now() WHERE id = $1",
    )
    .bind(row.id)
    .bind(replacement_id)
    .execute(&mut *transaction)
    .await
    .map_err(token_server_error)?;
    transaction.commit().await.map_err(token_server_error)?;
    Ok(OAuthTokenResponse {
        access_token,
        token_type: "Bearer",
        expires_in: state.config.oauth_access_token_ttl_seconds,
        scope: row.scopes.join(" "),
        refresh_token: Some(replacement),
    })
}

async fn issue_oauth_tokens(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    grant_id: Uuid,
    scopes: &[String],
    access_ttl: i64,
    refresh_ttl: i64,
) -> Result<OAuthTokenResponse, (&'static str, String)> {
    let access_token = format!("{ACCESS_TOKEN_PREFIX}{}", random_secret());
    sqlx::query(
        "INSERT INTO oauth_access_tokens (id, grant_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)",
    )
    .bind(Uuid::now_v7())
    .bind(grant_id)
    .bind(hash(&access_token))
    .bind(Utc::now() + Duration::seconds(access_ttl))
    .execute(&mut **transaction)
    .await
    .map_err(token_server_error)?;
    // The authorization server decides whether to issue a refresh token. Do not
    // require the OIDC-specific `offline_access` scope: OAuth/MCP clients may
    // advertise the refresh-token grant without requesting that scope.
    let refresh_token = format!("{REFRESH_TOKEN_PREFIX}{}", random_secret());
    let refresh_token_id = Uuid::now_v7();
    sqlx::query(
        r#"
        INSERT INTO oauth_refresh_tokens
                    (id, family_id, grant_id, token_hash, expires_at)
             VALUES ($1, $1, $2, $3, $4)
        "#,
    )
    .bind(refresh_token_id)
    .bind(grant_id)
    .bind(hash(&refresh_token))
    .bind(Utc::now() + Duration::seconds(refresh_ttl))
    .execute(&mut **transaction)
    .await
    .map_err(token_server_error)?;
    Ok(OAuthTokenResponse {
        access_token,
        token_type: "Bearer",
        expires_in: access_ttl,
        scope: scopes.join(" "),
        refresh_token: Some(refresh_token),
    })
}

#[derive(Debug, Deserialize)]
struct RevokeRequest {
    token: String,
    client_id: Option<String>,
}

async fn revoke(State(state): State<AppState>, Form(request): Form<RevokeRequest>) -> StatusCode {
    let token_hash = hash(&request.token);
    let _ = sqlx::query(
        r#"
        UPDATE oauth_grants
           SET revoked_at = COALESCE(revoked_at, now()), updated_at = now()
         WHERE id IN (
             SELECT grant_id FROM oauth_access_tokens WHERE token_hash = $1
             UNION
             SELECT grant_id FROM oauth_refresh_tokens WHERE token_hash = $1
         )
           AND ($2::text IS NULL OR client_id = $2)
        "#,
    )
    .bind(token_hash)
    .bind(request.client_id)
    .execute(&state.pool)
    .await;
    StatusCode::OK
}

#[derive(Debug, Serialize, FromRow)]
struct ConnectedApp {
    id: Uuid,
    client_name: String,
    scopes: Vec<String>,
    created_at: DateTime<Utc>,
}

async fn connected_apps(
    State(state): State<AppState>,
    AuthenticatedSession(user): AuthenticatedSession,
) -> ApiResult<Json<Vec<ConnectedApp>>> {
    Ok(Json(
        sqlx::query_as::<_, ConnectedApp>(
            r#"
            SELECT g.id, c.client_name, g.scopes, g.created_at
              FROM oauth_grants g
              JOIN oauth_clients c ON c.client_id = g.client_id
             WHERE g.user_id = $1 AND g.revoked_at IS NULL
             ORDER BY g.created_at DESC
            "#,
        )
        .bind(user.id)
        .fetch_all(&state.pool)
        .await?,
    ))
}

async fn revoke_connected_app(
    State(state): State<AppState>,
    AuthenticatedSession(user): AuthenticatedSession,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let result = sqlx::query(
        "UPDATE oauth_grants SET revoked_at = COALESCE(revoked_at, now()), updated_at = now() WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(user.id)
    .execute(&state.pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("connected app"));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn authenticate_access_token(
    pool: &PgPool,
    raw_token: &str,
) -> ApiResult<OAuthPrincipal> {
    #[derive(FromRow)]
    struct PrincipalRow {
        grant_id: Uuid,
        scopes: Vec<String>,
        id: Uuid,
        email: String,
        display_name: String,
        google_sub: Option<String>,
        active: bool,
        auth_version: i32,
        created_at: DateTime<Utc>,
        updated_at: DateTime<Utc>,
    }
    if !raw_token.starts_with(ACCESS_TOKEN_PREFIX) {
        return Err(ApiError::unauthorized(
            "This endpoint requires a Baln MCP OAuth access token.",
        ));
    }
    let row = sqlx::query_as::<_, PrincipalRow>(
        r#"
        SELECT g.id AS grant_id, g.scopes, u.id, u.email::text AS email,
               u.display_name, u.google_sub, u.active, u.auth_version,
               u.created_at, u.updated_at
          FROM oauth_access_tokens t
          JOIN oauth_grants g ON g.id = t.grant_id
          JOIN users u ON u.id = g.user_id
         WHERE t.token_hash = $1
           AND t.revoked_at IS NULL
           AND t.expires_at > now()
           AND g.revoked_at IS NULL
           AND u.active
        "#,
    )
    .bind(hash(raw_token))
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| {
        ApiError::unauthorized(
            "The Baln MCP access token is invalid or expired. Reauthorize the Baln connection.",
        )
    })?;
    Ok(OAuthPrincipal {
        grant_id: row.grant_id,
        scopes: row.scopes.into_iter().collect(),
        user: User {
            id: row.id,
            email: row.email,
            display_name: row.display_name,
            google_sub: row.google_sub,
            active: row.active,
            auth_version: row.auth_version,
            created_at: row.created_at,
            updated_at: row.updated_at,
        },
    })
}

pub async fn mcp_auth(
    State(state): State<AppState>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    let token = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    let principal = match token {
        Some(token) => authenticate_access_token(&state.pool, token).await,
        None => Err(ApiError::unauthorized(
            "A Baln MCP OAuth access token is required.",
        )),
    };
    match principal {
        Ok(principal) => {
            request.extensions_mut().insert(principal);
            next.run(request).await
        }
        Err(_) => {
            let metadata = format!(
                "{}/.well-known/oauth-protected-resource/mcp",
                state.config.public_base_url
            );
            (
                StatusCode::UNAUTHORIZED,
                [
                    (
                        header::WWW_AUTHENTICATE,
                        format!(
                            "Bearer resource_metadata=\"{metadata}\", scope=\"ledger:read ledger:write ledger:delete\""
                        ),
                    ),
                    (header::CACHE_CONTROL, "no-store".to_owned()),
                ],
                Json(json!({
                    "error": "invalid_token",
                    "error_description": "The Baln connection is missing, expired, or revoked. Reauthorize Baln in ChatGPT.",
                    "resource_metadata": metadata
                })),
            )
                .into_response()
        }
    }
}

fn parse_scopes(value: Option<&str>) -> Result<Vec<String>, String> {
    let requested = value
        .unwrap_or("ledger:read ledger:write ledger:delete")
        .split_whitespace();
    let mut scopes = Vec::new();
    for scope in requested {
        if !AUTHORIZATION_SCOPES.contains(&scope) {
            return Err(format!(
                "Scope “{scope}” is not supported. Supported scopes are {}.",
                AUTHORIZATION_SCOPES.join(", ")
            ));
        }
        if !scopes.iter().any(|existing| existing == scope) {
            scopes.push(scope.to_owned());
        }
    }
    if scopes.is_empty() {
        scopes.push("ledger:read".to_owned());
    }
    Ok(scopes)
}

fn valid_redirect_uri(value: &str) -> bool {
    let Ok(url) = url::Url::parse(value) else {
        return false;
    };
    if url.fragment().is_some() {
        return false;
    }
    url.scheme() == "https"
        || (url.scheme() == "http"
            && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1")))
}

fn redirect_with_params(
    redirect_uri: &str,
    values: &[(&str, &str)],
    state: Option<&str>,
) -> ApiResult<String> {
    let mut url = url::Url::parse(redirect_uri)
        .map_err(|error| ApiError::internal(format!("stored redirect URI: {error}")))?;
    {
        let mut pairs = url.query_pairs_mut();
        for (name, value) in values {
            pairs.append_pair(name, value);
        }
        if let Some(state) = state {
            pairs.append_pair("state", state);
        }
    }
    Ok(url.to_string())
}

fn required_token_field(
    value: Option<String>,
    name: &str,
) -> Result<String, (&'static str, String)> {
    value.filter(|value| !value.is_empty()).ok_or_else(|| {
        (
            "invalid_request",
            format!("The token request is missing {name}."),
        )
    })
}

fn invalid_grant() -> (&'static str, String) {
    (
        "invalid_grant",
        "The authorization grant is invalid, expired, already used, or revoked. Reconnect Baln if the problem continues."
            .to_owned(),
    )
}

fn server_oauth_error(_: sqlx::Error) -> (StatusCode, &'static str, String) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        "server_error",
        "Baln could not complete the OAuth request. Try again.".to_owned(),
    )
}

fn token_server_error(_: sqlx::Error) -> (&'static str, String) {
    (
        "server_error",
        "Baln could not issue a token. Try again.".to_owned(),
    )
}

fn oauth_error(status: StatusCode, code: &'static str, description: String) -> Response {
    (
        status,
        [(header::CACHE_CONTROL, "no-store")],
        Json(json!({
            "error": code,
            "error_description": description
        })),
    )
        .into_response()
}

fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn random_secret() -> String {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn hash(value: &str) -> Vec<u8> {
    Sha256::digest(value.as_bytes()).to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redirect_uri_policy_rejects_insecure_remote_and_fragments() {
        assert!(valid_redirect_uri("https://chatgpt.com/aip/oauth/callback"));
        assert!(valid_redirect_uri("http://localhost:3000/callback"));
        assert!(!valid_redirect_uri("http://example.com/callback"));
        assert!(!valid_redirect_uri("https://example.com/callback#fragment"));
    }

    #[test]
    fn scopes_are_deduplicated_and_unknown_values_are_explained() {
        assert_eq!(
            parse_scopes(None).unwrap(),
            vec!["ledger:read", "ledger:write", "ledger:delete"]
        );
        assert_eq!(
            parse_scopes(Some("ledger:read ledger:read offline_access")).unwrap(),
            vec!["ledger:read", "offline_access"]
        );
        let error = parse_scopes(Some("ledger:admin")).unwrap_err();
        assert!(error.contains("ledger:admin"));
        assert!(error.contains("not supported"));
    }

    #[test]
    fn pkce_uses_s256_base64url_without_padding() {
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    fn token_request(client_id: Option<&str>, client_secret: Option<&str>) -> TokenRequest {
        TokenRequest {
            grant_type: "authorization_code".to_owned(),
            client_id: client_id.map(str::to_owned),
            client_secret: client_secret.map(str::to_owned),
            code: None,
            redirect_uri: None,
            code_verifier: None,
            refresh_token: None,
            resource: None,
        }
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn dynamic_registration_persists_a_public_client(pool: PgPool) {
        let value = register_client(
            &pool,
            RegistrationRequest {
                client_name: Some("ChatGPT".to_owned()),
                redirect_uris: vec!["https://chatgpt.com/aip/oauth/callback".to_owned()],
                token_endpoint_auth_method: Some("none".to_owned()),
                grant_types: Some(vec![
                    "authorization_code".to_owned(),
                    "refresh_token".to_owned(),
                ]),
                response_types: Some(vec!["code".to_owned()]),
            },
        )
        .await
        .unwrap();
        let client_id = value["client_id"].as_str().unwrap();
        let stored: (String, Vec<String>, String, Option<Vec<u8>>) = sqlx::query_as(
            r#"
            SELECT client_name, redirect_uris, token_endpoint_auth_method, client_secret_hash
              FROM oauth_clients
             WHERE client_id = $1
            "#,
        )
        .bind(client_id)
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(value["token_endpoint_auth_method"], "none");
        assert!(value["client_secret"].is_null());
        assert_eq!(stored.0, "ChatGPT");
        assert_eq!(stored.1, vec!["https://chatgpt.com/aip/oauth/callback"]);
        assert_eq!(stored.2, "none");
        assert!(stored.3.is_none());
        assert_eq!(
            authenticate_token_client(
                &pool,
                &HeaderMap::new(),
                &token_request(Some(client_id), None),
            )
            .await
            .unwrap(),
            client_id
        );
        assert_eq!(
            authenticate_token_client(
                &pool,
                &HeaderMap::new(),
                &token_request(Some(client_id), Some("unexpected-secret")),
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::UNAUTHORIZED
        );
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn dynamic_registration_defaults_to_confidential_basic_client(pool: PgPool) {
        let value = register_client(
            &pool,
            RegistrationRequest {
                client_name: Some("Google".to_owned()),
                redirect_uris: vec!["https://gemini.google.com/mcp/oauth/callback".to_owned()],
                token_endpoint_auth_method: None,
                grant_types: Some(vec![
                    "authorization_code".to_owned(),
                    "refresh_token".to_owned(),
                ]),
                response_types: Some(vec!["code".to_owned()]),
            },
        )
        .await
        .unwrap();
        let client_id = value["client_id"].as_str().unwrap();
        let client_secret = value["client_secret"].as_str().unwrap();
        let stored: (String, Option<Vec<u8>>) = sqlx::query_as(
            r#"
            SELECT token_endpoint_auth_method, client_secret_hash
              FROM oauth_clients
             WHERE client_id = $1
            "#,
        )
        .bind(client_id)
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(value["token_endpoint_auth_method"], "client_secret_basic");
        assert_eq!(value["client_secret_expires_at"], 0);
        assert!(client_secret.starts_with("baln_mcp_cs_"));
        assert_eq!(stored.0, "client_secret_basic");
        assert_eq!(stored.1.unwrap(), hash(client_secret));

        let mut headers = HeaderMap::new();
        let credentials = STANDARD.encode(format!("{client_id}:{client_secret}"));
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Basic {credentials}")).unwrap(),
        );
        assert_eq!(
            authenticate_token_client(&pool, &headers, &token_request(None, None))
                .await
                .unwrap(),
            client_id
        );

        let mut wrong_headers = HeaderMap::new();
        let wrong_credentials = STANDARD.encode(format!("{client_id}:wrong-secret"));
        wrong_headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Basic {wrong_credentials}")).unwrap(),
        );
        assert_eq!(
            authenticate_token_client(&pool, &wrong_headers, &token_request(None, None))
                .await
                .unwrap_err()
                .0,
            StatusCode::UNAUTHORIZED
        );
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn confidential_post_client_authenticates_only_in_the_request_body(pool: PgPool) {
        let value = register_client(
            &pool,
            RegistrationRequest {
                client_name: Some("MCP post client".to_owned()),
                redirect_uris: vec!["https://example.com/oauth/callback".to_owned()],
                token_endpoint_auth_method: Some("client_secret_post".to_owned()),
                grant_types: None,
                response_types: None,
            },
        )
        .await
        .unwrap();
        let client_id = value["client_id"].as_str().unwrap();
        let client_secret = value["client_secret"].as_str().unwrap();

        assert_eq!(
            authenticate_token_client(
                &pool,
                &HeaderMap::new(),
                &token_request(Some(client_id), Some(client_secret)),
            )
            .await
            .unwrap(),
            client_id
        );
        assert_eq!(
            authenticate_token_client(
                &pool,
                &HeaderMap::new(),
                &token_request(Some(client_id), Some("wrong-secret")),
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::UNAUTHORIZED
        );

        let mut headers = HeaderMap::new();
        let credentials = STANDARD.encode(format!("{client_id}:{client_secret}"));
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Basic {credentials}")).unwrap(),
        );
        assert_eq!(
            authenticate_token_client(&pool, &headers, &token_request(None, None))
                .await
                .unwrap_err()
                .0,
            StatusCode::UNAUTHORIZED
        );
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn initial_token_issuance_includes_refresh_without_offline_access(pool: PgPool) {
        let user_id = Uuid::now_v7();
        sqlx::query("INSERT INTO users (id, email, display_name) VALUES ($1, $2, 'MCP User')")
            .bind(user_id)
            .bind(format!("{user_id}@example.com"))
            .execute(&pool)
            .await
            .unwrap();
        let client_id = "baln_client_refresh_test";
        sqlx::query(
            "INSERT INTO oauth_clients (id, client_id, client_name, redirect_uris) VALUES ($1, $2, 'Test', $3)",
        )
        .bind(Uuid::now_v7())
        .bind(client_id)
        .bind(vec!["https://chatgpt.com/aip/oauth/callback"])
        .execute(&pool)
        .await
        .unwrap();
        let grant_id = Uuid::now_v7();
        let scopes = vec!["ledger:read".to_owned()];
        sqlx::query(
            "INSERT INTO oauth_grants (id, user_id, client_id, resource, scopes) VALUES ($1, $2, $3, 'https://b.nath.tw/mcp', $4)",
        )
        .bind(grant_id)
        .bind(user_id)
        .bind(client_id)
        .bind(&scopes)
        .execute(&pool)
        .await
        .unwrap();

        let mut transaction = pool.begin().await.unwrap();
        let response = issue_oauth_tokens(&mut transaction, grant_id, &scopes, 900, 2_592_000)
            .await
            .unwrap();
        transaction.commit().await.unwrap();

        assert_eq!(response.scope, "ledger:read");
        assert!(response.refresh_token.is_some());
        let stored_refresh_tokens: i64 =
            sqlx::query_scalar("SELECT count(*) FROM oauth_refresh_tokens WHERE grant_id = $1")
                .bind(grant_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(stored_refresh_tokens, 1);
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn oauth_access_tokens_resolve_one_active_user_and_grant(pool: PgPool) {
        let user_id = Uuid::now_v7();
        sqlx::query("INSERT INTO users (id, email, display_name) VALUES ($1, $2, 'MCP User')")
            .bind(user_id)
            .bind(format!("{user_id}@example.com"))
            .execute(&pool)
            .await
            .unwrap();
        let client_id = "baln_client_test";
        sqlx::query(
            "INSERT INTO oauth_clients (id, client_id, client_name, redirect_uris) VALUES ($1, $2, 'Test', $3)",
        )
        .bind(Uuid::now_v7())
        .bind(client_id)
        .bind(vec!["https://chatgpt.com/aip/oauth/callback"])
        .execute(&pool)
        .await
        .unwrap();
        let grant_id = Uuid::now_v7();
        sqlx::query(
            "INSERT INTO oauth_grants (id, user_id, client_id, resource, scopes) VALUES ($1, $2, $3, 'https://b.nath.tw/mcp', $4)",
        )
        .bind(grant_id)
        .bind(user_id)
        .bind(client_id)
        .bind(vec!["ledger:read", "ledger:write"])
        .execute(&pool)
        .await
        .unwrap();
        let raw_token = format!("{ACCESS_TOKEN_PREFIX}test-secret");
        sqlx::query(
            "INSERT INTO oauth_access_tokens (id, grant_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '15 minutes')",
        )
        .bind(Uuid::now_v7())
        .bind(grant_id)
        .bind(hash(&raw_token))
        .execute(&pool)
        .await
        .unwrap();

        let principal = authenticate_access_token(&pool, &raw_token).await.unwrap();
        assert_eq!(principal.user.id, user_id);
        assert_eq!(principal.grant_id, grant_id);
        assert!(principal.scopes.contains("ledger:write"));

        sqlx::query("UPDATE oauth_grants SET revoked_at = now() WHERE id = $1")
            .bind(grant_id)
            .execute(&pool)
            .await
            .unwrap();
        assert!(authenticate_access_token(&pool, &raw_token).await.is_err());
    }
}
