use std::env;

use clap::{Parser, Subcommand};
use sqlx::{PgPool, postgres::PgPoolOptions};
use uuid::Uuid;

#[derive(Parser)]
#[command(name = "baln-admin", about = "Provision and manage Baln users")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    User {
        #[command(subcommand)]
        command: UserCommand,
    },
}

#[derive(Subcommand)]
enum UserCommand {
    Create {
        #[arg(long)]
        email: String,
        #[arg(long)]
        name: String,
    },
    List,
    Enable {
        #[arg(long)]
        email: String,
    },
    Disable {
        #[arg(long)]
        email: String,
    },
    UnlinkGoogle {
        #[arg(long)]
        email: String,
    },
    RevokeSessions {
        #[arg(long)]
        email: String,
    },
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = dotenvy::dotenv();
    let database_url = env::var("DATABASE_URL")?;
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&database_url)
        .await?;
    match Cli::parse().command {
        Command::User { command } => handle_user(&pool, command).await?,
    }
    Ok(())
}

async fn handle_user(pool: &PgPool, command: UserCommand) -> Result<(), sqlx::Error> {
    match command {
        UserCommand::Create { email, name } => {
            let email = normalize_email(&email);
            let name = name.trim();
            let id = Uuid::now_v7();
            sqlx::query(
                r#"
                INSERT INTO users (id, email, display_name)
                VALUES ($1, $2, $3)
                "#,
            )
            .bind(id)
            .bind(&email)
            .bind(name)
            .execute(pool)
            .await?;
            println!("created user {email} ({id})");
        }
        UserCommand::List => {
            let users: Vec<(Uuid, String, String, bool, bool)> = sqlx::query_as(
                r#"
                SELECT id, email::text, display_name, active, google_sub IS NOT NULL
                  FROM users
                 ORDER BY email
                "#,
            )
            .fetch_all(pool)
            .await?;
            for (id, email, name, active, linked) in users {
                println!("{id}\t{email}\t{name}\tactive={active}\tgoogle_linked={linked}");
            }
        }
        UserCommand::Enable { email } => {
            update_active(pool, &email, true).await?;
        }
        UserCommand::Disable { email } => {
            let email = normalize_email(&email);
            let mut transaction = pool.begin().await?;
            affected(
                sqlx::query(
                    "UPDATE users SET active = FALSE, auth_version = auth_version + 1 WHERE email = $1",
                )
                .bind(&email)
                .execute(&mut *transaction)
                .await?
                .rows_affected(),
                &email,
            );
            sqlx::query(
                "UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = (SELECT id FROM users WHERE email = $1)",
            )
            .bind(&email)
            .execute(&mut *transaction)
            .await?;
            transaction.commit().await?;
        }
        UserCommand::UnlinkGoogle { email } => {
            let email = normalize_email(&email);
            let mut transaction = pool.begin().await?;
            let user_id: Option<Uuid> = sqlx::query_scalar(
                r#"
                UPDATE users
                   SET google_sub = NULL, auth_version = auth_version + 1
                 WHERE email = $1
                RETURNING id
                "#,
            )
            .bind(&email)
            .fetch_optional(&mut *transaction)
            .await?;
            if let Some(user_id) = user_id {
                sqlx::query(
                    "UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1",
                )
                .bind(user_id)
                .execute(&mut *transaction)
                .await?;
                println!("unlinked Google and revoked sessions for {email}");
            } else {
                eprintln!("user not found: {email}");
            }
            transaction.commit().await?;
        }
        UserCommand::RevokeSessions { email } => {
            let email = normalize_email(&email);
            let mut transaction = pool.begin().await?;
            let user_id: Option<Uuid> = sqlx::query_scalar(
                "UPDATE users SET auth_version = auth_version + 1 WHERE email = $1 RETURNING id",
            )
            .bind(&email)
            .fetch_optional(&mut *transaction)
            .await?;
            if let Some(user_id) = user_id {
                sqlx::query(
                    "UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1",
                )
                .bind(user_id)
                .execute(&mut *transaction)
                .await?;
                println!("revoked all sessions for {email}");
            } else {
                eprintln!("user not found: {email}");
            }
            transaction.commit().await?;
        }
    }
    Ok(())
}

async fn update_active(pool: &PgPool, email: &str, active: bool) -> Result<(), sqlx::Error> {
    let email = normalize_email(email);
    let rows = sqlx::query("UPDATE users SET active = $2 WHERE email = $1")
        .bind(&email)
        .bind(active)
        .execute(pool)
        .await?
        .rows_affected();
    affected(rows, &email);
    Ok(())
}

fn affected(rows: u64, email: &str) {
    if rows == 0 {
        eprintln!("user not found: {email}");
    } else {
        println!("updated user {email}");
    }
}

fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}
