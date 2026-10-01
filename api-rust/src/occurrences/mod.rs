mod load;
mod months;
mod query;
mod scratch;

use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use arc_swap::ArcSwapOption;
use serde_json::{Value, json};
use tokio::sync::watch;

use crate::config::staged_path;
use crate::error::{AppError, AppResult};

pub use months::{MONTHS_IN_YEAR, MonthHotspotQuery, MonthSettings};
pub use query::{HotspotQuery, ResolvedSpecies, SpeciesInput};
use scratch::ScratchPool;

pub struct Csr {
    offsets: Vec<i32>,
    refs: Vec<i32>,
    levels: Vec<u8>,
}

#[derive(Default)]
pub struct Species {
    by_sci: HashMap<Box<str>, i32>,
    by_name: HashMap<Box<str>, i32>,
    by_code: HashMap<Box<str>, i32>,
}

pub struct ZoneDataset {
    res: i64,
    num_refs: usize,
    h3: Vec<i64>,
    samples: Vec<i32>,
    lat: Vec<f32>,
    lng: Vec<f32>,
    q_count: Vec<i32>,
    csr: Csr,
    by_h3: HashMap<u64, i32>,
    scratch: ScratchPool,
}

pub struct Zones {
    by_res: BTreeMap<i64, ZoneDataset>,
    loc_cell_ref: HashMap<i64, Vec<i32>>,
}

pub struct OccurrencesIndex {
    pub generation: u64,
    pub buckets: Vec<f64>,
    pub buckets_json: Value,
    pub min_checklists_floor_json: Value,
    pub min_checklists_floor: f64,
    pub months: Option<MonthSettings>,
    pub version_month: String,
    pub version_year: String,
    pub taxonomy_version: Value,
    pub generated_at: String,
    pub num_locs: usize,
    pub num_year_locs: usize,
    samples: Vec<i32>,
    lat: Vec<f32>,
    lng: Vec<f32>,
    loc_id: Vec<Box<str>>,
    loc_name: Vec<Box<str>>,
    region_ids: Vec<u32>,
    region_table: Vec<Box<str>>,
    q_count: Vec<i32>,
    csr: Csr,
    species: Species,
    db_path: PathBuf,
    max_zone_res: f64,
    zones: tokio::sync::OnceCell<Arc<Zones>>,
    scratch: ScratchPool,
}

impl OccurrencesIndex {
    pub fn version(&self) -> String {
        format!("{} {}", self.version_month, self.version_year)
    }

    pub fn zones_loaded(&self) -> bool {
        self.zones.initialized()
    }

    pub fn resolutions(&self) -> Vec<i64> {
        self.zones
            .get()
            .map(|zones| zones.by_res.keys().copied().collect())
            .unwrap_or_default()
    }

    pub async fn ensure_zones(self: &Arc<Self>) -> AppResult<Arc<Zones>> {
        let index = Arc::clone(self);
        let zones = self
            .zones
            .get_or_try_init(|| async move {
                tokio::task::spawn_blocking(move || {
                    let start = Instant::now();
                    let zones =
                        load::load_zones(&index.db_path, index.buckets.len(), index.max_zone_res)?;
                    tracing::info!(
                        "Occurrences zone index loaded in {} ms",
                        start.elapsed().as_millis()
                    );
                    Ok::<_, String>(Arc::new(zones))
                })
                .await
                .map_err(AppError::internal)?
                .map_err(AppError::internal)
            })
            .await?;
        Ok(Arc::clone(zones))
    }
}

fn load_full(path: &std::path::Path, max_zone_res: f64) -> Result<OccurrencesIndex, String> {
    let index = load::load_index(path, max_zone_res)?;
    let zones = load::load_zones(path, index.buckets.len(), max_zone_res)?;
    index
        .zones
        .set(Arc::new(zones))
        .map_err(|_| "zones already initialised".to_string())?;
    Ok(index)
}

pub struct OccurrencesStore {
    live_path: PathBuf,
    max_zone_res: f64,
    current: ArcSwapOption<OccurrencesIndex>,
    initial_load_done: watch::Sender<bool>,
    load_error: Mutex<Option<String>>,
    swap_in_progress: AtomicBool,
}

impl OccurrencesStore {
    pub fn new(live_path: PathBuf, max_zone_res: f64) -> Arc<Self> {
        Arc::new(Self {
            live_path,
            max_zone_res,
            current: ArcSwapOption::empty(),
            initial_load_done: watch::Sender::new(false),
            load_error: Mutex::new(None),
            swap_in_progress: AtomicBool::new(false),
        })
    }

    fn set_load_error(&self, error: Option<String>) {
        if let Ok(mut slot) = self.load_error.lock() {
            *slot = error;
        }
    }

    fn load_error(&self) -> Option<String> {
        self.load_error.lock().ok().and_then(|slot| slot.clone())
    }

    pub fn start_loading(self: &Arc<Self>) {
        let store = Arc::clone(self);
        tokio::spawn(async move {
            if !store.live_path.exists() {
                store.set_load_error(Some(format!(
                    "occurrences.db not found at {}",
                    store.live_path.display()
                )));
                store.initial_load_done.send_replace(true);
                return;
            }
            let path = store.live_path.clone();
            let max_zone_res = store.max_zone_res;
            let start = Instant::now();
            let loaded =
                tokio::task::spawn_blocking(move || load::load_index(&path, max_zone_res)).await;
            match loaded {
                Ok(Ok(index)) => {
                    tracing::info!(
                        "Occurrences index loaded ({} locations) in {} ms",
                        index.num_year_locs,
                        start.elapsed().as_millis()
                    );
                    let index = Arc::new(index);
                    if store.current.load().is_none() {
                        store.current.store(Some(Arc::clone(&index)));
                    }
                    store.initial_load_done.send_replace(true);
                    if let Err(err) = index.ensure_zones().await {
                        tracing::error!("Failed to load occurrences zones: {err:?}");
                    }
                }
                Ok(Err(error)) => {
                    tracing::error!("Failed to load occurrences index: {error}");
                    store.set_load_error(Some(error));
                    store.initial_load_done.send_replace(true);
                }
                Err(join_error) => {
                    store.set_load_error(Some(join_error.to_string()));
                    store.initial_load_done.send_replace(true);
                }
            }
        });
    }

    pub async fn get(&self) -> AppResult<Arc<OccurrencesIndex>> {
        if let Some(index) = self.current.load_full() {
            return Ok(index);
        }
        let mut done = self.initial_load_done.subscribe();
        done.wait_for(|finished| *finished)
            .await
            .map_err(AppError::internal)?;
        self.current.load_full().ok_or_else(|| {
            AppError::internal(
                self.load_error()
                    .unwrap_or_else(|| "Occurrences index unavailable".into()),
            )
        })
    }

    pub fn status(&self) -> (bool, Option<String>) {
        (self.live_path.exists(), self.load_error())
    }

    pub async fn swap(self: &Arc<Self>) -> (bool, Value) {
        if self.swap_in_progress.swap(true, Ordering::SeqCst) {
            return (
                false,
                json!({ "ok": false, "error": "Occurrences database swap already in progress" }),
            );
        }
        let store = Arc::clone(self);
        let outcome = tokio::task::spawn_blocking(move || store.swap_blocking()).await;
        self.swap_in_progress.store(false, Ordering::SeqCst);
        match outcome {
            Ok(Ok(index)) => {
                let version = index.version();
                tracing::info!(
                    "Occurrences database swapped to version {version} ({} locations)",
                    index.num_year_locs
                );
                (
                    true,
                    json!({ "ok": true, "version": version, "locations": index.num_year_locs }),
                )
            }
            Ok(Err(error)) => (false, json!({ "ok": false, "error": error })),
            Err(join_error) => (
                false,
                json!({ "ok": false, "error": join_error.to_string() }),
            ),
        }
    }

    fn swap_blocking(&self) -> Result<Arc<OccurrencesIndex>, String> {
        let staged = staged_path(&self.live_path);
        let next = if staged.exists() {
            let mut next = load_full(&staged, self.max_zone_res)?;
            std::fs::rename(&staged, &self.live_path).map_err(|err| err.to_string())?;
            next.db_path = self.live_path.clone();
            next
        } else {
            let no_staged = || format!("No staged database at {}", staged.display());
            let live_generated_at =
                load::read_generated_at(&self.live_path).map_err(|_| no_staged())?;
            let loaded_generated_at = self
                .current
                .load()
                .as_ref()
                .map(|index| index.generated_at.clone());
            if live_generated_at.is_none() || live_generated_at == loaded_generated_at {
                return Err(no_staged());
            }
            load_full(&self.live_path, self.max_zone_res)?
        };
        let next = Arc::new(next);
        self.current.store(Some(Arc::clone(&next)));
        self.set_load_error(None);
        self.initial_load_done.send_replace(true);
        Ok(next)
    }
}
