use chrono::{Datelike, Days, Months, NaiveDate};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    ApiError, ApiResult,
    budgets::{
        BudgetPeriodUnit, BudgetStatus, BudgetStatusKind, CreateBudgetRequest,
        ReorderBudgetsRequest, RolloverEditMode, UpdateBudgetRequest, model::BudgetRow, repository,
    },
};

fn validate_name(name: &str) -> ApiResult<String> {
    let value = name.trim();
    if value.is_empty() {
        return Err(ApiError::bad_request(
            "invalid_budget_name",
            "budget name cannot be blank",
        ));
    }
    Ok(value.to_owned())
}

fn validate_definition(amount: i64, count: i32, keys: &[String]) -> ApiResult<()> {
    if amount <= 0 {
        return Err(ApiError::bad_request(
            "invalid_budget_amount",
            "budget amount must be positive",
        ));
    }
    if count <= 0 {
        return Err(ApiError::bad_request(
            "invalid_budget_period",
            "budget period count must be positive",
        ));
    }
    if keys.is_empty() {
        return Err(ApiError::bad_request(
            "invalid_budget_accounts",
            "select at least one account",
        ));
    }
    let mut unique = keys.to_vec();
    unique.sort();
    unique.dedup();
    if unique.len() != keys.len() {
        return Err(ApiError::bad_request(
            "invalid_budget_accounts",
            "budget accounts must be unique",
        ));
    }
    Ok(())
}

fn boundary(row: &BudgetRow, index: i64) -> ApiResult<NaiveDate> {
    let count = i64::from(row.period_count)
        .checked_mul(index)
        .ok_or_else(|| {
            ApiError::bad_request("invalid_budget_period", "budget period is out of range")
        })?;
    match row.period_unit {
        BudgetPeriodUnit::Day => {
            row.start_date
                .checked_add_days(Days::new(count.try_into().map_err(|_| {
                    ApiError::bad_request("invalid_budget_period", "budget period is out of range")
                })?))
        }
        BudgetPeriodUnit::Week => row.start_date.checked_add_days(Days::new(
            count
                .checked_mul(7)
                .and_then(|v| v.try_into().ok())
                .ok_or_else(|| {
                    ApiError::bad_request("invalid_budget_period", "budget period is out of range")
                })?,
        )),
        BudgetPeriodUnit::Month | BudgetPeriodUnit::Year => {
            let months = if row.period_unit == BudgetPeriodUnit::Year {
                count.checked_mul(12)
            } else {
                Some(count)
            }
            .and_then(|v| u32::try_from(v).ok())
            .ok_or_else(|| {
                ApiError::bad_request("invalid_budget_period", "budget period is out of range")
            })?;
            row.start_date.checked_add_months(Months::new(months))
        }
    }
    .ok_or_else(|| ApiError::bad_request("invalid_budget_period", "budget period is out of range"))
}

fn period_index(row: &BudgetRow, date: NaiveDate) -> ApiResult<i64> {
    if date < row.start_date {
        return Ok(0);
    }
    let mut index = match row.period_unit {
        BudgetPeriodUnit::Day => (date - row.start_date).num_days() / i64::from(row.period_count),
        BudgetPeriodUnit::Week => {
            (date - row.start_date).num_days() / (i64::from(row.period_count) * 7)
        }
        BudgetPeriodUnit::Month | BudgetPeriodUnit::Year => {
            let month_delta = i64::from(date.year() - row.start_date.year()) * 12
                + i64::from(date.month())
                - i64::from(row.start_date.month());
            let step = i64::from(row.period_count)
                * if row.period_unit == BudgetPeriodUnit::Year {
                    12
                } else {
                    1
                };
            month_delta.max(0) / step
        }
    };
    while index > 0 && boundary(row, index)? > date {
        index -= 1;
    }
    while boundary(row, index + 1)? <= date {
        index += 1;
    }
    Ok(index)
}

async fn carry_in(pool: &PgPool, row: &BudgetRow, current_start: NaiveDate) -> ApiResult<i64> {
    let anchor_index = period_index(row, row.rollover_anchor_date)?;
    let current_index = period_index(row, current_start)?;
    let completed = current_index.saturating_sub(anchor_index);
    let historical_spent = if row.rollover_anchor_date < current_start {
        repository::spent(
            pool,
            row.user_id,
            row.id,
            row.rollover_anchor_date,
            current_start,
        )
        .await?
    } else {
        0
    };
    row.rollover_anchor_minor
        .checked_add(
            row.amount_minor
                .checked_mul(completed)
                .ok_or_else(|| ApiError::internal("budget carry overflow"))?,
        )
        .and_then(|v| v.checked_sub(historical_spent))
        .ok_or_else(|| ApiError::internal("budget carry overflow"))
}

async fn status(pool: &PgPool, row: BudgetRow, as_of: NaiveDate) -> ApiResult<BudgetStatus> {
    let index = period_index(&row, as_of)?;
    let period_from = boundary(&row, index)?;
    let period_to = boundary(&row, index + 1)?;
    let upcoming = as_of < row.start_date;
    let carry_in_minor = if upcoming {
        0
    } else {
        carry_in(pool, &row, period_from).await?
    };
    let spent_minor = if upcoming {
        0
    } else {
        repository::spent(pool, row.user_id, row.id, period_from, period_to).await?
    };
    let available_minor = row
        .amount_minor
        .checked_add(carry_in_minor)
        .ok_or_else(|| ApiError::internal("budget available overflow"))?;
    let remaining_minor = available_minor
        .checked_sub(spent_minor)
        .ok_or_else(|| ApiError::internal("budget remaining overflow"))?;
    let kind = if upcoming {
        BudgetStatusKind::Upcoming
    } else if remaining_minor < 0 {
        BudgetStatusKind::Overspent
    } else {
        BudgetStatusKind::Active
    };
    let accounts = repository::accounts(pool, row.user_id, row.id).await?;
    Ok(BudgetStatus {
        id: row.id,
        name: row.name,
        amount_minor: row.amount_minor,
        start_date: row.start_date,
        period_count: row.period_count,
        period_unit: row.period_unit,
        accounts,
        show_on_overview: row.show_on_overview,
        overview_position: row.overview_position,
        as_of,
        period_from,
        period_to,
        carry_in_minor,
        available_minor,
        spent_minor,
        remaining_minor,
        status: kind,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

pub async fn list(
    pool: &PgPool,
    user_id: Uuid,
    overview_only: bool,
    as_of: NaiveDate,
) -> ApiResult<Vec<BudgetStatus>> {
    let rows = repository::list(pool, user_id, overview_only).await?;
    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        result.push(status(pool, row, as_of).await?);
    }
    Ok(result)
}

pub async fn create(
    pool: &PgPool,
    user_id: Uuid,
    request: CreateBudgetRequest,
    as_of: NaiveDate,
) -> ApiResult<BudgetStatus> {
    let name = validate_name(&request.name)?;
    validate_definition(
        request.amount_minor,
        request.period_count,
        &request.account_keys,
    )?;
    let mut transaction = pool.begin().await?;
    let account_ids =
        repository::resolve_account_ids(&mut transaction, user_id, &request.account_keys, None)
            .await?;
    if account_ids.len() != request.account_keys.len() {
        return Err(ApiError::bad_request(
            "unknown_budget_account",
            "some budget accounts do not exist or are archived",
        ));
    }
    let id = Uuid::now_v7();
    let position = if request.show_on_overview {
        Some(repository::next_overview_position(&mut transaction, user_id).await?)
    } else {
        None
    };
    sqlx::query(r#"INSERT INTO budgets (id,user_id,name,amount_minor,start_date,period_count,period_unit,show_on_overview,overview_position,rollover_anchor_date)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$5)"#)
        .bind(id).bind(user_id).bind(name).bind(request.amount_minor).bind(request.start_date)
        .bind(request.period_count).bind(request.period_unit).bind(request.show_on_overview).bind(position)
        .execute(&mut *transaction).await?;
    repository::replace_accounts(&mut transaction, user_id, id, &account_ids).await?;
    transaction.commit().await?;
    let row = repository::get(pool, user_id, id)
        .await?
        .ok_or_else(|| ApiError::not_found("budget"))?;
    status(pool, row, as_of).await
}

pub async fn update(
    pool: &PgPool,
    user_id: Uuid,
    id: Uuid,
    request: UpdateBudgetRequest,
    as_of: NaiveDate,
) -> ApiResult<BudgetStatus> {
    let old = repository::get(pool, user_id, id)
        .await?
        .ok_or_else(|| ApiError::not_found("budget"))?;
    let old_accounts = repository::accounts(pool, user_id, id).await?;
    let name = request
        .name
        .as_deref()
        .map(validate_name)
        .transpose()?
        .unwrap_or_else(|| old.name.clone());
    let amount = request.amount_minor.unwrap_or(old.amount_minor);
    let start = request.start_date.unwrap_or(old.start_date);
    let count = request.period_count.unwrap_or(old.period_count);
    let unit = request.period_unit.unwrap_or(old.period_unit);
    let account_keys = request
        .account_keys
        .clone()
        .unwrap_or_else(|| old_accounts.iter().map(|a| a.key.clone()).collect());
    validate_definition(amount, count, &account_keys)?;
    let definition_changed = amount != old.amount_minor
        || start != old.start_date
        || count != old.period_count
        || unit != old.period_unit
        || request.account_keys.is_some();
    if definition_changed && request.rollover_edit_mode.is_none() {
        return Err(ApiError::bad_request(
            "rollover_edit_mode_required",
            "choose how the edit affects rollover",
        ));
    }
    let preserved =
        if definition_changed && request.rollover_edit_mode == Some(RolloverEditMode::Preserve) {
            let old_start = boundary(&old, period_index(&old, as_of)?)?;
            carry_in(pool, &old, old_start).await?
        } else {
            0
        };
    let mut transaction = pool.begin().await?;
    let account_ids =
        repository::resolve_account_ids(&mut transaction, user_id, &account_keys, Some(id)).await?;
    if account_ids.len() != account_keys.len() {
        return Err(ApiError::bad_request(
            "unknown_budget_account",
            "some budget accounts do not exist or are archived",
        ));
    }
    let show = request.show_on_overview.unwrap_or(old.show_on_overview);
    let position = match (old.show_on_overview, show) {
        (_, false) => None,
        (true, true) => old.overview_position,
        (false, true) => Some(repository::next_overview_position(&mut transaction, user_id).await?),
    };
    let mut new_shape = old.clone();
    new_shape.amount_minor = amount;
    new_shape.start_date = start;
    new_shape.period_count = count;
    new_shape.period_unit = unit;
    let (anchor_date, anchor_minor) = if !definition_changed {
        (old.rollover_anchor_date, old.rollover_anchor_minor)
    } else if request.rollover_edit_mode == Some(RolloverEditMode::Preserve) {
        (
            boundary(&new_shape, period_index(&new_shape, as_of)?)?,
            preserved,
        )
    } else {
        (start, 0)
    };
    sqlx::query(r#"UPDATE budgets SET name=$3,amount_minor=$4,start_date=$5,period_count=$6,period_unit=$7,
        show_on_overview=$8,overview_position=$9,rollover_anchor_date=$10,rollover_anchor_minor=$11,updated_at=now()
        WHERE user_id=$1 AND id=$2"#).bind(user_id).bind(id).bind(name).bind(amount).bind(start).bind(count).bind(unit)
        .bind(show).bind(position).bind(anchor_date).bind(anchor_minor).execute(&mut *transaction).await?;
    if request.account_keys.is_some() {
        repository::replace_accounts(&mut transaction, user_id, id, &account_ids).await?;
    }
    transaction.commit().await?;
    status(
        pool,
        repository::get(pool, user_id, id)
            .await?
            .ok_or_else(|| ApiError::not_found("budget"))?,
        as_of,
    )
    .await
}

pub async fn delete(pool: &PgPool, user_id: Uuid, id: Uuid) -> ApiResult<()> {
    let result = sqlx::query("DELETE FROM budgets WHERE user_id=$1 AND id=$2")
        .bind(user_id)
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("budget"));
    }
    Ok(())
}

pub async fn reorder(
    pool: &PgPool,
    user_id: Uuid,
    request: ReorderBudgetsRequest,
) -> ApiResult<()> {
    let visible: Vec<Uuid> = sqlx::query_scalar(
        "SELECT id FROM budgets WHERE user_id=$1 AND show_on_overview ORDER BY id",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    let mut expected = visible.clone();
    expected.sort();
    let mut supplied = request.budget_ids.clone();
    supplied.sort();
    supplied.dedup();
    if supplied != expected || request.budget_ids.len() != expected.len() {
        return Err(ApiError::bad_request(
            "invalid_budget_order",
            "order must contain every overview budget exactly once",
        ));
    }
    let mut transaction = pool.begin().await?;
    for (position, id) in request.budget_ids.iter().enumerate() {
        sqlx::query(
            "UPDATE budgets SET overview_position=$3,updated_at=now() WHERE user_id=$1 AND id=$2",
        )
        .bind(user_id)
        .bind(id)
        .bind(position as i64)
        .execute(&mut *transaction)
        .await?;
    }
    transaction.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use sqlx::PgPool;

    use super::*;
    fn row(start: NaiveDate, count: i32, unit: BudgetPeriodUnit) -> BudgetRow {
        BudgetRow {
            id: Uuid::nil(),
            user_id: Uuid::nil(),
            name: "x".into(),
            amount_minor: 100,
            start_date: start,
            period_count: count,
            period_unit: unit,
            show_on_overview: false,
            overview_position: None,
            rollover_anchor_date: start,
            rollover_anchor_minor: 0,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        }
    }
    #[test]
    fn calendar_periods_anchor_from_original_day() {
        let r = row(
            NaiveDate::from_ymd_opt(2024, 1, 31).unwrap(),
            1,
            BudgetPeriodUnit::Month,
        );
        assert_eq!(
            boundary(&r, 1).unwrap(),
            NaiveDate::from_ymd_opt(2024, 2, 29).unwrap()
        );
        assert_eq!(
            boundary(&r, 2).unwrap(),
            NaiveDate::from_ymd_opt(2024, 3, 31).unwrap()
        );
        assert_eq!(
            period_index(&r, NaiveDate::from_ymd_opt(2024, 3, 30).unwrap()).unwrap(),
            1
        );
    }
    #[test]
    fn fixed_periods_are_half_open() {
        let r = row(
            NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
            2,
            BudgetPeriodUnit::Week,
        );
        assert_eq!(
            period_index(&r, NaiveDate::from_ymd_opt(2026, 1, 14).unwrap()).unwrap(),
            0
        );
        assert_eq!(
            period_index(&r, NaiveDate::from_ymd_opt(2026, 1, 15).unwrap()).unwrap(),
            1
        );
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn rollover_counts_matching_expenses_once_and_ignores_transfers(pool: PgPool) {
        let user_id = Uuid::now_v7();
        sqlx::query("INSERT INTO users (id,email,display_name) VALUES ($1,$2,'Budget User')")
            .bind(user_id)
            .bind(format!("{user_id}@example.com"))
            .execute(&pool)
            .await
            .unwrap();
        let cash = Uuid::now_v7();
        let savings = Uuid::now_v7();
        let food = Uuid::now_v7();
        sqlx::query("INSERT INTO accounts (id,user_id,key,name,type) VALUES ($1,$4,'asset.cash','Cash','asset'),($2,$4,'asset.savings','Savings','asset'),($3,$4,'expense.food','Food','expense')")
            .bind(cash).bind(savings).bind(food).bind(user_id).execute(&pool).await.unwrap();
        let created = create(
            &pool,
            user_id,
            CreateBudgetRequest {
                name: "Cash spending".into(),
                amount_minor: 1_000,
                start_date: NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
                period_count: 1,
                period_unit: BudgetPeriodUnit::Month,
                account_keys: vec!["asset.cash".into()],
                show_on_overview: true,
            },
            NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
        )
        .await
        .unwrap();
        for (date, postings) in [
            ("2026-01-10", vec![(food, 600_i64), (cash, -600_i64)]),
            ("2026-01-12", vec![(savings, 500_i64), (cash, -500_i64)]),
            ("2026-02-03", vec![(food, 200_i64), (cash, -200_i64)]),
        ] {
            let entry_id = Uuid::now_v7();
            let mut transaction = pool.begin().await.unwrap();
            sqlx::query(
                "INSERT INTO entries (id,user_id,date,description) VALUES ($1,$2,$3,'test')",
            )
            .bind(entry_id)
            .bind(user_id)
            .bind(NaiveDate::parse_from_str(date, "%Y-%m-%d").unwrap())
            .execute(&mut *transaction)
            .await
            .unwrap();
            for (account_id, amount) in postings {
                sqlx::query("INSERT INTO postings (id,user_id,entry_id,account_id,amount_minor) VALUES ($1,$2,$3,$4,$5)")
                    .bind(Uuid::now_v7()).bind(user_id).bind(entry_id).bind(account_id).bind(amount).execute(&mut *transaction).await.unwrap();
            }
            transaction.commit().await.unwrap();
        }
        let values = list(
            &pool,
            user_id,
            false,
            NaiveDate::from_ymd_opt(2026, 2, 10).unwrap(),
        )
        .await
        .unwrap();
        let budget = values.iter().find(|value| value.id == created.id).unwrap();
        assert_eq!(budget.carry_in_minor, 400);
        assert_eq!(budget.spent_minor, 200);
        assert_eq!(budget.available_minor, 1_400);
        assert_eq!(budget.remaining_minor, 1_200);
    }
}
