use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post, put},
};
use chrono::Utc;
use uuid::Uuid;

use crate::{
    ApiResult,
    app::AppState,
    auth::AuthenticatedUser,
    budgets::{
        BudgetStatus, CreateBudgetRequest, ListBudgetsQuery, ReorderBudgetsRequest,
        UpdateBudgetRequest, service,
    },
};

fn today(state: &AppState) -> chrono::NaiveDate {
    Utc::now()
        .with_timezone(&state.config.bookkeeping_timezone)
        .date_naive()
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", post(create).get(list))
        .route("/overview-order", put(reorder))
        .route("/{id}", get(get_one).patch(update).delete(delete))
}

#[utoipa::path(post,path="/api/v1/budgets",tag="budgets",security(("bearer_auth"=[])),request_body=CreateBudgetRequest,responses((status=201,body=BudgetStatus)))]
pub(crate) async fn create(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Json(request): Json<CreateBudgetRequest>,
) -> ApiResult<(StatusCode, Json<BudgetStatus>)> {
    let value = service::create(&state.pool, user.id, request, today(&state)).await?;
    Ok((StatusCode::CREATED, Json(value)))
}
#[utoipa::path(get,path="/api/v1/budgets",tag="budgets",security(("bearer_auth"=[])),params(ListBudgetsQuery),responses((status=200,body=[BudgetStatus])))]
pub(crate) async fn list(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Query(query): Query<ListBudgetsQuery>,
) -> ApiResult<Json<Vec<BudgetStatus>>> {
    Ok(Json(
        service::list(&state.pool, user.id, query.overview_only, today(&state)).await?,
    ))
}
#[utoipa::path(get,path="/api/v1/budgets/{id}",tag="budgets",security(("bearer_auth"=[])),params(("id"=Uuid,Path)),responses((status=200,body=BudgetStatus),(status=404)))]
pub(crate) async fn get_one(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<BudgetStatus>> {
    let values = service::list(&state.pool, user.id, false, today(&state)).await?;
    values
        .into_iter()
        .find(|v| v.id == id)
        .map(Json)
        .ok_or_else(|| crate::ApiError::not_found("budget"))
}
#[utoipa::path(patch,path="/api/v1/budgets/{id}",tag="budgets",security(("bearer_auth"=[])),params(("id"=Uuid,Path)),request_body=UpdateBudgetRequest,responses((status=200,body=BudgetStatus),(status=404)))]
pub(crate) async fn update(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Path(id): Path<Uuid>,
    Json(request): Json<UpdateBudgetRequest>,
) -> ApiResult<Json<BudgetStatus>> {
    Ok(Json(
        service::update(&state.pool, user.id, id, request, today(&state)).await?,
    ))
}
#[utoipa::path(delete,path="/api/v1/budgets/{id}",tag="budgets",security(("bearer_auth"=[])),params(("id"=Uuid,Path)),responses((status=204),(status=404)))]
pub(crate) async fn delete(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    service::delete(&state.pool, user.id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(put,path="/api/v1/budgets/overview-order",tag="budgets",security(("bearer_auth"=[])),request_body=ReorderBudgetsRequest,responses((status=204)))]
pub(crate) async fn reorder(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Json(request): Json<ReorderBudgetsRequest>,
) -> ApiResult<StatusCode> {
    service::reorder(&state.pool, user.id, request).await?;
    Ok(StatusCode::NO_CONTENT)
}
