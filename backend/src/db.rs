use sqlx::{PgPool, postgres::PgPoolOptions};

use crate::{ApiResult, config::AppConfig};

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

pub async fn connect(config: &AppConfig) -> ApiResult<PgPool> {
    connect_url(&config.database_url).await
}

pub async fn connect_url(database_url: &str) -> ApiResult<PgPool> {
    Ok(PgPoolOptions::new()
        .max_connections(10)
        .min_connections(1)
        .connect(database_url)
        .await?)
}

pub async fn migrate(pool: &PgPool) -> ApiResult<()> {
    MIGRATOR.run(pool).await?;
    Ok(())
}

pub async fn ready(pool: &PgPool) -> ApiResult<()> {
    sqlx::query("SELECT 1").execute(pool).await?;
    let applied: i64 =
        sqlx::query_scalar("SELECT count(*) FROM _sqlx_migrations WHERE success = TRUE")
            .fetch_one(pool)
            .await?;
    let expected = MIGRATOR
        .iter()
        .filter(|migration| migration.migration_type.is_up_migration())
        .count() as i64;
    if applied != expected {
        return Err(crate::ApiError::service_unavailable(
            "database migrations are not current",
        ));
    }
    Ok(())
}
