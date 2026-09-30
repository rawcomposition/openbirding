use std::path::PathBuf;

pub const NUM_BACKUPS_TO_KEEP: usize = 7;
pub const TARGETS_DB_FILENAME: &str = "targets.db";
pub const OCCURRENCES_DB_FILENAME: &str = "occurrences.db";

const DEFAULT_PORT: u16 = 3000;
const DEFAULT_SQLITE_DIR: &str = "/data";
const DEFAULT_SQLITE_FILENAME: &str = "openbirding.db";
const DEFAULT_OCCURRENCES_MAX_ZONE_RES: f64 = 4.0;

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub sqlite_dir: PathBuf,
    pub sqlite_filename: String,
    pub backup_dir: Option<PathBuf>,
    pub cors_origins: Vec<String>,
    pub cron_secret: Option<String>,
    pub reports_pass: Option<String>,
    pub ebird_api_key: Option<String>,
    pub avicommons_json_path: PathBuf,
    pub occurrences_max_zone_res: f64,
    pub system_alerts_ntfy_topic: Option<String>,
}

fn non_empty_env(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|value| !value.is_empty())
}

impl Config {
    pub fn from_env() -> Self {
        let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        Self {
            port: non_empty_env("PORT")
                .and_then(|p| p.parse().ok())
                .unwrap_or(DEFAULT_PORT),
            sqlite_dir: PathBuf::from(
                non_empty_env("SQLITE_DIR").unwrap_or_else(|| DEFAULT_SQLITE_DIR.into()),
            ),
            sqlite_filename: non_empty_env("SQLITE_FILENAME")
                .unwrap_or_else(|| DEFAULT_SQLITE_FILENAME.into()),
            backup_dir: non_empty_env("SQLITE_BACKUP_DIR").map(PathBuf::from),
            cors_origins: non_empty_env("CORS_ORIGINS")
                .map(|origins| origins.split(',').map(str::to_string).collect())
                .unwrap_or_default(),
            cron_secret: non_empty_env("CRON_SECRET"),
            reports_pass: non_empty_env("REPORTS_PASS"),
            ebird_api_key: non_empty_env("EBIRD_API_KEY"),
            avicommons_json_path: non_empty_env("AVICOMMONS_JSON_PATH")
                .map(PathBuf::from)
                .unwrap_or_else(|| cwd.join("data").join("avicommons-lite.json")),
            occurrences_max_zone_res: std::env::var("OCCURRENCES_MAX_ZONE_RES")
                .map(|raw| crate::js::str_to_number(&raw))
                .unwrap_or(DEFAULT_OCCURRENCES_MAX_ZONE_RES),
            system_alerts_ntfy_topic: non_empty_env("SYSTEM_ALERTS_NTFY_TOPIC"),
        }
    }

    pub fn main_db_path(&self) -> PathBuf {
        self.sqlite_dir.join(&self.sqlite_filename)
    }

    pub fn targets_db_path(&self) -> PathBuf {
        self.sqlite_dir.join(TARGETS_DB_FILENAME)
    }

    pub fn occurrences_db_path(&self) -> PathBuf {
        self.sqlite_dir.join(OCCURRENCES_DB_FILENAME)
    }
}

pub fn staged_path(live: &std::path::Path) -> PathBuf {
    let mut staged = live.as_os_str().to_owned();
    staged.push(".new");
    PathBuf::from(staged)
}
