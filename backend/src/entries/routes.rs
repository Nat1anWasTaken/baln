use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderName, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use uuid::Uuid;

use crate::{
    ApiError, ApiResult,
    app::AppState,
    auth::AuthenticatedUser,
    entries::{
        CreateEntryRequest, EntryPage, EntryResponse, ListEntriesQuery, UpdateEntryRequest,
        repository, service,
    },
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", post(create).get(list))
        .route("/{id}", get(get_one).put(update).delete(delete))
}

#[utoipa::path(
    post,
    path = "/api/v1/entries",
    tag = "entries",
    security(("bearer_auth" = [])),
    request_body = CreateEntryRequest,
    responses((status = 201, body = EntryResponse), (status = 200, body = EntryResponse))
)]
pub(crate) async fn create(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Json(request): Json<CreateEntryRequest>,
) -> ApiResult<Response> {
    let (entry, replayed) = service::create(&state.pool, user.id, request).await?;
    let status = if replayed {
        StatusCode::OK
    } else {
        StatusCode::CREATED
    };
    let mut response = (status, Json(entry)).into_response();
    if replayed {
        response.headers_mut().insert(
            HeaderName::from_static("x-idempotent-replay"),
            HeaderValue::from_static("true"),
        );
    }
    Ok(response)
}

#[utoipa::path(
    get,
    path = "/api/v1/entries",
    tag = "entries",
    security(("bearer_auth" = [])),
    params(ListEntriesQuery),
    responses((status = 200, body = EntryPage))
)]
pub(crate) async fn list(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Query(query): Query<ListEntriesQuery>,
) -> ApiResult<Json<EntryPage>> {
    Ok(Json(service::list(&state.pool, user.id, query).await?))
}

#[utoipa::path(
    get,
    path = "/api/v1/entries/{id}",
    tag = "entries",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path)),
    responses((status = 200, body = EntryResponse), (status = 404))
)]
pub(crate) async fn get_one(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<EntryResponse>> {
    repository::get(&state.pool, user.id, id)
        .await?
        .map(Json)
        .ok_or_else(|| ApiError::not_found("entry"))
}

#[utoipa::path(
    put,
    path = "/api/v1/entries/{id}",
    tag = "entries",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path)),
    request_body = UpdateEntryRequest,
    responses((status = 200, body = EntryResponse), (status = 404))
)]
pub(crate) async fn update(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Path(id): Path<Uuid>,
    Json(request): Json<UpdateEntryRequest>,
) -> ApiResult<Json<EntryResponse>> {
    Ok(Json(
        service::update(&state.pool, user.id, id, request).await?,
    ))
}

#[utoipa::path(
    delete,
    path = "/api/v1/entries/{id}",
    tag = "entries",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path)),
    responses((status = 204), (status = 404))
)]
pub(crate) async fn delete(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    service::delete(&state.pool, user.id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
