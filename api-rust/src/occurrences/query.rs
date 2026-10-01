use std::collections::{HashMap, HashSet};
use std::ops::Range;

use rayon::prelude::*;
use serde::Serialize;
use serde_json::{Value, json};

use crate::js::js_trim;
use crate::validators::BoundingBox;

use super::scratch::{Scratch, ScratchPool};
use super::{Csr, OccurrencesIndex, ZoneDataset, Zones};

const SCAN_CHUNK_SIZE: usize = 16_384;
const BUCKET_MATCH_EPSILON: f64 = 1e-9;

#[derive(Debug, Clone, PartialEq)]
pub struct SpeciesInput {
    pub sci_name: Option<String>,
    pub common_name: Option<String>,
    pub code: Option<String>,
    pub from_string: bool,
}

impl SpeciesInput {
    pub fn from_json(item: &Value) -> Option<Self> {
        match item {
            Value::String(s) => Some(Self {
                sci_name: Some(s.clone()),
                common_name: None,
                code: None,
                from_string: true,
            }),
            Value::Object(map) => {
                let field = |key: &str| map.get(key).and_then(Value::as_str).map(str::to_string);
                Some(Self {
                    sci_name: field("sciName"),
                    common_name: field("commonName"),
                    code: field("code"),
                    from_string: false,
                })
            }
            Value::Array(_) => Some(Self {
                sci_name: None,
                common_name: None,
                code: None,
                from_string: false,
            }),
            _ => None,
        }
    }

    pub fn to_json(&self) -> Value {
        if self.from_string {
            json!({ "sciName": self.sci_name })
        } else {
            json!({ "sciName": self.sci_name, "commonName": self.common_name, "code": self.code })
        }
    }
}

#[derive(Debug, Default)]
pub struct ResolvedSpecies {
    pub ids: Vec<i32>,
    pub lookup: HashSet<i32>,
    pub unmatched: Vec<String>,
}

impl ResolvedSpecies {
    pub fn matched(&self) -> usize {
        self.ids.len()
    }
}

pub struct HotspotQuery<'a> {
    pub seen: &'a ResolvedSpecies,
    pub bucket: usize,
    pub min_checklists: f64,
    pub region_codes: Option<&'a [String]>,
    pub bbox: Option<BoundingBox>,
    pub limit: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiferHotspot<'a> {
    pub id: &'a str,
    pub name: &'a str,
    pub lat: f64,
    pub lng: f64,
    pub region_code: &'a str,
    pub lifers: i32,
    pub total_species: i32,
    pub checklists: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CellInfo {
    pub h3: String,
    pub samples: i64,
    pub total_species: i64,
    pub lifers: i64,
    pub named_hotspots: i64,
    pub hotspot_checklists: i64,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CellsSummary {
    pub samples: i64,
    pub total_species: i64,
    pub lifers: i64,
    pub named_hotspots: i64,
    pub hotspot_checklists: i64,
}

fn region_matches(region_code: &str, codes: &[String]) -> bool {
    codes.iter().any(|code| {
        region_code == code
            || (region_code.len() > code.len()
                && region_code.starts_with(code.as_str())
                && region_code.as_bytes()[code.len()] == b'-')
    })
}

fn lng_in_bbox(lng: f64, min_lng: f64, max_lng: f64) -> bool {
    if min_lng <= max_lng {
        lng >= min_lng && lng <= max_lng
    } else {
        lng >= min_lng || lng <= max_lng
    }
}

fn in_bbox(bbox: &BoundingBox, lat: f32, lng: f32) -> bool {
    let lat = f64::from(lat);
    !(lat < bbox.min_lat
        || lat > bbox.max_lat
        || !lng_in_bbox(f64::from(lng), bbox.min_lng, bbox.max_lng))
}

impl Csr {
    fn segment(&self, species_id: i32) -> Option<Range<usize>> {
        if species_id < 0 || species_id as usize + 1 >= self.offsets.len() {
            return None;
        }
        let start = self.offsets[species_id as usize].max(0) as usize;
        let end = (self.offsets[species_id as usize + 1].max(0) as usize).min(self.refs.len());
        Some(start..end.max(start))
    }

    fn tally_into(&self, counter: &mut [i32], seen: &[i32], min_level: u8) {
        for &species_id in seen {
            let Some(range) = self.segment(species_id) else {
                continue;
            };
            for i in range {
                if self.levels.get(i).copied().unwrap_or(0) >= min_level
                    && let Some(slot) = counter.get_mut(self.refs[i] as usize)
                {
                    *slot += 1;
                }
            }
        }
    }

    fn tally<'p>(&self, pool: &'p ScratchPool, seen: &[i32], min_level: u8) -> Scratch<'p> {
        let mut counter = pool.take_zeroed();
        self.tally_into(&mut counter, seen, min_level);
        counter
    }

    fn species_count(&self) -> usize {
        self.offsets.len().saturating_sub(1)
    }
}

struct MinHeap {
    refs: Vec<u32>,
    values: Vec<i32>,
    size: usize,
}

impl MinHeap {
    fn new(capacity: usize) -> Self {
        Self {
            refs: vec![0; capacity],
            values: vec![0; capacity],
            size: 0,
        }
    }

    fn swap(&mut self, x: usize, y: usize) {
        self.values.swap(x, y);
        self.refs.swap(x, y);
    }

    fn sift_up(&mut self, mut i: usize) {
        while i > 0 {
            let parent = (i - 1) >> 1;
            if self.values[parent] <= self.values[i] {
                break;
            }
            self.swap(parent, i);
            i = parent;
        }
    }

    fn sift_down(&mut self, mut i: usize) {
        loop {
            let left = 2 * i + 1;
            let right = left + 1;
            let mut smallest = i;
            if left < self.size && self.values[left] < self.values[smallest] {
                smallest = left;
            }
            if right < self.size && self.values[right] < self.values[smallest] {
                smallest = right;
            }
            if smallest == i {
                break;
            }
            self.swap(smallest, i);
            i = smallest;
        }
    }

    fn offer(&mut self, reference: u32, value: i32) {
        let capacity = self.refs.len();
        if self.size < capacity {
            self.refs[self.size] = reference;
            self.values[self.size] = value;
            self.size += 1;
            self.sift_up(self.size - 1);
        } else if capacity > 0 && value > self.values[0] {
            self.refs[0] = reference;
            self.values[0] = value;
            self.sift_down(0);
        }
    }

    fn into_entries(self) -> Vec<(u32, i32)> {
        (0..self.size)
            .map(|i| (self.refs[i], self.values[i]))
            .collect()
    }
}

fn scan_chunks<T: Send>(len: usize, scan: impl Fn(Range<usize>) -> T + Sync) -> Vec<T> {
    (0..len.div_ceil(SCAN_CHUNK_SIZE))
        .into_par_iter()
        .map(|chunk| scan(chunk * SCAN_CHUNK_SIZE..((chunk + 1) * SCAN_CHUNK_SIZE).min(len)))
        .collect()
}

fn h3_hex(cell: i64) -> String {
    format!("{:x}", cell as u64)
}

impl ZoneDataset {
    fn bucket_zero(&self) -> &[i32] {
        &self.q_count[..self.num_refs.min(self.q_count.len())]
    }

    fn ref_for_hex(&self, h3: &str) -> Option<i32> {
        if h3.starts_with('0') {
            return None;
        }
        u64::from_str_radix(h3, 16)
            .ok()
            .and_then(|cell| self.by_h3.get(&cell).copied())
    }

    fn lifer_quantiles(&self, seen: &[i32], breaks: usize) -> Vec<i32> {
        let counter = self.csr.tally(&self.scratch, seen, 0);
        let q0 = self.bucket_zero();
        let mut values: Vec<i32> = (0..self.num_refs)
            .filter_map(|r| {
                let lifers = q0.get(r).copied().unwrap_or(0) - counter[r];
                (lifers > 0).then_some(lifers)
            })
            .collect();
        if values.is_empty() {
            return vec![1];
        }
        values.sort_unstable();
        (1..=breaks)
            .map(|i| {
                let position = ((i as f64 / breaks as f64) * values.len() as f64).ceil() - 1.0;
                let index = (position.max(0.0) as usize).min(values.len() - 1);
                values[index]
            })
            .collect()
    }

    fn union_species(&self, seen: &HashSet<i32>, selected_refs: &HashSet<i32>) -> (i64, i64) {
        let mut selected = vec![false; self.num_refs];
        for &r in selected_refs {
            if let Some(slot) = selected.get_mut(r as usize) {
                *slot = true;
            }
        }
        (0..self.csr.species_count())
            .into_par_iter()
            .filter_map(|species_id| {
                let range = self.csr.segment(species_id as i32)?;
                let present = self.csr.refs[range]
                    .iter()
                    .any(|&r| selected.get(r as usize).copied().unwrap_or(false));
                present.then(|| (1i64, i64::from(!seen.contains(&(species_id as i32)))))
            })
            .reduce(|| (0, 0), |a, b| (a.0 + b.0, a.1 + b.1))
    }
}

impl OccurrencesIndex {
    fn bucket_counts(&self, bucket: usize) -> &[i32] {
        let start = (bucket * self.num_locs).min(self.q_count.len());
        let end = ((bucket + 1) * self.num_locs).min(self.q_count.len());
        &self.q_count[start..end]
    }

    pub fn bucket_for_frequency(&self, frequency: f64) -> usize {
        self.buckets
            .iter()
            .rposition(|bucket| *bucket <= frequency + BUCKET_MATCH_EPSILON)
            .unwrap_or(0)
    }

    pub fn bucket_value(&self, bucket: usize) -> f64 {
        self.buckets.get(bucket).copied().unwrap_or(f64::NAN)
    }

    pub fn resolve_species(&self, inputs: &[SpeciesInput]) -> ResolvedSpecies {
        let mut resolved = ResolvedSpecies::default();
        let normalize = |value: &Option<String>| {
            value
                .as_deref()
                .map(|v| js_trim(v).to_lowercase())
                .filter(|v| !v.is_empty())
        };
        for input in inputs {
            let code = normalize(&input.code);
            let sci = normalize(&input.sci_name);
            let common = normalize(&input.common_name);
            let mut id = code
                .as_deref()
                .and_then(|c| self.species.by_code.get(c).copied());
            if id.is_none() {
                id = sci
                    .as_deref()
                    .and_then(|s| self.species.by_sci.get(s).copied());
            }
            if id.is_none() {
                id = common
                    .as_deref()
                    .and_then(|c| self.species.by_name.get(c).copied());
            }
            if id.is_none()
                && let Some(sci) = sci.as_deref()
            {
                let binomial = sci.split_whitespace().take(2).collect::<Vec<_>>().join(" ");
                if binomial != sci {
                    id = self.species.by_sci.get(binomial.as_str()).copied();
                }
            }
            match id {
                Some(id) => {
                    if resolved.lookup.insert(id) {
                        resolved.ids.push(id);
                    }
                }
                None => {
                    let label = [&input.sci_name, &input.common_name, &input.code]
                        .into_iter()
                        .flatten()
                        .find(|value| !value.is_empty())
                        .cloned()
                        .unwrap_or_default();
                    if !label.is_empty() {
                        resolved.unmatched.push(label);
                    }
                }
            }
        }
        resolved
    }

    pub fn query_hotspots(&self, query: &HotspotQuery<'_>) -> (Vec<LiferHotspot<'_>>, usize) {
        let min_checklists = query.min_checklists.max(self.min_checklists_floor);
        let q_count = self.bucket_counts(query.bucket);
        let counter = self.csr.tally(
            &self.scratch,
            &query.seen.ids,
            query.bucket.min(u8::MAX as usize) as u8,
        );
        let region_mask: Option<Vec<bool>> = query.region_codes.map(|codes| {
            self.region_table
                .iter()
                .map(|region| region_matches(region, codes))
                .collect()
        });

        let chunks = scan_chunks(self.num_locs, |range| {
            let mut candidates = 0usize;
            let mut passing: Vec<(u32, i32)> = Vec::new();
            for r in range {
                if let Some(mask) = &region_mask
                    && !mask[self.region_ids[r] as usize]
                {
                    continue;
                }
                if let Some(bbox) = &query.bbox
                    && !in_bbox(bbox, self.lat[r], self.lng[r])
                {
                    continue;
                }
                let samples = f64::from(self.samples[r]);
                if samples < self.min_checklists_floor {
                    continue;
                }
                candidates += 1;
                if samples < min_checklists {
                    continue;
                }
                let lifers = q_count.get(r).copied().unwrap_or(0) - counter[r];
                if lifers > 0 {
                    passing.push((r as u32, lifers));
                }
            }
            (candidates, passing)
        });

        let mut heap = MinHeap::new(query.limit);
        let mut candidates = 0;
        for (chunk_candidates, passing) in chunks {
            candidates += chunk_candidates;
            for (r, lifers) in passing {
                heap.offer(r, lifers);
            }
        }
        let mut top = heap.into_entries();
        top.sort_by(|x, y| {
            y.1.cmp(&x.1)
                .then_with(|| self.samples[y.0 as usize].cmp(&self.samples[x.0 as usize]))
        });

        let items = top
            .into_iter()
            .map(|(r, lifers)| {
                let r = r as usize;
                LiferHotspot {
                    id: &self.loc_id[r],
                    name: &self.loc_name[r],
                    lat: f64::from(self.lat[r]),
                    lng: f64::from(self.lng[r]),
                    region_code: &self.region_table[self.region_ids[r] as usize],
                    lifers,
                    total_species: q_count.get(r).copied().unwrap_or(0),
                    checklists: self.samples[r],
                }
            })
            .collect();
        (items, candidates)
    }

    pub fn grid_cells(
        &self,
        zones: &Zones,
        seen: &ResolvedSpecies,
        res: i64,
        bbox: &BoundingBox,
    ) -> (Vec<(String, i32)>, i32) {
        let Some(zone) = zones.by_res.get(&res) else {
            return (Vec::new(), 0);
        };
        let counter = zone.csr.tally(&zone.scratch, &seen.ids, 0);
        let q0 = zone.bucket_zero();
        let cells: Vec<(String, i32)> = scan_chunks(zone.num_refs, |range| {
            range
                .filter_map(|r| {
                    let total = q0.get(r).copied().unwrap_or(0);
                    if total <= 0 || !in_bbox(bbox, zone.lat[r], zone.lng[r]) {
                        return None;
                    }
                    Some((h3_hex(zone.h3[r]), (total - counter[r]).max(0)))
                })
                .collect::<Vec<_>>()
        })
        .into_iter()
        .flatten()
        .collect();
        let max_lifers = cells
            .iter()
            .map(|(_, lifers)| *lifers)
            .max()
            .unwrap_or(0)
            .max(0);
        (cells, max_lifers)
    }

    pub fn grid_quantiles(
        &self,
        zones: &Zones,
        seen: &ResolvedSpecies,
        breaks: usize,
    ) -> Vec<(i64, Vec<i32>)> {
        let datasets: Vec<&ZoneDataset> = zones.by_res.values().collect();
        datasets
            .par_iter()
            .map(|zone| (zone.res, zone.lifer_quantiles(&seen.ids, breaks)))
            .collect()
    }

    pub fn cells_info(
        &self,
        zones: &Zones,
        seen: &ResolvedSpecies,
        res: i64,
        h3s: &[String],
    ) -> (Vec<CellInfo>, CellsSummary) {
        let zone = zones.by_res.get(&res);
        let cell_ref_of_loc = zones.loc_cell_ref.get(&res);
        let wanted: Option<HashSet<i32>> =
            zone.map(|z| h3s.iter().filter_map(|h3| z.ref_for_hex(h3)).collect());

        let mut hotspot_counts: HashMap<i32, i64> = HashMap::new();
        let mut hotspot_checklists: HashMap<i32, i64> = HashMap::new();
        if let (Some(cell_refs), Some(wanted)) = (cell_ref_of_loc, &wanted) {
            for r in 0..self.num_locs {
                let Some(&cell_ref) = cell_refs.get(r) else {
                    continue;
                };
                if cell_ref < 0 || !wanted.contains(&cell_ref) {
                    continue;
                }
                *hotspot_counts.entry(cell_ref).or_default() += 1;
                *hotspot_checklists.entry(cell_ref).or_default() += i64::from(self.samples[r]);
            }
        }

        let counter = zone.map(|z| z.csr.tally(&z.scratch, &seen.ids, 0));
        let cells = h3s
            .iter()
            .map(|h3| {
                let found = zone.and_then(|z| z.ref_for_hex(h3));
                let named_hotspots =
                    found.map_or(0, |r| hotspot_counts.get(&r).copied().unwrap_or(0));
                let checklists =
                    found.map_or(0, |r| hotspot_checklists.get(&r).copied().unwrap_or(0));
                match (zone, found, &counter) {
                    (Some(z), Some(r), Some(counter)) => {
                        let total_species =
                            i64::from(z.bucket_zero().get(r as usize).copied().unwrap_or(0));
                        CellInfo {
                            h3: h3.clone(),
                            samples: i64::from(z.samples[r as usize]),
                            total_species,
                            lifers: (total_species - i64::from(counter[r as usize])).max(0),
                            named_hotspots,
                            hotspot_checklists: checklists,
                        }
                    }
                    _ => CellInfo {
                        h3: h3.clone(),
                        samples: 0,
                        total_species: 0,
                        lifers: 0,
                        named_hotspots,
                        hotspot_checklists: checklists,
                    },
                }
            })
            .collect();

        let mut summary = CellsSummary::default();
        if let (Some(z), Some(wanted)) = (zone, &wanted) {
            for &r in wanted {
                summary.samples += i64::from(z.samples.get(r as usize).copied().unwrap_or(0));
                summary.named_hotspots += hotspot_counts.get(&r).copied().unwrap_or(0);
                summary.hotspot_checklists += hotspot_checklists.get(&r).copied().unwrap_or(0);
            }
            let (total_species, lifers) = z.union_species(&seen.lookup, wanted);
            summary.total_species = total_species;
            summary.lifers = lifers;
        }
        (cells, summary)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::occurrences::MonthHotspotQuery;
    use crate::occurrences::load::load_index;
    use rusqlite::Connection;

    fn fixture() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("occurrences.db");
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(
            "CREATE TABLE metadata (version TEXT, version_year TEXT, version_month TEXT, taxonomy_version TEXT,
               generated_at TEXT, buckets TEXT, min_score REAL, min_checklists INTEGER,
               month_min_checklists INTEGER, month_score_scale INTEGER);
             INSERT INTO metadata VALUES ('jan-2026', '2026', 'Jan', '2025', 'g1', '[0.05, 0.1, 0.2]', 0.05, 2, 1, 100);
             CREATE TABLE species (id INTEGER PRIMARY KEY, code TEXT, name TEXT, sci_name TEXT, sci_lower TEXT,
               name_lower TEXT, taxon_order INTEGER);
             INSERT INTO species VALUES
               (0, 'amerob', 'American Robin', 'Turdus migratorius', 'turdus migratorius', 'american robin', 1),
               (1, 'blujay', 'Blue Jay', 'Cyanocitta cristata', 'cyanocitta cristata', 'blue jay', 2),
               (2, 'norcar', 'Northern Cardinal', 'Cardinalis cardinalis', 'cardinalis cardinalis', 'northern cardinal', 3);
             CREATE TABLE loc_meta (loc_ref INTEGER PRIMARY KEY, location_id TEXT, name TEXT, lat REAL, lng REAL,
               country_code TEXT, subnational1_code TEXT, subnational2_code TEXT, region_code TEXT, samples INTEGER);
             INSERT INTO loc_meta VALUES
               (0, 'L1', 'Park', 10.5, 170.0, 'US', 'US-CA', NULL, 'US-CA-001', 50),
               (1, 'L2', NULL, 11.0, -170.0, 'US', 'US-NY', NULL, 'US-NY', 40),
               (2, 'L3', 'Marsh', 12.0, 20.0, 'CA', 'CA-ON', NULL, 'CA-ON', 1),
               (3, 'L4', 'Pond', 13.0, 21.0, 'US', 'US-CA', NULL, 'US-CAX', 60);
             CREATE TABLE loc_species (species_id INTEGER, loc_ref INTEGER, bucket_level INTEGER);
             INSERT INTO loc_species VALUES (0, 0, 2), (0, 1, 0), (1, 0, 1), (1, 3, 0), (2, 0, 0), (2, 1, 2), (2, 2, 2), (2, 3, 2);
             CREATE TABLE loc_qcount (bucket INTEGER, loc_ref INTEGER, q_count INTEGER);
             INSERT INTO loc_qcount VALUES (0, 0, 3), (0, 1, 2), (0, 2, 1), (0, 3, 2), (1, 0, 2), (1, 1, 1), (1, 2, 1), (1, 3, 1);
             CREATE TABLE loc_month_samples (loc_ref INTEGER PRIMARY KEY, m1 INTEGER, m2 INTEGER, m3 INTEGER, m4 INTEGER, m5 INTEGER, m6 INTEGER, m7 INTEGER, m8 INTEGER, m9 INTEGER, m10 INTEGER, m11 INTEGER, m12 INTEGER);
             INSERT INTO loc_month_samples VALUES
               (0, 10, 40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
               (1, 20, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
               (3, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0);
             CREATE TABLE loc_month_species (loc_ref INTEGER, species_id INTEGER, m1 INTEGER, m2 INTEGER, m3 INTEGER, m4 INTEGER, m5 INTEGER, m6 INTEGER, m7 INTEGER, m8 INTEGER, m9 INTEGER, m10 INTEGER, m11 INTEGER, m12 INTEGER);
             INSERT INTO loc_month_species VALUES
               (0, 0, 100, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
               (0, 1, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
               (0, 2, 0, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
               (1, 1, 30, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
               (3, 2, 0, 0, 80, 0, 0, 0, 0, 0, 0, 0, 0, 0);
             CREATE TABLE zone_meta (res INTEGER, cell_ref INTEGER, h3 INTEGER, lat REAL, lng REAL, samples INTEGER);
             INSERT INTO zone_meta VALUES (3, 0, 590000000000000000, 10.0, 170.0, 90), (3, 1, 590000000000000001, 12.0, 20.0, 1);
             CREATE TABLE zone_species (res INTEGER, species_id INTEGER, cell_ref INTEGER, bucket_level INTEGER);
             INSERT INTO zone_species VALUES (3, 0, 0, 0), (3, 1, 0, 0), (3, 2, 0, 0), (3, 2, 1, 0);
             CREATE TABLE zone_qcount (res INTEGER, bucket INTEGER, cell_ref INTEGER, q_count INTEGER);
             INSERT INTO zone_qcount VALUES (3, 0, 0, 3), (3, 0, 1, 1);",
        )
        .unwrap();
        (dir, path)
    }

    fn input(code: &str) -> SpeciesInput {
        SpeciesInput {
            sci_name: None,
            common_name: None,
            code: Some(code.into()),
            from_string: false,
        }
    }

    #[test]
    fn bucket_for_frequency_snaps_down() {
        let (_dir, path) = fixture();
        let index = load_index(&path, 4.0).unwrap();
        assert_eq!(index.bucket_for_frequency(0.0), 0);
        assert_eq!(index.bucket_for_frequency(0.1), 1);
        assert_eq!(index.bucket_for_frequency(0.15), 1);
        assert_eq!(index.bucket_for_frequency(0.2 - 1e-10), 2);
        assert_eq!(index.bucket_for_frequency(5.0), 2);
    }

    #[test]
    fn resolve_species_matches_code_sci_common_and_binomial() {
        let (_dir, path) = fixture();
        let index = load_index(&path, 4.0).unwrap();
        let inputs = vec![
            input(" AMEROB "),
            SpeciesInput {
                sci_name: Some("Cyanocitta cristata bromia".into()),
                common_name: None,
                code: None,
                from_string: true,
            },
            SpeciesInput {
                sci_name: None,
                common_name: Some("Northern Cardinal".into()),
                code: None,
                from_string: false,
            },
            input("amerob"),
            SpeciesInput {
                sci_name: Some("Unknown bird".into()),
                common_name: Some("Mystery".into()),
                code: None,
                from_string: false,
            },
            input(""),
        ];
        let resolved = index.resolve_species(&inputs);
        assert_eq!(resolved.ids, vec![0, 1, 2]);
        assert_eq!(resolved.matched(), 3);
        assert_eq!(resolved.unmatched, vec!["Unknown bird".to_string()]);
    }

    #[test]
    fn hotspots_rank_by_lifers_with_filters() {
        let (_dir, path) = fixture();
        let index = load_index(&path, 4.0).unwrap();
        let seen = index.resolve_species(&[input("amerob")]);
        let query = HotspotQuery {
            seen: &seen,
            bucket: 0,
            min_checklists: 0.0,
            region_codes: None,
            bbox: None,
            limit: 10,
        };
        let (items, candidates) = index.query_hotspots(&query);
        assert_eq!(candidates, 3);
        let summary: Vec<(&str, i32, i32)> = items
            .iter()
            .map(|i| (i.id, i.lifers, i.total_species))
            .collect();
        assert_eq!(summary, vec![("L4", 2, 2), ("L1", 2, 3), ("L2", 1, 2)]);
        assert_eq!(items[2].name, "L2");

        let codes = vec!["US-CA".to_string()];
        let query = HotspotQuery {
            seen: &seen,
            bucket: 1,
            min_checklists: 0.0,
            region_codes: Some(&codes),
            bbox: None,
            limit: 10,
        };
        let (items, candidates) = index.query_hotspots(&query);
        assert_eq!(candidates, 1);
        assert_eq!(
            items.iter().map(|i| (i.id, i.lifers)).collect::<Vec<_>>(),
            vec![("L1", 1)]
        );

        let bbox = BoundingBox {
            min_lng: 160.0,
            min_lat: 0.0,
            max_lng: -160.0,
            max_lat: 20.0,
        };
        let query = HotspotQuery {
            seen: &seen,
            bucket: 0,
            min_checklists: 45.0,
            region_codes: None,
            bbox: Some(bbox),
            limit: 1,
        };
        let (items, candidates) = index.query_hotspots(&query);
        assert_eq!(candidates, 2);
        assert_eq!(items.iter().map(|i| i.id).collect::<Vec<_>>(), vec!["L1"]);
    }

    #[test]
    fn month_hotspots_average_weighted_by_checklists() {
        let (_dir, path) = fixture();
        let index = load_index(&path, 4.0).unwrap();
        let settings = index.months.unwrap();
        let seen = index.resolve_species(&[input("amerob")]);
        let regions = vec!["US".to_string()];
        let query =
            |months: &'static [u8], frequency: f64, min_checklists: f64| MonthHotspotQuery {
                seen: &seen,
                months,
                frequency,
                min_checklists,
                region_codes: &regions,
                limit: 10,
            };
        let summarize = |query: MonthHotspotQuery<'_>| {
            let (items, candidates) = index.query_month_hotspots(settings, &query).unwrap();
            let summary: Vec<(String, i32, i32, i32)> = items
                .iter()
                .map(|i| (i.id.to_string(), i.lifers, i.total_species, i.checklists))
                .collect();
            (summary, candidates)
        };

        let (items, candidates) = summarize(query(&[1, 2], 0.2, 1.0));
        assert_eq!(candidates, 2);
        assert_eq!(
            items,
            vec![("L1".to_string(), 1, 2, 50), ("L2".to_string(), 1, 1, 40)]
        );

        let (items, _) = summarize(query(&[1, 2], 0.1, 1.0));
        assert_eq!(items[0], ("L1".to_string(), 2, 3, 50));

        let (items, candidates) = summarize(query(&[1], 0.2, 15.0));
        assert_eq!(candidates, 2);
        assert_eq!(items, vec![("L2".to_string(), 1, 1, 20)]);

        let (items, candidates) = summarize(query(&[3], 0.05, 1.0));
        assert_eq!(candidates, 1);
        assert_eq!(items, vec![("L4".to_string(), 1, 1, 60)]);
    }

    #[test]
    fn heap_keeps_first_seen_on_ties() {
        let mut heap = MinHeap::new(2);
        for (r, v) in [(0, 5), (1, 5), (2, 5), (3, 6)] {
            heap.offer(r, v);
        }
        let mut entries = heap.into_entries();
        entries.sort_by_key(|entry| std::cmp::Reverse(entry.1));
        assert_eq!(entries, vec![(3, 6), (1, 5)]);
    }

    #[tokio::test]
    async fn zones_grid_quantiles_and_cells() {
        let (_dir, path) = fixture();
        let index = std::sync::Arc::new(load_index(&path, 4.0).unwrap());
        let zones = index.ensure_zones().await.unwrap();
        assert_eq!(index.resolutions(), vec![3]);
        let seen = index.resolve_species(&[input("norcar")]);
        let bbox = BoundingBox {
            min_lng: -180.0,
            min_lat: -90.0,
            max_lng: 180.0,
            max_lat: 90.0,
        };
        let (cells, max_lifers) = index.grid_cells(&zones, &seen, 3, &bbox);
        assert_eq!(
            cells,
            vec![
                (format!("{:x}", 590000000000000000u64), 2),
                (format!("{:x}", 590000000000000001u64), 0)
            ]
        );
        assert_eq!(max_lifers, 2);
        assert_eq!(
            index.grid_quantiles(&zones, &seen, 4),
            vec![(3, vec![2, 2, 2, 2])]
        );

        let h3 = format!("{:x}", 590000000000000000u64);
        let (cells, summary) =
            index.cells_info(&zones, &seen, 3, &[h3.clone(), "8f0000000000000".into()]);
        assert_eq!(cells[0].total_species, 3);
        assert_eq!(cells[0].lifers, 2);
        assert_eq!(cells[1].samples, 0);
        assert_eq!(
            (summary.samples, summary.total_species, summary.lifers),
            (90, 3, 2)
        );
    }
}
