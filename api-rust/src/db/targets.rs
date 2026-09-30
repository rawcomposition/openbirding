use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};

use arc_swap::ArcSwapOption;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{Connection, OpenFlags};
use serde_json::{Value, json};

use crate::config::staged_path;
use crate::error::{AppError, AppResult};
use crate::js::{sql_to_json, sql_to_opt_string, sql_to_string};

use super::main::SqlitePool;

const REQUIRED_TABLES: [&str; 11] = [
    "hotspots",
    "month_obs",
    "year_obs",
    "species",
    "metadata",
    "regions",
    "region_month_obs",
    "region_month_samples",
    "h3_cells",
    "h3_cell_obs",
    "h3_cell_samples",
];
const MMAP_SIZE: i64 = 1 << 40;
const CACHE_SIZE_KIB: i64 = 8_192;

#[derive(Debug, Clone)]
pub struct TargetsMetadata {
    pub version: String,
    pub version_month: String,
    pub version_year: String,
    pub taxonomy_version: Value,
    pub generated_at: String,
}

impl TargetsMetadata {
    fn read(conn: &Connection) -> rusqlite::Result<Self> {
        conn.query_row("SELECT * FROM metadata", [], |row| {
            let column = |name: &str| {
                row.as_ref()
                    .column_index(name)
                    .ok()
                    .map(|i| row.get_ref(i))
                    .transpose()
            };
            Ok(Self {
                version: column("version")?.map(sql_to_string).unwrap_or_default(),
                version_month: column("version_month")?
                    .map(sql_to_string)
                    .unwrap_or_default(),
                version_year: column("version_year")?
                    .map(sql_to_string)
                    .unwrap_or_default(),
                taxonomy_version: column("taxonomy_version")?
                    .map(sql_to_json)
                    .unwrap_or(Value::Null),
                generated_at: column("generated_at")?
                    .map(sql_to_string)
                    .unwrap_or_default(),
            })
        })
    }
}

pub struct SpeciesName {
    pub code: Box<str>,
    pub name: Box<str>,
}

pub struct TargetsDb {
    pool: SqlitePool,
    pub metadata: TargetsMetadata,
    species_names: OnceLock<Arc<HashMap<i64, SpeciesName>>>,
}

fn open_read_only(path: &Path) -> rusqlite::Result<Connection> {
    Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY
            | OpenFlags::SQLITE_OPEN_NO_MUTEX
            | OpenFlags::SQLITE_OPEN_URI,
    )
}

fn pool_size() -> u32 {
    std::thread::available_parallelism().map_or(4, |n| n.get() as u32)
}

impl TargetsDb {
    pub fn open(path: &Path) -> Result<Self, String> {
        if !path.exists() {
            return Err(format!("{} does not exist", path.display()));
        }
        let manager = SqliteConnectionManager::file(path)
            .with_flags(OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX | OpenFlags::SQLITE_OPEN_URI)
            .with_init(|conn| {
                conn.execute_batch(&format!(
                    "PRAGMA query_only = ON; PRAGMA mmap_size = {MMAP_SIZE}; PRAGMA cache_size = -{CACHE_SIZE_KIB};"
                ))
            });
        let size = pool_size();
        let pool = r2d2::Pool::builder()
            .max_size(size)
            .min_idle(Some(size))
            .idle_timeout(None)
            .max_lifetime(None)
            .test_on_check_out(false)
            .build(manager)
            .map_err(|err| err.to_string())?;
        let metadata = {
            let conn = pool.get().map_err(|err| err.to_string())?;
            TargetsMetadata::read(&conn).map_err(|err| err.to_string())?
        };
        Ok(Self {
            pool,
            metadata,
            species_names: OnceLock::new(),
        })
    }

    pub async fn run<T, F>(self: &Arc<Self>, f: F) -> AppResult<T>
    where
        T: Send + 'static,
        F: FnOnce(&Connection, &TargetsDb) -> AppResult<T> + Send + 'static,
    {
        let db = Arc::clone(self);
        tokio::task::spawn_blocking(move || {
            let conn = db.pool.get()?;
            f(&conn, &db)
        })
        .await?
    }

    pub fn species_names(&self, conn: &Connection) -> AppResult<Arc<HashMap<i64, SpeciesName>>> {
        if let Some(names) = self.species_names.get() {
            return Ok(Arc::clone(names));
        }
        let mut stmt = conn.prepare("SELECT id, code, name FROM species")?;
        let names = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    SpeciesName {
                        code: sql_to_string(row.get_ref(1)?).into(),
                        name: sql_to_string(row.get_ref(2)?).into(),
                    },
                ))
            })?
            .collect::<rusqlite::Result<HashMap<_, _>>>()?;
        Ok(Arc::clone(
            self.species_names.get_or_init(|| Arc::new(names)),
        ))
    }

    pub fn citation(&self) -> String {
        crate::ebird::ebd_citation(&self.metadata.version_month, &self.metadata.version_year)
    }
}

fn validate_db(path: &Path) -> Result<(), String> {
    let conn = open_read_only(path).map_err(|err| err.to_string())?;
    let tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .and_then(|mut stmt| stmt.query_map([], |row| row.get(0))?.collect())
        .map_err(|err| err.to_string())?;

    let missing: Vec<&str> = REQUIRED_TABLES
        .iter()
        .copied()
        .filter(|t| !tables.iter().any(|name| name == t))
        .collect();
    if !missing.is_empty() {
        return Err(format!("Missing tables: {}", missing.join(", ")));
    }
    if !tables.iter().any(|name| name == "species_fts") {
        return Err("Missing FTS5 index: species_fts".into());
    }

    let meta = conn
        .query_row("SELECT * FROM metadata", [], |row| {
            let mut object = serde_json::Map::new();
            for (i, name) in row.as_ref().column_names().iter().enumerate() {
                object.insert((*name).to_string(), sql_to_json(row.get_ref(i)?));
            }
            Ok(object)
        })
        .ok();
    let truthy = |key: &str| {
        meta.as_ref()
            .is_some_and(|m| crate::js::is_truthy(m.get(key)))
    };
    if !truthy("version") || !truthy("version_year") || !truthy("generated_at") {
        let described =
            meta.map_or_else(|| "undefined".to_string(), |m| Value::Object(m).to_string());
        return Err(format!("Metadata row missing or incomplete: {described}"));
    }
    Ok(())
}

fn read_generated_at(path: &Path) -> Result<Option<String>, String> {
    let conn = open_read_only(path).map_err(|err| err.to_string())?;
    conn.query_row("SELECT generated_at FROM metadata", [], |row| {
        row.get_ref(0).map(sql_to_opt_string)
    })
    .map_err(|err| err.to_string())
}

pub struct TargetsStore {
    current: ArcSwapOption<TargetsDb>,
    swap_in_progress: AtomicBool,
    live_path: PathBuf,
}

impl TargetsStore {
    pub fn open(live_path: PathBuf) -> Self {
        let current = match TargetsDb::open(&live_path) {
            Ok(db) => Some(Arc::new(db)),
            Err(err) => {
                tracing::warn!("Targets database not available: {err}");
                None
            }
        };
        Self {
            current: ArcSwapOption::new(current),
            swap_in_progress: AtomicBool::new(false),
            live_path,
        }
    }

    pub fn current(&self) -> Option<Arc<TargetsDb>> {
        self.current.load_full()
    }

    pub fn require(&self) -> AppResult<Arc<TargetsDb>> {
        self.current()
            .ok_or_else(|| AppError::internal("Targets database not available"))
    }

    pub async fn swap(self: &Arc<Self>) -> (bool, Value) {
        if self.swap_in_progress.swap(true, Ordering::SeqCst) {
            return (
                false,
                json!({ "ok": false, "error": "Targets database swap already in progress" }),
            );
        }
        let store = Arc::clone(self);
        let outcome = tokio::task::spawn_blocking(move || store.swap_blocking()).await;
        self.swap_in_progress.store(false, Ordering::SeqCst);
        match outcome {
            Ok(Ok(version)) => {
                tracing::info!("Targets database swapped to version {version}");
                (true, json!({ "ok": true, "version": version }))
            }
            Ok(Err(error)) => (false, json!({ "ok": false, "error": error })),
            Err(join_error) => (
                false,
                json!({ "ok": false, "error": join_error.to_string() }),
            ),
        }
    }

    fn swap_blocking(&self) -> Result<String, String> {
        let staged = staged_path(&self.live_path);
        if staged.exists() {
            validate_db(&staged)?;
            let next = TargetsDb::open(&staged)?;
            std::fs::rename(&staged, &self.live_path).map_err(|err| err.to_string())?;
            let version = next.metadata.version.clone();
            self.current.store(Some(Arc::new(next)));
            return Ok(version);
        }

        let live_generated_at = read_generated_at(&self.live_path)
            .map_err(|_| format!("No staged database at {}", staged.display()))?;
        let loaded_generated_at = self.current().map(|db| db.metadata.generated_at.clone());
        if live_generated_at.is_some() && live_generated_at == loaded_generated_at {
            return Err(format!("No staged database at {}", staged.display()));
        }
        validate_db(&self.live_path)?;
        let next = TargetsDb::open(&self.live_path)?;
        let version = next.metadata.version.clone();
        self.current.store(Some(Arc::new(next)));
        Ok(version)
    }
}
