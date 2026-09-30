use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tokio::sync::OnceCell;

use crate::avicommons::Avicommons;
use crate::config::Config;
use crate::db::main::MainDb;
use crate::db::targets::TargetsStore;
use crate::occurrences::{OccurrencesStore, ResolvedSpecies};

const TAXONOMY_TTL: Duration = Duration::from_secs(6 * 60 * 60);
const LIFE_LIST_CACHE_CAPACITY: usize = 512;

pub struct AppState {
    pub config: Arc<Config>,
    pub main: MainDb,
    pub targets: Arc<TargetsStore>,
    pub occurrences: Arc<OccurrencesStore>,
    pub avicommons: Avicommons,
    pub http: reqwest::Client,
    pub taxonomy: TtlCache<axum::body::Bytes>,
    pub region_names: OnceCell<Arc<HashMap<String, String>>>,
    pub life_lists: LifeListCache,
}

pub type SharedState = Arc<AppState>;

pub struct TtlCache<T: Clone> {
    ttl: Duration,
    slot: Mutex<Option<(Instant, T)>>,
}

impl<T: Clone> TtlCache<T> {
    pub fn new(ttl: Duration) -> Self {
        Self {
            ttl,
            slot: Mutex::new(None),
        }
    }

    pub fn taxonomy() -> Self {
        Self::new(TAXONOMY_TTL)
    }

    pub fn get(&self) -> Option<T> {
        let slot = self.slot.lock().ok()?;
        slot.as_ref()
            .filter(|(stored, _)| stored.elapsed() < self.ttl)
            .map(|(_, value)| value.clone())
    }

    pub fn set(&self, value: T) {
        if let Ok(mut slot) = self.slot.lock() {
            *slot = Some((Instant::now(), value));
        }
    }
}

#[derive(Clone, PartialEq, Eq)]
pub struct LifeListVersion {
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub index_generation: u64,
}

#[derive(Default)]
pub struct LifeListCache {
    entries: Mutex<HashMap<String, (LifeListVersion, Arc<ResolvedSpecies>)>>,
}

impl LifeListCache {
    pub fn get(&self, token: &str, version: &LifeListVersion) -> Option<Arc<ResolvedSpecies>> {
        let entries = self.entries.lock().ok()?;
        entries
            .get(token)
            .filter(|(cached, _)| cached == version)
            .map(|(_, resolved)| Arc::clone(resolved))
    }

    pub fn insert(&self, token: String, version: LifeListVersion, resolved: Arc<ResolvedSpecies>) {
        if let Ok(mut entries) = self.entries.lock() {
            if entries.len() >= LIFE_LIST_CACHE_CAPACITY && !entries.contains_key(&token) {
                entries.clear();
            }
            entries.insert(token, (version, resolved));
        }
    }

    pub fn invalidate(&self, token: &str) {
        if let Ok(mut entries) = self.entries.lock() {
            entries.remove(token);
        }
    }
}
