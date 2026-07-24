use axum::{
    Json, Router,
    extract::{Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Redirect, Response},
    routing::{delete, get, post},
};
use cookie::{Cookie, SameSite, time::Duration};
use serde::Deserialize;

use crate::{
    ApiError, ApiResult,
    app::AppState,
    auth::{AuthenticatedUser, service::TokenResponse},
};

const REFRESH_COOKIE: &str = "baln_refresh";

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/google/start", get(start))
        .route("/google/callback", get(callback))
        .route("/token", post(token))
        .route("/refresh", post(refresh))
        .route("/logout", post(logout))
        .route("/me", get(me))
        .route(
            "/api-tokens",
            get(super::api_tokens::list).post(super::api_tokens::create),
        )
        .route("/api-tokens/{id}", delete(super::api_tokens::revoke))
}

#[utoipa::path(
    get,
    path = "/api/v1/auth/google/start",
    tag = "auth",
    responses((status = 307, description = "Redirect to Google"))
)]
pub(crate) async fn start(State(state): State<AppState>) -> ApiResult<Redirect> {
    let result = state.auth.start_login().await?;
    Ok(Redirect::temporary(&result.url))
}

#[derive(Deserialize)]
pub(crate) struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

#[utoipa::path(
    get,
    path = "/api/v1/auth/google/callback",
    tag = "auth",
    params(
        ("code" = Option<String>, Query, description = "Google authorization code"),
        ("state" = Option<String>, Query, description = "OIDC CSRF state"),
        ("error" = Option<String>, Query, description = "Google authorization error")
    ),
    responses((status = 307, description = "Redirect to the configured frontend callback"))
)]
pub(crate) async fn callback(
    State(state): State<AppState>,
    Query(query): Query<CallbackQuery>,
) -> ApiResult<Redirect> {
    if let Some(error) = query.error {
        return Err(ApiError::unauthorized(format!(
            "Google authentication failed: {error}"
        )));
    }
    let result = state
        .auth
        .finish_callback(
            query
                .code
                .ok_or_else(|| ApiError::bad_request("missing_code", "missing OAuth code"))?,
            query
                .state
                .ok_or_else(|| ApiError::bad_request("missing_state", "missing OAuth state"))?,
        )
        .await?;
    Ok(Redirect::temporary(&result.frontend_redirect))
}

#[derive(Deserialize, utoipa::ToSchema)]
pub struct ExchangeCodeRequest {
    code: String,
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/token",
    tag = "auth",
    request_body = ExchangeCodeRequest,
    responses((status = 200, body = TokenResponse))
)]
pub(crate) async fn token(
    State(state): State<AppState>,
    Json(request): Json<ExchangeCodeRequest>,
) -> ApiResult<Response> {
    let issued = state.auth.exchange_code(&request.code).await?;
    token_response(&state, issued.response, issued.refresh_token)
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/refresh",
    tag = "auth",
    responses((status = 200, body = TokenResponse))
)]
pub(crate) async fn refresh(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    validate_origin(&state, &headers)?;
    let refresh_token = read_refresh_cookie(&headers)?;
    let issued = state.auth.refresh(&refresh_token).await?;
    token_response(&state, issued.response, issued.refresh_token)
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/logout",
    tag = "auth",
    responses((status = 204, description = "Refresh token revoked"))
)]
pub(crate) async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    validate_origin(&state, &headers)?;
    if let Ok(token) = read_refresh_cookie(&headers) {
        state.auth.logout(&token).await?;
    }
    let cookie = Cookie::build((REFRESH_COOKIE, ""))
        .path("/api/v1/auth")
        .http_only(true)
        .secure(state.config.cookie_secure)
        .same_site(SameSite::Lax)
        .max_age(Duration::ZERO)
        .build();
    Ok((
        StatusCode::NO_CONTENT,
        [(header::SET_COOKIE, cookie.to_string())],
    )
        .into_response())
}

#[utoipa::path(
    get,
    path = "/api/v1/auth/me",
    tag = "auth",
    security(("bearer_auth" = [])),
    responses((status = 200, body = crate::auth::User))
)]
pub(crate) async fn me(AuthenticatedUser(user): AuthenticatedUser) -> Json<crate::auth::User> {
    Json(user)
}

fn token_response(
    state: &AppState,
    body: TokenResponse,
    refresh_token: String,
) -> ApiResult<Response> {
    let cookie = Cookie::build((REFRESH_COOKIE, refresh_token))
        .path("/api/v1/auth")
        .http_only(true)
        .secure(state.config.cookie_secure)
        .same_site(SameSite::Lax)
        .max_age(Duration::seconds(state.config.refresh_token_ttl_seconds))
        .build();
    let header = HeaderValue::from_str(&cookie.to_string())
        .map_err(|error| ApiError::internal(format!("refresh cookie: {error}")))?;
    Ok((
        [
            (header::SET_COOKIE, header),
            (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
            (header::PRAGMA, HeaderValue::from_static("no-cache")),
        ],
        Json(body),
    )
        .into_response())
}

fn read_refresh_cookie(headers: &HeaderMap) -> ApiResult<String> {
    let header = headers
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| ApiError::unauthorized("missing refresh cookie"))?;
    header
        .split(';')
        .filter_map(|part| Cookie::parse(part.trim().to_owned()).ok())
        .find(|cookie| cookie.name() == REFRESH_COOKIE)
        .map(|cookie| cookie.value().to_owned())
        .ok_or_else(|| ApiError::unauthorized("missing refresh cookie"))
}

fn validate_origin(state: &AppState, headers: &HeaderMap) -> ApiResult<()> {
    let origin = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| ApiError::forbidden("Origin header is required"))?;
    if origin != state.config.frontend_origin {
        return Err(ApiError::forbidden("Origin is not allowed"));
    }
    Ok(())
}
