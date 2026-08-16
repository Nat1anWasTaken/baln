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
        BudgetDaysPage, BudgetDaysQuery, BudgetDetails, BudgetDetailsQuery, BudgetPeriodsPage,
        BudgetPeriodsQuery, BudgetStatistics, BudgetStatisticsQuery, BudgetStatus,
        CreateBudgetRequest, ListBudgetsQuery, ReorderBudgetsRequest, UpdateBudgetRequest, service,
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
        .route("/{id}/details", get(details))
        .route("/{id}/days", get(days))
        .route("/{id}/periods", get(periods))
        .route("/{id}/statistics", get(statistics))
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

#[utoipa::path(
    get,
    path = "/api/v1/budgets/{id}/details",
    tag = "budgets",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path), BudgetDetailsQuery),
    responses((status = 200, body = BudgetDetails), (status = 400), (status = 404))
)]
pub(crate) async fn details(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Path(id): Path<Uuid>,
    Query(query): Query<BudgetDetailsQuery>,
) -> ApiResult<Json<BudgetDetails>> {
    Ok(Json(
        service::details(&state.pool, user.id, id, query.period_offset, today(&state)).await?,
    ))
}

#[utoipa::path(
    get,
    path = "/api/v1/budgets/{id}/days",
    tag = "budgets",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path), BudgetDaysQuery),
    responses((status = 200, body = BudgetDaysPage), (status = 400), (status = 404))
)]
pub(crate) async fn days(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Path(id): Path<Uuid>,
    Query(query): Query<BudgetDaysQuery>,
) -> ApiResult<Json<BudgetDaysPage>> {
    Ok(Json(
        service::days(
            &state.pool,
            user.id,
            id,
            query.period_offset,
            query.cursor.as_deref(),
            query.limit,
            today(&state),
        )
        .await?,
    ))
}

#[utoipa::path(
    get,
    path = "/api/v1/budgets/{id}/periods",
    tag = "budgets",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path), BudgetPeriodsQuery),
    responses((status = 200, body = BudgetPeriodsPage), (status = 400), (status = 404))
)]
pub(crate) async fn periods(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Path(id): Path<Uuid>,
    Query(query): Query<BudgetPeriodsQuery>,
) -> ApiResult<Json<BudgetPeriodsPage>> {
    Ok(Json(
        service::periods(
            &state.pool,
            user.id,
            id,
            query.cursor.as_deref(),
            query.limit,
            query.date,
            today(&state),
        )
        .await?,
    ))
}

#[utoipa::path(
    get,
    path = "/api/v1/budgets/{id}/statistics",
    tag = "budgets",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path), BudgetStatisticsQuery),
    responses((status = 200, body = BudgetStatistics), (status = 400), (status = 404))
)]
pub(crate) async fn statistics(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Path(id): Path<Uuid>,
    Query(query): Query<BudgetStatisticsQuery>,
) -> ApiResult<Json<BudgetStatistics>> {
    Ok(Json(
        service::statistics(
            &state.pool,
            user.id,
            id,
            query.from_offset,
            query.to_offset,
            today(&state),
        )
        .await?,
    ))
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
