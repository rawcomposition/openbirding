use std::path::{Path, PathBuf};
use std::time::SystemTime;

use axum::extract::State;
use axum::http::HeaderMap;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use rusqlite::{Connection, OpenFlags};
use serde_json::{Value, json};

use crate::config::NUM_BACKUPS_TO_KEEP;
use crate::error::{AppError, AppResult};
use crate::http::{QueryParams, check_cron_secret};
use crate::js::iso_timestamp;
use crate::state::SharedState;

const BACKUP_TIMEZONE: chrono_tz::Tz = chrono_tz::America::Los_Angeles;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/api/v1/backups/create", post(create_backup))
        .route("/api/v1/backups/list", get(list_backups))
}

struct BackupFile {
    name: String,
    path: PathBuf,
    size: u64,
    modified: SystemTime,
}

fn backup_files(dir: &Path) -> std::io::Result<Vec<BackupFile>> {
    let mut files = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if !(name.starts_with("backup-") && name.ends_with(".db")) {
            continue;
        }
        let metadata = std::fs::metadata(entry.path())?;
        files.push(BackupFile {
            name,
            path: entry.path(),
            size: metadata.len(),
            modified: metadata.modified()?,
        });
    }
    files.sort_by_key(|file| std::cmp::Reverse(file.modified));
    Ok(files)
}

fn cleanup_old_backups(dir: &Path) {
    let files = match backup_files(dir) {
        Ok(files) => files,
        Err(err) => {
            tracing::error!("Error cleaning up old backups: {err}");
            return;
        }
    };
    for file in files.iter().skip(NUM_BACKUPS_TO_KEEP) {
        match std::fs::remove_file(&file.path) {
            Ok(()) => tracing::info!("Deleted old backup: {}", file.name),
            Err(err) => {
                tracing::error!("Error cleaning up old backups: {err}");
                return;
            }
        }
    }
}

fn require_backup_dir(state: &SharedState) -> AppResult<PathBuf> {
    state
        .config
        .backup_dir
        .clone()
        .ok_or_else(|| AppError::internal("SQLITE_BACKUP_DIR is not set"))
}

async fn create_backup(
    State(state): State<SharedState>,
    headers: HeaderMap,
    query: QueryParams,
) -> AppResult<Json<Value>> {
    check_cron_secret(state.config.cron_secret.as_deref(), &headers, &query)?;
    let backup_dir = require_backup_dir(&state)?;
    let db_path = state.config.main_db_path();

    let backup_file = tokio::task::spawn_blocking(move || -> AppResult<PathBuf> {
        std::fs::create_dir_all(&backup_dir)?;
        let timestamp = Utc::now()
            .with_timezone(&BACKUP_TIMEZONE)
            .format("%Y-%m-%d_%H-%M");
        let backup_file = backup_dir.join(format!("backup-{timestamp}.db"));
        let source = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        source.backup(rusqlite::MAIN_DB, &backup_file, None)?;
        tracing::info!("Backup completed: {}", backup_file.display());
        cleanup_old_backups(&backup_dir);
        Ok(backup_file)
    })
    .await??;

    Ok(Json(json!({
        "message": "Backup created successfully",
        "path": backup_file.to_string_lossy(),
        "timestamp": iso_timestamp(Utc::now()),
    })))
}

async fn list_backups(
    State(state): State<SharedState>,
    headers: HeaderMap,
    query: QueryParams,
) -> AppResult<Json<Value>> {
    check_cron_secret(state.config.cron_secret.as_deref(), &headers, &query)?;
    let backup_dir = require_backup_dir(&state)?;
    let files = tokio::task::spawn_blocking(move || backup_files(&backup_dir)).await??;
    let backups: Vec<Value> = files
        .iter()
        .map(|file| {
            json!({
                "name": file.name,
                "size": file.size,
                "created": iso_timestamp(DateTime::<Utc>::from(file.modified)),
            })
        })
        .collect();
    Ok(Json(
        json!({ "backups": backups, "total": files.len(), "maxBackups": NUM_BACKUPS_TO_KEEP }),
    ))
}
