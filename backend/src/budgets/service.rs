use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{Datelike, Days, Months, NaiveDate};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    ApiError, ApiResult,
    budgets::{
        BudgetDay, BudgetDaysPage, BudgetDetails, BudgetPace, BudgetPeriodKind, BudgetPeriodOption,
        BudgetPeriodUnit, BudgetPeriodsPage, BudgetRolloverMode, BudgetStatistics,
        BudgetStatisticsPeriod, BudgetStatisticsPoint, BudgetStatisticsSummary, BudgetStatus,
        BudgetStatusKind, BudgetTrend, BudgetTrendBucket, CreateBudgetRequest,
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

fn rollover_after_period(
    mode: BudgetRolloverMode,
    carry: i64,
    amount: i64,
    spent: i64,
) -> ApiResult<i64> {
    let remaining = carry
        .checked_add(amount)
        .and_then(|value| value.checked_sub(spent))
        .ok_or_else(|| ApiError::internal("budget carry overflow"))?;
    Ok(match mode {
        BudgetRolloverMode::Accumulate => remaining,
        BudgetRolloverMode::SurplusOnly => remaining.max(0),
        BudgetRolloverMode::Reset => 0,
    })
}

async fn carry_in(pool: &PgPool, row: &BudgetRow, current_start: NaiveDate) -> ApiResult<i64> {
    let anchor_index = period_index(row, row.rollover_anchor_date)?;
    let current_index = period_index(row, current_start)?;
    let completed = current_index.saturating_sub(anchor_index);
    if completed == 0 {
        return Ok(row.rollover_anchor_minor);
    }
    match row.rollover_mode {
        BudgetRolloverMode::Reset => return Ok(0),
        BudgetRolloverMode::Accumulate => {
            let historical_spent = repository::spent(
                pool,
                row.user_id,
                row.id,
                row.rollover_anchor_date,
                current_start,
            )
            .await?;
            return row
                .rollover_anchor_minor
                .checked_add(
                    row.amount_minor
                        .checked_mul(completed)
                        .ok_or_else(|| ApiError::internal("budget carry overflow"))?,
                )
                .and_then(|value| value.checked_sub(historical_spent))
                .ok_or_else(|| ApiError::internal("budget carry overflow"));
        }
        BudgetRolloverMode::SurplusOnly => {}
    }

    let mut ranges = Vec::with_capacity(completed.try_into().unwrap_or(0));
    for index in anchor_index..current_index {
        ranges.push((boundary(row, index)?, boundary(row, index + 1)?));
    }
    let periods = repository::trend(pool, row.user_id, row.id, &ranges, false).await?;
    let mut carry = row.rollover_anchor_minor;
    for period in periods {
        carry = rollover_after_period(
            row.rollover_mode,
            carry,
            row.amount_minor,
            period.spent_minor,
        )?;
    }
    Ok(carry)
}

async fn status_at_index(
    pool: &PgPool,
    row: BudgetRow,
    index: i64,
    as_of: NaiveDate,
) -> ApiResult<BudgetStatus> {
    let period_from = boundary(&row, index)?;
    let period_to = boundary(&row, index + 1)?;
    let upcoming = period_from > as_of;
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
        rollover_mode: row.rollover_mode,
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

async fn status(pool: &PgPool, row: BudgetRow, as_of: NaiveDate) -> ApiResult<BudgetStatus> {
    status_at_index(pool, row.clone(), period_index(&row, as_of)?, as_of).await
}

fn period_for_offset(
    row: &BudgetRow,
    as_of: NaiveDate,
    period_offset: i32,
) -> ApiResult<(i64, i64, NaiveDate, NaiveDate)> {
    if period_offset > 0 {
        return Err(ApiError::bad_request(
            "invalid_period_offset",
            "period_offset must be zero or negative",
        ));
    }
    let current_index = period_index(row, as_of)?;
    let index = current_index
        .checked_add(i64::from(period_offset))
        .ok_or_else(|| {
            ApiError::bad_request("invalid_period_offset", "period_offset is out of range")
        })?;
    if index < 0 {
        return Err(ApiError::bad_request(
            "invalid_period_offset",
            "period_offset refers to a period before the budget started",
        ));
    }
    Ok((
        current_index,
        index,
        boundary(row, index)?,
        boundary(row, index + 1)?,
    ))
}

fn period_kind(
    period_from: NaiveDate,
    current_index: i64,
    index: i64,
    as_of: NaiveDate,
) -> BudgetPeriodKind {
    if period_from > as_of {
        BudgetPeriodKind::Upcoming
    } else if index == current_index {
        BudgetPeriodKind::Current
    } else {
        BudgetPeriodKind::Past
    }
}

fn trend_ranges(
    date_from: NaiveDate,
    date_to: NaiveDate,
) -> ApiResult<(i64, Vec<(NaiveDate, NaiveDate)>)> {
    let total_days = (date_to - date_from).num_days();
    if total_days <= 0 {
        return Err(ApiError::internal("budget period has no calendar days"));
    }
    let bucket_days = (total_days + 119) / 120;
    let mut ranges = Vec::with_capacity(((total_days + bucket_days - 1) / bucket_days) as usize);
    let mut from = date_from;
    while from < date_to {
        let to = from
            .checked_add_days(Days::new(
                bucket_days
                    .try_into()
                    .map_err(|_| ApiError::internal("budget trend bucket is out of range"))?,
            ))
            .unwrap_or(date_to)
            .min(date_to);
        ranges.push((from, to));
        from = to;
    }
    Ok((bucket_days, ranges))
}

pub async fn details(
    pool: &PgPool,
    user_id: Uuid,
    id: Uuid,
    period_offset: i32,
    as_of: NaiveDate,
) -> ApiResult<BudgetDetails> {
    let row = repository::get(pool, user_id, id)
        .await?
        .ok_or_else(|| ApiError::not_found("budget"))?;
    let (current_index, index, period_from, period_to) =
        period_for_offset(&row, as_of, period_offset)?;
    let upcoming = period_from > as_of;
    let budget = status_at_index(pool, row.clone(), index, as_of).await?;
    let elapsed_to = if upcoming {
        period_from
    } else {
        as_of
            .checked_add_days(Days::new(1))
            .unwrap_or(period_to)
            .min(period_to)
    };
    let spent_through_as_of_minor = if upcoming {
        0
    } else {
        repository::spent(pool, user_id, id, period_from, elapsed_to).await?
    };
    let total_days = (period_to - period_from).num_days();
    let elapsed_days = if upcoming {
        0
    } else {
        (elapsed_to - period_from).num_days().clamp(0, total_days)
    };
    let remaining_days = total_days.saturating_sub(elapsed_days);
    let pace = BudgetPace {
        total_days,
        elapsed_days,
        remaining_days,
        spent_through_as_of_minor,
        future_spent_minor: budget
            .spent_minor
            .checked_sub(spent_through_as_of_minor)
            .ok_or_else(|| ApiError::internal("budget future spend overflow"))?,
        average_daily_spend_minor: (elapsed_days > 0)
            .then(|| spent_through_as_of_minor / elapsed_days),
        spendable_per_day_minor: (remaining_days > 0)
            .then(|| budget.remaining_minor / remaining_days),
    };
    let (bucket_days, ranges) = trend_ranges(period_from, period_to)?;
    let rows = repository::trend(pool, user_id, id, &ranges, upcoming).await?;
    let mut cumulative = 0_i64;
    let mut points = Vec::with_capacity(rows.len());
    for row in rows {
        cumulative = cumulative
            .checked_add(row.spent_minor)
            .ok_or_else(|| ApiError::internal("budget trend spend overflow"))?;
        let remaining_minor = budget
            .available_minor
            .checked_sub(cumulative)
            .ok_or_else(|| ApiError::internal("budget trend remaining overflow"))?;
        points.push(BudgetTrendBucket {
            date_from: row.date_from,
            date_to: row.date_to,
            spent_minor: row.spent_minor,
            remaining_minor,
        });
    }
    Ok(BudgetDetails {
        budget,
        period_offset,
        period_kind: period_kind(period_from, current_index, index, as_of),
        has_previous: index > 0,
        has_next: index < current_index,
        pace,
        trend: BudgetTrend {
            bucket_days,
            points,
        },
    })
}

#[derive(Debug, Deserialize, Serialize)]
struct BudgetDayCursor {
    date: NaiveDate,
}

fn encode_day_cursor(date: NaiveDate) -> String {
    URL_SAFE_NO_PAD
        .encode(serde_json::to_vec(&BudgetDayCursor { date }).expect("cursor serializes"))
}

fn decode_day_cursor(cursor: &str) -> ApiResult<BudgetDayCursor> {
    let bytes = URL_SAFE_NO_PAD
        .decode(cursor)
        .map_err(|_| ApiError::bad_request("invalid_cursor", "cursor is not valid base64url"))?;
    serde_json::from_slice(&bytes)
        .map_err(|_| ApiError::bad_request("invalid_cursor", "cursor payload is invalid"))
}

pub async fn days(
    pool: &PgPool,
    user_id: Uuid,
    id: Uuid,
    period_offset: i32,
    cursor: Option<&str>,
    limit: Option<i64>,
    as_of: NaiveDate,
) -> ApiResult<BudgetDaysPage> {
    let row = repository::get(pool, user_id, id)
        .await?
        .ok_or_else(|| ApiError::not_found("budget"))?;
    let (_current_index, index, period_from, period_to) =
        period_for_offset(&row, as_of, period_offset)?;
    let upcoming = period_from > as_of;
    let budget = status_at_index(pool, row, index, as_of).await?;
    let cursor_date = cursor
        .map(decode_day_cursor)
        .transpose()?
        .map(|value| value.date);
    let requested_limit = limit.unwrap_or(50).clamp(1, 200);
    let rows = repository::days(
        pool,
        user_id,
        id,
        period_from,
        period_to,
        cursor_date,
        requested_limit + 1,
        as_of,
        upcoming,
        budget.available_minor,
    )
    .await?;
    let has_more = rows.len() > requested_limit as usize;
    let rows = rows
        .into_iter()
        .take(requested_limit as usize)
        .collect::<Vec<_>>();
    let next_cursor = has_more
        .then(|| rows.last().map(|row| encode_day_cursor(row.date)))
        .flatten();
    let items = rows
        .into_iter()
        .map(|row| BudgetDay {
            date: row.date,
            spent_minor: row.spent_minor,
            remaining_minor: row.remaining_minor,
            entry_count: row.entry_count,
            is_future: row.is_future,
        })
        .collect();
    Ok(BudgetDaysPage { items, next_cursor })
}

#[derive(Debug, Deserialize, Serialize)]
struct BudgetPeriodCursor {
    offset: i32,
}

fn encode_period_cursor(offset: i32) -> String {
    URL_SAFE_NO_PAD.encode(
        serde_json::to_vec(&BudgetPeriodCursor { offset }).expect("period cursor serializes"),
    )
}

fn decode_period_cursor(cursor: &str) -> ApiResult<BudgetPeriodCursor> {
    let bytes = URL_SAFE_NO_PAD
        .decode(cursor)
        .map_err(|_| ApiError::bad_request("invalid_cursor", "cursor is not valid base64url"))?;
    serde_json::from_slice(&bytes)
        .map_err(|_| ApiError::bad_request("invalid_cursor", "cursor payload is invalid"))
}

pub async fn periods(
    pool: &PgPool,
    user_id: Uuid,
    id: Uuid,
    cursor: Option<&str>,
    limit: Option<i64>,
    date: Option<NaiveDate>,
    as_of: NaiveDate,
) -> ApiResult<BudgetPeriodsPage> {
    let row = repository::get(pool, user_id, id)
        .await?
        .ok_or_else(|| ApiError::not_found("budget"))?;
    let current_index = period_index(&row, as_of)?;
    let offsets = if let Some(date) = date {
        let index = period_index(&row, date)?;
        if date < row.start_date || index > current_index {
            return Ok(BudgetPeriodsPage {
                items: Vec::new(),
                next_cursor: None,
            });
        }
        vec![i32::try_from(index - current_index).map_err(|_| {
            ApiError::bad_request("invalid_period_offset", "period offset is out of range")
        })?]
    } else {
        let start = cursor
            .map(decode_period_cursor)
            .transpose()?
            .map_or(0, |value| value.offset);
        if start > 0 {
            return Err(ApiError::bad_request(
                "invalid_cursor",
                "period cursor is out of range",
            ));
        }
        let requested_limit = limit.unwrap_or(50).clamp(1, 100);
        let earliest = i32::try_from(-current_index).map_err(|_| {
            ApiError::bad_request("invalid_period_offset", "period offset is out of range")
        })?;
        (0..requested_limit)
            .map(|step| start.saturating_sub(step as i32))
            .take_while(|offset| *offset >= earliest)
            .collect()
    };

    let mut items = Vec::with_capacity(offsets.len());
    for offset in &offsets {
        let index = current_index + i64::from(*offset);
        let period_from = boundary(&row, index)?;
        items.push(BudgetPeriodOption {
            period_offset: *offset,
            period_from,
            period_to: boundary(&row, index + 1)?,
            period_kind: period_kind(period_from, current_index, index, as_of),
        });
    }
    let next_cursor = if date.is_none() {
        offsets.last().and_then(|last| {
            let next = last.saturating_sub(1);
            (current_index + i64::from(next) >= 0).then(|| encode_period_cursor(next))
        })
    } else {
        None
    };
    Ok(BudgetPeriodsPage { items, next_cursor })
}

#[derive(Clone)]
struct StatisticsPeriodSpec {
    offset: i32,
    index: i64,
    period_from: NaiveDate,
    period_to: NaiveDate,
    cutoff: NaiveDate,
    upcoming: bool,
    ranges: Vec<(NaiveDate, NaiveDate)>,
}

fn statistics_ranges(
    period_from: NaiveDate,
    period_to: NaiveDate,
    cutoff: NaiveDate,
) -> ApiResult<Vec<(NaiveDate, NaiveDate)>> {
    let (_, ranges) = trend_ranges(period_from, period_to)?;
    let mut split = Vec::with_capacity(ranges.len() + 1);
    for (from, to) in ranges {
        if from < cutoff && cutoff < to {
            split.push((from, cutoff));
            split.push((cutoff, to));
        } else {
            split.push((from, to));
        }
    }
    Ok(split)
}

fn statistics_offsets(
    current_index: i64,
    from_offset: Option<i32>,
    to_offset: Option<i32>,
) -> ApiResult<(i32, i32, i64)> {
    let earliest_offset = i32::try_from(-current_index).map_err(|_| {
        ApiError::bad_request("invalid_period_offset", "period offset is out of range")
    })?;
    let to_offset = to_offset.unwrap_or(0);
    let from_offset = from_offset.map_or_else(|| (-5).max(earliest_offset), |value| value);
    let selected_count = i64::from(to_offset) - i64::from(from_offset) + 1;
    if from_offset > to_offset
        || to_offset > 0
        || from_offset < earliest_offset
        || selected_count <= 0
    {
        return Err(ApiError::bad_request(
            "invalid_statistics_range",
            "statistics offsets must select existing consecutive periods",
        ));
    }
    if selected_count > 24 {
        return Err(ApiError::bad_request(
            "statistics_range_too_large",
            "statistics range cannot exceed 24 periods",
        ));
    }
    Ok((from_offset, to_offset, selected_count))
}

pub async fn statistics(
    pool: &PgPool,
    user_id: Uuid,
    id: Uuid,
    from_offset: Option<i32>,
    to_offset: Option<i32>,
    as_of: NaiveDate,
) -> ApiResult<BudgetStatistics> {
    let row = repository::get(pool, user_id, id)
        .await?
        .ok_or_else(|| ApiError::not_found("budget"))?;
    let current_index = period_index(&row, as_of)?;
    let (from_offset, to_offset, selected_count) =
        statistics_offsets(current_index, from_offset, to_offset)?;

    let as_of_exclusive = as_of.checked_add_days(Days::new(1)).unwrap_or(as_of);
    let mut specs = Vec::with_capacity(selected_count as usize);
    let mut all_ranges = Vec::new();
    for offset in from_offset..=to_offset {
        let index = current_index + i64::from(offset);
        let period_from = boundary(&row, index)?;
        let period_to = boundary(&row, index + 1)?;
        let upcoming = period_from > as_of;
        let cutoff = if upcoming {
            period_from
        } else {
            as_of_exclusive.min(period_to)
        };
        let ranges = statistics_ranges(period_from, period_to, cutoff)?;
        all_ranges.extend(ranges.iter().copied());
        specs.push(StatisticsPeriodSpec {
            offset,
            index,
            period_from,
            period_to,
            cutoff,
            upcoming,
            ranges,
        });
    }
    let rows = repository::trend(pool, user_id, id, &all_ranges, false).await?;
    let mut rows = rows.into_iter();
    let mut carry = carry_in(pool, &row, specs[0].period_from).await?;
    let mut result = Vec::with_capacity(specs.len());

    for spec in specs {
        let total_days = (spec.period_to - spec.period_from).num_days();
        let elapsed_days = (spec.cutoff - spec.period_from)
            .num_days()
            .clamp(0, total_days);
        let available = row
            .amount_minor
            .checked_add(carry)
            .ok_or_else(|| ApiError::internal("budget available overflow"))?;
        let mut actual = 0_i64;
        let mut scheduled = 0_i64;
        let mut points = vec![BudgetStatisticsPoint {
            progress_bps: 0,
            date: spec.period_from,
            actual_spent_minor: 0,
            scheduled_spent_minor: 0,
        }];
        for (from, to) in &spec.ranges {
            let value = rows
                .next()
                .ok_or_else(|| ApiError::internal("budget statistics rows are incomplete"))?;
            if value.date_from != *from || value.date_to != *to {
                return Err(ApiError::internal(
                    "budget statistics rows are out of order",
                ));
            }
            let spent = if spec.upcoming { 0 } else { value.spent_minor };
            if *to <= spec.cutoff {
                actual = actual
                    .checked_add(spent)
                    .ok_or_else(|| ApiError::internal("budget statistics spend overflow"))?;
            } else {
                scheduled = scheduled
                    .checked_add(spent)
                    .ok_or_else(|| ApiError::internal("budget statistics spend overflow"))?;
            }
            let progress_bps =
                ((*to - spec.period_from).num_days() * 10_000 / total_days).clamp(0, 10_000);
            points.push(BudgetStatisticsPoint {
                progress_bps,
                date: to.checked_sub_days(Days::new(1)).unwrap_or(*to),
                actual_spent_minor: actual,
                scheduled_spent_minor: scheduled,
            });
        }
        let committed = actual
            .checked_add(scheduled)
            .ok_or_else(|| ApiError::internal("budget statistics spend overflow"))?;
        let remaining = available
            .checked_sub(committed)
            .ok_or_else(|| ApiError::internal("budget remaining overflow"))?;
        let utilization_bps = if available > 0 {
            Some(
                committed
                    .checked_mul(10_000)
                    .ok_or_else(|| ApiError::internal("budget utilization overflow"))?
                    / available,
            )
        } else {
            None
        };
        result.push(BudgetStatisticsPeriod {
            period_offset: spec.offset,
            period_from: spec.period_from,
            period_to: spec.period_to,
            period_kind: period_kind(spec.period_from, current_index, spec.index, as_of),
            total_days,
            elapsed_days,
            carry_in_minor: carry,
            available_minor: available,
            actual_spent_minor: actual,
            scheduled_spent_minor: scheduled,
            remaining_minor: remaining,
            utilization_bps,
            points,
        });
        carry = rollover_after_period(row.rollover_mode, carry, row.amount_minor, committed)?;
    }

    let total_actual = result.iter().try_fold(0_i64, |sum, period| {
        sum.checked_add(period.actual_spent_minor)
            .ok_or_else(|| ApiError::internal("budget statistics total overflow"))
    })?;
    let total_scheduled = result.iter().try_fold(0_i64, |sum, period| {
        sum.checked_add(period.scheduled_spent_minor)
            .ok_or_else(|| ApiError::internal("budget statistics total overflow"))
    })?;
    let observed_days = result.iter().map(|period| period.elapsed_days).sum::<i64>();
    let utilizations = result
        .iter()
        .filter_map(|period| period.utilization_bps)
        .collect::<Vec<_>>();
    let utilization_total = utilizations.iter().try_fold(0_i64, |sum, value| {
        sum.checked_add(*value)
            .ok_or_else(|| ApiError::internal("budget utilization summary overflow"))
    })?;
    let average_utilization_bps =
        (!utilizations.is_empty()).then(|| utilization_total / utilizations.len() as i64);
    let utilization_spread_bps = utilizations
        .iter()
        .min()
        .zip(utilizations.iter().max())
        .map(|(min, max)| {
            max.checked_sub(*min)
                .ok_or_else(|| ApiError::internal("budget utilization spread overflow"))
        })
        .transpose()?;
    let overspent_periods = result
        .iter()
        .filter(|period| period.remaining_minor < 0)
        .count() as i64;
    Ok(BudgetStatistics {
        from_offset,
        to_offset,
        period_count: selected_count,
        includes_current: to_offset == 0,
        summary: BudgetStatisticsSummary {
            total_actual_spent_minor: total_actual,
            total_scheduled_spent_minor: total_scheduled,
            average_daily_spend_minor: (observed_days > 0).then(|| total_actual / observed_days),
            average_utilization_bps,
            utilization_spread_bps,
            overspent_periods,
        },
        periods: result,
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
    sqlx::query(r#"INSERT INTO budgets (id,user_id,name,amount_minor,start_date,period_count,period_unit,rollover_mode,show_on_overview,overview_position,rollover_anchor_date)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$5)"#)
        .bind(id).bind(user_id).bind(name).bind(request.amount_minor).bind(request.start_date)
        .bind(request.period_count).bind(request.period_unit).bind(request.rollover_mode).bind(request.show_on_overview).bind(position)
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
    let rollover_mode = request.rollover_mode.unwrap_or(old.rollover_mode);
    let account_keys = request
        .account_keys
        .clone()
        .unwrap_or_else(|| old_accounts.iter().map(|a| a.key.clone()).collect());
    validate_definition(amount, count, &account_keys)?;
    let definition_changed = amount != old.amount_minor
        || start != old.start_date
        || count != old.period_count
        || unit != old.period_unit
        || rollover_mode != old.rollover_mode
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
    new_shape.rollover_mode = rollover_mode;
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
    sqlx::query(r#"UPDATE budgets SET name=$3,amount_minor=$4,start_date=$5,period_count=$6,period_unit=$7,rollover_mode=$8,
        show_on_overview=$9,overview_position=$10,rollover_anchor_date=$11,rollover_anchor_minor=$12,updated_at=now()
        WHERE user_id=$1 AND id=$2"#).bind(user_id).bind(id).bind(name).bind(amount).bind(start).bind(count).bind(unit)
        .bind(rollover_mode).bind(show).bind(position).bind(anchor_date).bind(anchor_minor).execute(&mut *transaction).await?;
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
            rollover_mode: BudgetRolloverMode::Accumulate,
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
    fn rollover_modes_handle_surplus_and_overspending_independently() {
        let accumulate = rollover_after_period(BudgetRolloverMode::Accumulate, 0, 1_000, 1_200)
            .and_then(|carry| {
                rollover_after_period(BudgetRolloverMode::Accumulate, carry, 1_000, 100)
            })
            .unwrap();
        let surplus_only = rollover_after_period(BudgetRolloverMode::SurplusOnly, 0, 1_000, 1_200)
            .and_then(|carry| {
                rollover_after_period(BudgetRolloverMode::SurplusOnly, carry, 1_000, 100)
            })
            .unwrap();
        let reset = rollover_after_period(BudgetRolloverMode::Reset, 400, 1_000, 100).unwrap();

        assert_eq!(accumulate, 700);
        assert_eq!(surplus_only, 900);
        assert_eq!(reset, 0);
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

    #[test]
    fn detail_trend_is_contiguous_and_capped_at_120_buckets() {
        let from = NaiveDate::from_ymd_opt(2026, 1, 1).unwrap();
        let to = from.checked_add_days(Days::new(365)).unwrap();
        let (bucket_days, ranges) = trend_ranges(from, to).unwrap();
        assert_eq!(bucket_days, 4);
        assert_eq!(ranges.len(), 92);
        assert_eq!(ranges.first().unwrap().0, from);
        assert_eq!(ranges.last().unwrap().1, to);
        assert!(ranges.windows(2).all(|pair| pair[0].1 == pair[1].0));
    }

    #[test]
    fn statistics_buckets_split_at_the_current_day_boundary() {
        let from = NaiveDate::from_ymd_opt(2026, 1, 1).unwrap();
        let to = NaiveDate::from_ymd_opt(2027, 1, 1).unwrap();
        let cutoff = NaiveDate::from_ymd_opt(2026, 8, 17).unwrap();
        let ranges = statistics_ranges(from, to, cutoff).unwrap();
        assert!(ranges.len() <= 121);
        assert!(ranges.iter().any(|range| range.1 == cutoff));
        assert!(ranges.iter().any(|range| range.0 == cutoff));
        assert!(ranges.windows(2).all(|pair| pair[0].1 == pair[1].0));
    }

    #[test]
    fn statistics_range_defaults_clamp_and_custom_ranges_are_limited() {
        assert_eq!(statistics_offsets(2, None, None).unwrap(), (-2, 0, 3));
        assert_eq!(
            statistics_offsets(30, Some(-23), Some(0)).unwrap(),
            (-23, 0, 24)
        );
        assert!(matches!(
            statistics_offsets(30, Some(-24), Some(0)),
            Err(ApiError::Problem {
                code: "statistics_range_too_large",
                ..
            })
        ));
        assert!(matches!(
            statistics_offsets(2, Some(-3), Some(0)),
            Err(ApiError::Problem {
                code: "invalid_statistics_range",
                ..
            })
        ));
    }

    #[test]
    fn period_cursor_is_opaque_and_rejects_invalid_payloads() {
        let cursor = encode_period_cursor(-50);
        assert_ne!(cursor, "-50");
        assert_eq!(decode_period_cursor(&cursor).unwrap().offset, -50);
        assert!(decode_period_cursor("not-a-cursor").is_err());
    }

    #[test]
    fn day_cursor_is_opaque_and_rejects_invalid_payloads() {
        let date = NaiveDate::from_ymd_opt(2026, 7, 24).unwrap();
        let cursor = encode_day_cursor(date);
        assert_ne!(cursor, date.to_string());
        assert_eq!(decode_day_cursor(&cursor).unwrap().date, date);
        assert!(matches!(
            decode_day_cursor("not-a-cursor"),
            Err(ApiError::Problem {
                code: "invalid_cursor",
                ..
            })
        ));
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
                rollover_mode: BudgetRolloverMode::Accumulate,
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

    #[sqlx::test(migrations = "./migrations")]
    async fn details_and_days_recompute_signed_refunds_and_future_commitments(pool: PgPool) {
        let user_id = Uuid::now_v7();
        sqlx::query("INSERT INTO users (id,email,display_name) VALUES ($1,$2,'Detail User')")
            .bind(user_id)
            .bind(format!("{user_id}@example.com"))
            .execute(&pool)
            .await
            .unwrap();
        let cash = Uuid::now_v7();
        let savings = Uuid::now_v7();
        let food = Uuid::now_v7();
        sqlx::query("INSERT INTO accounts (id,user_id,key,name,type) VALUES ($1,$4,'asset.cash.detail','Cash','asset'),($2,$4,'asset.savings.detail','Savings','asset'),($3,$4,'expense.food.detail','Food','expense')")
            .bind(cash)
            .bind(savings)
            .bind(food)
            .bind(user_id)
            .execute(&pool)
            .await
            .unwrap();
        create(
            &pool,
            user_id,
            CreateBudgetRequest {
                name: "Detail budget".into(),
                amount_minor: 1_000,
                start_date: NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
                period_count: 1,
                period_unit: BudgetPeriodUnit::Month,
                rollover_mode: BudgetRolloverMode::Accumulate,
                account_keys: vec!["asset.cash.detail".into()],
                show_on_overview: false,
            },
            NaiveDate::from_ymd_opt(2026, 2, 10).unwrap(),
        )
        .await
        .unwrap();
        for (date, postings) in [
            ("2026-01-10", vec![(food, 600_i64), (cash, -600_i64)]),
            ("2026-01-15", vec![(food, -100_i64), (cash, 100_i64)]),
            ("2026-01-20", vec![(savings, 500_i64), (cash, -500_i64)]),
            ("2026-02-03", vec![(food, 200_i64), (cash, -200_i64)]),
            ("2026-02-20", vec![(food, 300_i64), (cash, -300_i64)]),
        ] {
            let entry_id = Uuid::now_v7();
            let mut transaction = pool.begin().await.unwrap();
            sqlx::query(
                "INSERT INTO entries (id,user_id,date,description) VALUES ($1,$2,$3,'detail test')",
            )
            .bind(entry_id)
            .bind(user_id)
            .bind(NaiveDate::parse_from_str(date, "%Y-%m-%d").unwrap())
            .execute(&mut *transaction)
            .await
            .unwrap();
            for (account_id, amount) in postings {
                sqlx::query("INSERT INTO postings (id,user_id,entry_id,account_id,amount_minor) VALUES ($1,$2,$3,$4,$5)")
                    .bind(Uuid::now_v7())
                    .bind(user_id)
                    .bind(entry_id)
                    .bind(account_id)
                    .bind(amount)
                    .execute(&mut *transaction)
                    .await
                    .unwrap();
            }
            transaction.commit().await.unwrap();
        }

        let budget_id = repository::list(&pool, user_id, false)
            .await
            .unwrap()
            .pop()
            .unwrap()
            .id;
        let detail = details(
            &pool,
            user_id,
            budget_id,
            0,
            NaiveDate::from_ymd_opt(2026, 2, 10).unwrap(),
        )
        .await
        .unwrap();
        assert_eq!(detail.period_kind, BudgetPeriodKind::Current);
        assert_eq!(detail.budget.carry_in_minor, 500);
        assert_eq!(detail.budget.spent_minor, 500);
        assert_eq!(detail.budget.remaining_minor, 1_000);
        assert_eq!(detail.pace.spent_through_as_of_minor, 200);
        assert_eq!(detail.pace.future_spent_minor, 300);
        assert_eq!(detail.trend.points.len(), 28);
        assert_eq!(detail.trend.points.last().unwrap().remaining_minor, 1_000);

        let days_page = days(
            &pool,
            user_id,
            budget_id,
            0,
            None,
            Some(200),
            NaiveDate::from_ymd_opt(2026, 2, 10).unwrap(),
        )
        .await
        .unwrap();
        assert_eq!(days_page.items.len(), 28);
        assert!(
            days_page
                .items
                .windows(2)
                .all(|pair| pair[0].date > pair[1].date)
        );
        let future = days_page
            .items
            .iter()
            .find(|day| day.date == NaiveDate::from_ymd_opt(2026, 2, 20).unwrap())
            .unwrap();
        assert_eq!(future.spent_minor, 300);
        assert_eq!(future.entry_count, 1);
        assert!(future.is_future);
        let refund_period = details(
            &pool,
            user_id,
            budget_id,
            -1,
            NaiveDate::from_ymd_opt(2026, 2, 10).unwrap(),
        )
        .await
        .unwrap();
        assert_eq!(refund_period.period_kind, BudgetPeriodKind::Past);
        assert_eq!(refund_period.budget.spent_minor, 500);
        assert_eq!(refund_period.budget.remaining_minor, 500);

        let statistics = statistics(
            &pool,
            user_id,
            budget_id,
            Some(-1),
            Some(0),
            NaiveDate::from_ymd_opt(2026, 2, 10).unwrap(),
        )
        .await
        .unwrap();
        assert_eq!(statistics.period_count, 2);
        assert_eq!(statistics.periods[0].actual_spent_minor, 500);
        assert_eq!(statistics.periods[0].utilization_bps, Some(5_000));
        assert_eq!(statistics.periods[1].actual_spent_minor, 200);
        assert_eq!(statistics.periods[1].scheduled_spent_minor, 300);
        assert_eq!(statistics.periods[1].available_minor, 1_500);
        assert_eq!(statistics.periods[1].utilization_bps, Some(3_333));
        assert_eq!(statistics.summary.total_actual_spent_minor, 700);
        assert_eq!(statistics.summary.total_scheduled_spent_minor, 300);
        assert_eq!(statistics.summary.average_daily_spend_minor, Some(17));
        assert_eq!(statistics.summary.average_utilization_bps, Some(4_166));
        assert_eq!(statistics.summary.utilization_spread_bps, Some(1_667));
        assert!(
            statistics.periods[1]
                .points
                .iter()
                .any(|point| point.scheduled_spent_minor == 300)
        );

        let searched_periods = periods(
            &pool,
            user_id,
            budget_id,
            None,
            Some(1),
            Some(NaiveDate::from_ymd_opt(2026, 1, 15).unwrap()),
            NaiveDate::from_ymd_opt(2026, 2, 10).unwrap(),
        )
        .await
        .unwrap();
        assert_eq!(searched_periods.items.len(), 1);
        assert_eq!(searched_periods.items[0].period_offset, -1);
    }
}
