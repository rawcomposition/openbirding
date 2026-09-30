use std::path::Path;
use std::time::Duration;

use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;

use crate::error::{AppError, AppResult};

pub type SqlitePool = r2d2::Pool<SqliteConnectionManager>;

const MAIN_POOL_SIZE: u32 = 8;
const BUSY_TIMEOUT: Duration = Duration::from_secs(5);

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS "packs" (
  "id" integer primary key,
  "region" text not null unique,
  "hotspots" integer,
  "last_synced" text,
  "min_x" real,
  "min_y" real,
  "max_x" real,
  "max_y" real,
  "center_lat" real,
  "center_lng" real,
  "has_custom_center" integer,
  constraint "fk_packs_region" foreign key ("region") references "regions" ("id") on delete cascade
);
CREATE TABLE IF NOT EXISTS "clusters" (
  "pack_id" integer not null,
  "lat" real not null,
  "lng" real not null,
  "count" integer default 0 not null,
  constraint "chk_cluster_lat" check (lat BETWEEN -90 AND 90),
  constraint "chk_cluster_lng" check (lng BETWEEN -180 AND 180),
  constraint "fk_clusters_pack" foreign key ("pack_id") references "packs" ("id") on delete cascade
);
CREATE TABLE IF NOT EXISTS "regions" (
  "id" text primary key,
  "name" text not null,
  "long_name" text,
  "parents" text,
  "level" integer not null check (level IN (1, 2, 3)),
  "has_children" integer
);
CREATE TABLE IF NOT EXISTS "pack_downloads" (
  "id" integer primary key autoincrement,
  "pack_id" integer not null,
  "pack_region" text not null,
  "method" text,
  "app_version" text,
  "app_platform" text,
  "app_environment" text,
  "user_agent" text,
  "created_at" text default CURRENT_TIMESTAMP not null,
  constraint "fk_pack_downloads_pack" foreign key ("pack_id") references "packs" ("id") on delete cascade
);
CREATE TABLE IF NOT EXISTS "android" (
  "id" integer primary key autoincrement,
  "email" text not null unique,
  "created_at" text default CURRENT_TIMESTAMP not null
);
CREATE TABLE IF NOT EXISTS "life_lists" (
  "token" text primary key,
  "file_name" text,
  "species" text not null,
  "species_count" integer not null,
  "created_at" text default CURRENT_TIMESTAMP not null,
  "updated_at" text
);
"#;

#[derive(Clone)]
pub struct MainDb {
    pool: SqlitePool,
}

impl MainDb {
    pub fn open(path: &Path) -> Result<Self, String> {
        let manager = SqliteConnectionManager::file(path).with_init(|conn| {
            conn.busy_timeout(BUSY_TIMEOUT)?;
            conn.execute_batch("PRAGMA foreign_keys = ON;")
        });
        let pool = r2d2::Pool::builder()
            .max_size(MAIN_POOL_SIZE)
            .min_idle(Some(1))
            .build(manager)
            .map_err(|err| format!("Failed to open {}: {err}", path.display()))?;
        Ok(Self { pool })
    }

    pub async fn run<T, F>(&self, f: F) -> AppResult<T>
    where
        T: Send + 'static,
        F: FnOnce(&mut Connection) -> AppResult<T> + Send + 'static,
    {
        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || {
            let mut conn = pool.get()?;
            f(&mut conn)
        })
        .await?
    }

    pub fn run_blocking<T>(&self, f: impl FnOnce(&mut Connection) -> AppResult<T>) -> AppResult<T> {
        let mut conn = self.pool.get()?;
        f(&mut conn)
    }
}

pub fn setup_database(conn: &Connection) -> AppResult<()> {
    let journal_mode: String = conn.query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))?;
    if !journal_mode.eq_ignore_ascii_case("wal") {
        return Err(AppError::internal(format!(
            "Could not enable WAL mode (journal_mode={journal_mode})"
        )));
    }
    conn.execute_batch(SCHEMA)?;
    setup_regions_fts(conn)?;
    tracing::info!("Main database setup complete");
    Ok(())
}

pub fn setup_regions_fts(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS regions_fts USING fts5(
          name,
          long_name,
          id,
          content='regions',
          content_rowid='rowid',
          tokenize='unicode61 remove_diacritics 2',
          prefix='2 3 4'
        );
        INSERT INTO regions_fts(regions_fts) VALUES('rebuild');
        INSERT INTO regions_fts(regions_fts) VALUES('optimize');",
    )?;
    Ok(())
}
