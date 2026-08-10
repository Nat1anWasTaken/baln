use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderName, HeaderValue, Method, StatusCode, header},
    middleware,
    routing::get,
};
use serde_json::json;
use sqlx::PgPool;
use tower_http::{
    catch_panic::CatchPanicLayer,
    cors::CorsLayer,
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use utoipa_swagger_ui::SwaggerUi;

use crate::{
    ApiResult,
    auth::{AuthService, JwtManager, OidcService},
    config::AppConfig,
    db,
    openapi::ApiDoc,
};
use utoipa::OpenApi;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<AppConfig>,
    pub jwt: JwtManager,
    pub auth: AuthService,
}

impl AppState {
    pub async fn initialize(config: AppConfig) -> ApiResult<Self> {
        let pool = db::connect(&config).await?;
        let jwt = JwtManager::new(&config);
        let oidc = OidcService::discover(&config).await?;
        let auth = AuthService::new(pool.clone(), oidc, jwt.clone(), &config);
        Ok(Self {
            pool,
            config: Arc::new(config),
            jwt,
            auth,
        })
    }
}

pub fn build_app(state: AppState) -> ApiResult<Router> {
    let frontend_origin = HeaderValue::from_str(&state.config.frontend_origin)
        .map_err(|error| crate::ApiError::configuration(format!("FRONTEND_ORIGIN: {error}")))?;
    let allowed_origins = vec![
        frontend_origin,
        HeaderValue::from_static("https://chatgpt.com"),
        HeaderValue::from_static("https://chat.openai.com"),
    ];
    let request_id = HeaderName::from_static("x-request-id");
    let api = Router::new()
        .nest("/auth", crate::auth::router())
        .nest("/accounts", crate::accounts::router())
        .nest("/budgets", crate::budgets::router())
        .nest("/entries", crate::entries::router())
        .nest("/reports", crate::reports::router())
        .nest("/oauth", crate::oauth::account_router());
    let mcp = Router::new()
        .nest_service("/mcp", crate::mcp::streamable_http_service(state.clone()))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            crate::oauth::mcp_auth,
        ));
    let app = Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .route(
            "/.well-known/oauth-protected-resource",
            get(crate::oauth::protected_resource_metadata),
        )
        .route(
            "/.well-known/oauth-protected-resource/mcp",
            get(crate::oauth::protected_resource_metadata),
        )
        .route(
            "/.well-known/oauth-authorization-server",
            get(crate::oauth::authorization_server_metadata),
        )
        .nest("/oauth", crate::oauth::public_router())
        .merge(mcp)
        .nest("/api/v1", api)
        .merge(SwaggerUi::new("/api/docs").url("/api/openapi.json", ApiDoc::openapi()))
        .with_state(state)
        .layer(PropagateRequestIdLayer::new(request_id.clone()))
        .layer(SetRequestIdLayer::new(request_id, MakeRequestUuid))
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(30),
        ))
        .layer(CatchPanicLayer::new())
        .layer(TraceLayer::new_for_http())
        .layer(
            CorsLayer::new()
                .allow_origin(allowed_origins)
                .allow_credentials(true)
                .allow_headers([
                    header::ACCEPT,
                    header::AUTHORIZATION,
                    header::CONTENT_TYPE,
                    HeaderName::from_static("mcp-method"),
                    HeaderName::from_static("mcp-name"),
                    HeaderName::from_static("mcp-protocol-version"),
                    HeaderName::from_static("mcp-session-id"),
                ])
                .expose_headers([
                    HeaderName::from_static("mcp-session-id"),
                    HeaderName::from_static("www-authenticate"),
                ])
                .allow_methods([
                    Method::GET,
                    Method::POST,
                    Method::PUT,
                    Method::PATCH,
                    Method::DELETE,
                ]),
        );
    Ok(app)
}

async fn live() -> (StatusCode, Json<serde_json::Value>) {
    (StatusCode::OK, Json(json!({"status": "ok"})))
}

async fn ready(State(state): State<AppState>) -> ApiResult<Json<serde_json::Value>> {
    db::ready(&state.pool).await?;
    Ok(Json(json!({"status": "ready"})))
}
