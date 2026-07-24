use std::env;

use baln_backend::db;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "baln-migrate", about = "Manage Baln database migrations")]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand)]
enum Command {
    /// Apply all pending migrations.
    Up,
    /// Revert the most recently applied migration.
    Down,
    /// Print migration status.
    Info,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = dotenvy::dotenv();
    let database_url = env::var("DATABASE_URL")?;
    let pool = db::connect_url(&database_url).await?;
    match Cli::parse().command.unwrap_or(Command::Up) {
        Command::Up => {
            db::MIGRATOR.run(&pool).await?;
            println!("database is current");
        }
        Command::Down => {
            let versions: Vec<i64> = sqlx::query_scalar(
                "SELECT version FROM _sqlx_migrations WHERE success = TRUE ORDER BY version DESC",
            )
            .fetch_all(&pool)
            .await?;
            if let Some(current) = versions.first() {
                let target = versions.get(1).copied().unwrap_or(0);
                db::MIGRATOR.undo(&pool, target).await?;
                println!("reverted migration {current}");
            } else {
                println!("no applied migration to revert");
            }
        }
        Command::Info => {
            let rows: Vec<(i64, String, bool)> = sqlx::query_as(
                r#"
                SELECT version, description, success
                  FROM _sqlx_migrations
                 ORDER BY version
                "#,
            )
            .fetch_all(&pool)
            .await?;
            if rows.is_empty() {
                println!("no migrations have been applied");
            }
            for (version, description, success) in rows {
                println!(
                    "{version} {description} {}",
                    if success { "applied" } else { "failed" }
                );
            }
        }
    }
    Ok(())
}
