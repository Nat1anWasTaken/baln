use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
};
use uuid::Uuid;

use crate::{
    ApiError, ApiResult,
    accounts::{
        Account, AccountBalance, BalanceQuery, CreateAccountRequest, ListAccountsQuery,
        UpdateAccountRequest, repository, service,
    },
    app::AppState,
    auth::AuthenticatedUser,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", post(create).get(list))
        .route("/{id}", get(get_one).patch(update).delete(delete))
        .route("/{id}/balance", get(balance))
}

#[utoipa::path(
    post,
    path = "/api/v1/accounts",
    tag = "accounts",
    security(("bearer_auth" = [])),
    request_body = CreateAccountRequest,
    responses((status = 201, body = Account))
)]
pub(crate) async fn create(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Json(request): Json<CreateAccountRequest>,
) -> ApiResult<(StatusCode, Json<Account>)> {
    let account = service::create(&state.pool, user.id, request).await?;
    Ok((StatusCode::CREATED, Json(account)))
}

#[utoipa::path(
    get,
    path = "/api/v1/accounts",
    tag = "accounts",
    security(("bearer_auth" = [])),
    params(ListAccountsQuery),
    responses((status = 200, body = [Account]))
)]
pub(crate) async fn list(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Query(query): Query<ListAccountsQuery>,
) -> ApiResult<Json<Vec<Account>>> {
    Ok(Json(
        repository::list(
            &state.pool,
            user.id,
            query.include_archived,
            query
                .q
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
        )
        .await?,
    ))
}

#[utoipa::path(
    get,
    path = "/api/v1/accounts/{id}",
    tag = "accounts",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path)),
    responses((status = 200, body = Account), (status = 404))
)]
pub(crate) async fn get_one(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Account>> {
    repository::get(&state.pool, user.id, id)
        .await?
        .map(Json)
        .ok_or_else(|| ApiError::not_found("account"))
}

#[utoipa::path(
    patch,
    path = "/api/v1/accounts/{id}",
    tag = "accounts",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path)),
    request_body = UpdateAccountRequest,
    responses((status = 200, body = Account), (status = 404))
)]
pub(crate) async fn update(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Path(id): Path<Uuid>,
    Json(request): Json<UpdateAccountRequest>,
) -> ApiResult<Json<Account>> {
    Ok(Json(
        service::update(&state.pool, user.id, id, request).await?,
    ))
}

#[utoipa::path(
    delete,
    path = "/api/v1/accounts/{id}",
    tag = "accounts",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path)),
    responses((status = 204), (status = 404), (status = 409))
)]
pub(crate) async fn delete(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    service::delete(&state.pool, user.id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/api/v1/accounts/{id}/balance",
    tag = "accounts",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path), BalanceQuery),
    responses((status = 200, body = AccountBalance), (status = 404))
)]
pub(crate) async fn balance(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Path(id): Path<Uuid>,
    Query(query): Query<BalanceQuery>,
) -> ApiResult<Json<AccountBalance>> {
    Ok(Json(
        service::balance(&state.pool, user.id, id, query.as_of).await?,
    ))
}
