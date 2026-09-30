use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde_json::Value;

use crate::js::{sql_to_f64, sql_to_json, sql_to_opt_string, sql_to_string};

use super::scratch::ScratchPool;
use super::{Csr, OccurrencesIndex, Species, ZoneDataset, Zones};

static NEXT_GENERATION: AtomicU64 = AtomicU64::new(1);

pub type LoadResult<T> = Result<T, String>;

fn open(path: &Path) -> LoadResult<Connection> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|err| err.to_string())?;
    conn.execute_batch("PRAGMA cache_size = -500000;")
        .map_err(|err| err.to_string())?;
    Ok(conn)
}

fn sql_err(err: rusqlite::Error) -> String {
    err.to_string()
}

struct BlobReader<'a> {
    conn: &'a Connection,
}

impl<'a> BlobReader<'a> {
    fn detect(conn: &'a Connection) -> LoadResult<Option<Self>> {
        let has = conn
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'blob_cache'",
                [],
                |_| Ok(()),
            )
            .optional()
            .map_err(sql_err)?;
        Ok(has.map(|()| Self { conn }))
    }

    fn bytes(&self, key: &str) -> LoadResult<Vec<u8>> {
        self.conn
            .query_row("SELECT data FROM blob_cache WHERE key = ?", [key], |row| {
                row.get::<_, Vec<u8>>(0)
            })
            .optional()
            .map_err(sql_err)?
            .ok_or_else(|| format!("blob_cache missing key {key}"))
    }

    fn array<T, const N: usize>(&self, key: &str, decode: fn([u8; N]) -> T) -> LoadResult<Vec<T>> {
        let bytes = self.bytes(key)?;
        if bytes.len() % N != 0 {
            return Err(format!(
                "blob_cache key {key} has {} bytes, not a multiple of {N}",
                bytes.len()
            ));
        }
        Ok(bytes
            .as_chunks::<N>()
            .0
            .iter()
            .map(|chunk| decode(*chunk))
            .collect())
    }

    fn i32s(&self, key: &str) -> LoadResult<Vec<i32>> {
        self.array(key, i32::from_le_bytes)
    }

    fn f32s(&self, key: &str) -> LoadResult<Vec<f32>> {
        self.array(key, f32::from_le_bytes)
    }

    fn i64s(&self, key: &str) -> LoadResult<Vec<i64>> {
        self.array(key, i64::from_le_bytes)
    }
}

fn count(conn: &Connection, sql: &str, params: impl rusqlite::Params) -> LoadResult<i64> {
    conn.query_row(sql, params, |row| {
        row.get_ref(0).map(|v| sql_to_f64(v) as i64)
    })
    .map_err(sql_err)
}

fn build_csr(
    conn: &Connection,
    max_species_id: i64,
    total_rows: usize,
    sql: &str,
    params: &[&dyn rusqlite::ToSql],
) -> LoadResult<Csr> {
    let mut offsets = vec![0i32; (max_species_id.max(-1) + 2) as usize];
    let mut stmt = conn.prepare(sql).map_err(sql_err)?;
    let mut rows = stmt.query(params).map_err(sql_err)?;
    let mut entries: Vec<(i64, i32, u8)> = Vec::with_capacity(total_rows);
    while let Some(row) = rows.next().map_err(sql_err)? {
        let species_id: i64 = row.get(0).map_err(sql_err)?;
        let reference: i64 = row.get(1).map_err(sql_err)?;
        let level: i64 = row.get(2).map_err(sql_err)?;
        offsets[(species_id + 1) as usize] += 1;
        entries.push((species_id, reference as i32, level as u8));
    }
    for i in 1..offsets.len() {
        offsets[i] += offsets[i - 1];
    }
    let mut cursor = offsets.clone();
    let mut refs = vec![0i32; entries.len()];
    let mut levels = vec![0u8; entries.len()];
    for (species_id, reference, level) in entries {
        let position = cursor[species_id as usize] as usize;
        cursor[species_id as usize] += 1;
        refs[position] = reference;
        levels[position] = level;
    }
    Ok(Csr {
        offsets,
        refs,
        levels,
    })
}

fn split_buckets(flat: Vec<i32>, bucket_count: usize, size: usize) -> LoadResult<Vec<i32>> {
    if flat.len() < bucket_count * size {
        return Err(format!(
            "qcount has {} entries, expected {}",
            flat.len(),
            bucket_count * size
        ));
    }
    Ok(flat)
}

struct Metadata {
    buckets: Vec<f64>,
    buckets_json: Value,
    min_checklists_floor: Value,
    version_month: String,
    version_year: String,
    taxonomy_version: Value,
    generated_at: String,
}

fn read_metadata(conn: &Connection) -> LoadResult<Metadata> {
    let meta: serde_json::Map<String, Value> = conn
        .query_row("SELECT * FROM metadata", [], |row| {
            let mut object = serde_json::Map::new();
            for (i, name) in row.as_ref().column_names().iter().enumerate() {
                object.insert((*name).to_string(), sql_to_json(row.get_ref(i)?));
            }
            Ok(object)
        })
        .map_err(sql_err)?;
    let text = |key: &str| meta.get(key).map(value_text).unwrap_or_default();
    let buckets_json: Value =
        serde_json::from_str(&text("buckets")).map_err(|err| format!("metadata.buckets: {err}"))?;
    let buckets = buckets_json
        .as_array()
        .ok_or("metadata.buckets is not an array")?
        .iter()
        .map(|b| crate::js::to_number(Some(b)))
        .collect();
    Ok(Metadata {
        buckets,
        buckets_json,
        min_checklists_floor: meta.get("min_checklists").cloned().unwrap_or(Value::Null),
        version_month: text("version_month"),
        version_year: text("version_year"),
        taxonomy_version: meta.get("taxonomy_version").cloned().unwrap_or(Value::Null),
        generated_at: text("generated_at"),
    })
}

fn value_text(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        other => crate::js::to_js_string(other),
    }
}

pub fn read_generated_at(path: &Path) -> LoadResult<Option<String>> {
    let conn =
        Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(sql_err)?;
    conn.query_row("SELECT generated_at FROM metadata", [], |row| {
        row.get_ref(0).map(sql_to_opt_string)
    })
    .map_err(sql_err)
}

struct LocationStrings {
    ids: Vec<Box<str>>,
    names: Vec<Box<str>>,
    region_ids: Vec<u32>,
    region_table: Vec<Box<str>>,
}

impl LocationStrings {
    fn new(n: usize) -> Self {
        Self {
            ids: vec![Box::from(""); n],
            names: vec![Box::from(""); n],
            region_ids: vec![0; n],
            region_table: Vec::new(),
        }
    }

    fn set(
        &mut self,
        interned: &mut HashMap<String, u32>,
        reference: usize,
        id: String,
        name: Option<String>,
        region: Option<String>,
    ) {
        let region = region.unwrap_or_default();
        let next_id = interned.len() as u32;
        let region_id = *interned.entry(region.clone()).or_insert_with(|| {
            self.region_table.push(region.into_boxed_str());
            next_id
        });
        self.names[reference] = name.unwrap_or_else(|| id.clone()).into_boxed_str();
        self.ids[reference] = id.into_boxed_str();
        self.region_ids[reference] = region_id;
    }
}

pub fn load_index(path: &Path, max_zone_res: f64) -> LoadResult<OccurrencesIndex> {
    let conn = open(path)?;
    let meta = read_metadata(&conn)?;
    let num_locs = count(&conn, "SELECT COUNT(*) c FROM loc_meta", [])? as usize;
    let n = num_locs;
    let bucket_count = meta.buckets.len();
    let mut strings = LocationStrings::new(n);
    let mut interned: HashMap<String, u32> = HashMap::new();

    let (samples, lat, lng, q_count, csr) = if let Some(blobs) = BlobReader::detect(&conn)? {
        let samples = blobs.i32s("loc:samples")?;
        let lat = blobs.f32s("loc:lat")?;
        let lng = blobs.f32s("loc:lng")?;
        let q_count = split_buckets(blobs.i32s("loc:qcount")?, bucket_count, n)?;
        let csr = Csr {
            offsets: blobs.i32s("loc:spOff")?,
            refs: blobs.i32s("loc:csrRef")?,
            levels: blobs.bytes("loc:csrLvl")?,
        };
        let mut stmt = conn
            .prepare("SELECT loc_ref, location_id, name, region_code FROM loc_meta")
            .map_err(sql_err)?;
        let mut rows = stmt.query([]).map_err(sql_err)?;
        while let Some(row) = rows.next().map_err(sql_err)? {
            let reference: i64 = row.get(0).map_err(sql_err)?;
            if reference < 0 || reference as usize >= n {
                continue;
            }
            strings.set(
                &mut interned,
                reference as usize,
                sql_to_string(row.get_ref(1).map_err(sql_err)?),
                sql_to_opt_string(row.get_ref(2).map_err(sql_err)?),
                sql_to_opt_string(row.get_ref(3).map_err(sql_err)?),
            );
        }
        if samples.len() < n || lat.len() < n || lng.len() < n {
            return Err("loc blobs are shorter than loc_meta".into());
        }
        (samples, lat, lng, q_count, csr)
    } else {
        let max_species_id = count(&conn, "SELECT MAX(species_id) m FROM loc_species", [])?;
        let total_rows = count(&conn, "SELECT COUNT(*) c FROM loc_species", [])? as usize;
        let mut samples = vec![0i32; n];
        let mut lat = vec![0f32; n];
        let mut lng = vec![0f32; n];
        let mut stmt = conn
            .prepare(
                "SELECT loc_ref, location_id, name, lat, lng, region_code, samples FROM loc_meta",
            )
            .map_err(sql_err)?;
        let mut rows = stmt.query([]).map_err(sql_err)?;
        while let Some(row) = rows.next().map_err(sql_err)? {
            let reference: i64 = row.get(0).map_err(sql_err)?;
            if reference < 0 || reference as usize >= n {
                continue;
            }
            let r = reference as usize;
            samples[r] = sql_to_f64(row.get_ref(6).map_err(sql_err)?) as i32;
            lat[r] = sql_to_f64(row.get_ref(3).map_err(sql_err)?) as f32;
            lng[r] = sql_to_f64(row.get_ref(4).map_err(sql_err)?) as f32;
            strings.set(
                &mut interned,
                r,
                sql_to_string(row.get_ref(1).map_err(sql_err)?),
                sql_to_opt_string(row.get_ref(2).map_err(sql_err)?),
                sql_to_opt_string(row.get_ref(5).map_err(sql_err)?),
            );
        }
        drop(rows);
        let mut q_count = vec![0i32; bucket_count * n];
        let mut stmt = conn
            .prepare("SELECT bucket, loc_ref, q_count FROM loc_qcount")
            .map_err(sql_err)?;
        let mut rows = stmt.query([]).map_err(sql_err)?;
        while let Some(row) = rows.next().map_err(sql_err)? {
            let bucket: i64 = row.get(0).map_err(sql_err)?;
            let reference: i64 = row.get(1).map_err(sql_err)?;
            let q: i64 = row.get(2).map_err(sql_err)?;
            if (0..bucket_count as i64).contains(&bucket) && (0..n as i64).contains(&reference) {
                q_count[bucket as usize * n + reference as usize] = q as i32;
            }
        }
        let csr = build_csr(
            &conn,
            max_species_id,
            total_rows,
            "SELECT species_id, loc_ref, bucket_level FROM loc_species",
            &[],
        )?;
        (samples, lat, lng, q_count, csr)
    };

    let mut species = Species::default();
    let mut stmt = conn
        .prepare("SELECT id, code, name, sci_name, sci_lower, name_lower, taxon_order FROM species")
        .map_err(sql_err)?;
    let mut rows = stmt.query([]).map_err(sql_err)?;
    while let Some(row) = rows.next().map_err(sql_err)? {
        let id: i64 = row.get(0).map_err(sql_err)?;
        let id = id as i32;
        species
            .by_sci
            .insert(sql_to_string(row.get_ref(4).map_err(sql_err)?).into(), id);
        species
            .by_name
            .insert(sql_to_string(row.get_ref(5).map_err(sql_err)?).into(), id);
        species.by_code.insert(
            sql_to_string(row.get_ref(1).map_err(sql_err)?)
                .to_lowercase()
                .into(),
            id,
        );
    }

    Ok(OccurrencesIndex {
        generation: NEXT_GENERATION.fetch_add(1, Ordering::Relaxed),
        buckets: meta.buckets,
        buckets_json: meta.buckets_json,
        min_checklists_floor_json: meta.min_checklists_floor.clone(),
        min_checklists_floor: crate::js::to_number(Some(&meta.min_checklists_floor)),
        version_month: meta.version_month,
        version_year: meta.version_year,
        taxonomy_version: meta.taxonomy_version,
        generated_at: meta.generated_at,
        num_locs,
        samples,
        lat,
        lng,
        loc_id: strings.ids,
        loc_name: strings.names,
        region_ids: strings.region_ids,
        region_table: strings.region_table,
        q_count,
        csr,
        species,
        db_path: path.to_path_buf(),
        max_zone_res,
        zones: tokio::sync::OnceCell::new(),
        scratch: ScratchPool::new(num_locs),
    })
}

pub fn load_zones(path: &Path, bucket_count: usize, max_zone_res: f64) -> LoadResult<Zones> {
    let conn = open(path)?;
    let mut stmt = conn
        .prepare("SELECT DISTINCT res FROM zone_meta ORDER BY res")
        .map_err(sql_err)?;
    let resolutions: Vec<i64> = stmt
        .query_map([], |row| row.get::<_, i64>(0))
        .map_err(sql_err)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(sql_err)?
        .into_iter()
        .filter(|&res| res as f64 <= max_zone_res)
        .collect();
    let blobs = BlobReader::detect(&conn)?;
    let mut by_res = BTreeMap::new();
    let mut loc_cell_ref = HashMap::new();

    for res in resolutions {
        let dataset = if let Some(blobs) = &blobs {
            let samples = blobs.i32s(&format!("zone:{res}:samples"))?;
            let size = samples.len();
            let lat = blobs.f32s(&format!("zone:{res}:lat"))?;
            let lng = blobs.f32s(&format!("zone:{res}:lng"))?;
            let h3 = blobs.i64s(&format!("zone:{res}:h3"))?;
            let q_count = split_buckets(
                blobs.i32s(&format!("zone:{res}:qcount"))?,
                bucket_count,
                size,
            )?;
            let csr = Csr {
                offsets: blobs.i32s(&format!("zone:{res}:spOff"))?,
                refs: blobs.i32s(&format!("zone:{res}:csrRef"))?,
                levels: blobs.bytes(&format!("zone:{res}:csrLvl"))?,
            };
            if lat.len() < size || lng.len() < size || h3.len() < size {
                return Err(format!(
                    "zone:{res} blobs are shorter than zone:{res}:samples"
                ));
            }
            let by_h3 = (0..size)
                .filter(|&r| h3[r] != 0)
                .map(|r| (h3[r] as u64, r as i32))
                .collect();
            if let Ok(cell_refs) = blobs.i32s(&format!("loc:cellRef:{res}")) {
                loc_cell_ref.insert(res, cell_refs);
            }
            ZoneDataset {
                res,
                num_refs: size,
                h3,
                samples,
                lat,
                lng,
                q_count,
                csr,
                by_h3,
                scratch: ScratchPool::new(size),
            }
        } else {
            let max_cell_ref = count(
                &conn,
                "SELECT MAX(cell_ref) m FROM zone_meta WHERE res = ?",
                [res],
            )?;
            let max_species_id = count(
                &conn,
                "SELECT MAX(species_id) m FROM zone_species WHERE res = ?",
                [res],
            )?;
            let total_rows = count(
                &conn,
                "SELECT COUNT(*) c FROM zone_species WHERE res = ?",
                [res],
            )? as usize;
            let size = (max_cell_ref + 1).max(0) as usize;
            let mut samples = vec![0i32; size];
            let mut lat = vec![0f32; size];
            let mut lng = vec![0f32; size];
            let mut h3 = vec![0i64; size];
            let mut by_h3 = HashMap::new();
            let mut stmt = conn
                .prepare("SELECT cell_ref, h3, lat, lng, samples FROM zone_meta WHERE res = ?")
                .map_err(sql_err)?;
            let mut rows = stmt.query([res]).map_err(sql_err)?;
            while let Some(row) = rows.next().map_err(sql_err)? {
                let r: i64 = row.get(0).map_err(sql_err)?;
                let r = r as usize;
                samples[r] = sql_to_f64(row.get_ref(4).map_err(sql_err)?) as i32;
                lat[r] = sql_to_f64(row.get_ref(2).map_err(sql_err)?) as f32;
                lng[r] = sql_to_f64(row.get_ref(3).map_err(sql_err)?) as f32;
                let cell: i64 = row.get::<_, Option<i64>>(1).map_err(sql_err)?.unwrap_or(0);
                h3[r] = cell;
                by_h3.insert(cell as u64, r as i32);
            }
            drop(rows);
            let mut q_count = vec![0i32; bucket_count * size];
            let mut stmt = conn
                .prepare("SELECT bucket, cell_ref, q_count FROM zone_qcount WHERE res = ?")
                .map_err(sql_err)?;
            let mut rows = stmt.query([res]).map_err(sql_err)?;
            while let Some(row) = rows.next().map_err(sql_err)? {
                let bucket: i64 = row.get(0).map_err(sql_err)?;
                let reference: i64 = row.get(1).map_err(sql_err)?;
                let q: i64 = row.get(2).map_err(sql_err)?;
                if (0..bucket_count as i64).contains(&bucket)
                    && (0..size as i64).contains(&reference)
                {
                    q_count[bucket as usize * size + reference as usize] = q as i32;
                }
            }
            let csr = build_csr(
                &conn,
                max_species_id,
                total_rows,
                "SELECT species_id, cell_ref, bucket_level FROM zone_species WHERE res = ?",
                &[&res],
            )?;
            ZoneDataset {
                res,
                num_refs: size,
                h3,
                samples,
                lat,
                lng,
                q_count,
                csr,
                by_h3,
                scratch: ScratchPool::new(size),
            }
        };
        by_res.insert(res, dataset);
    }

    Ok(Zones {
        by_res,
        loc_cell_ref,
    })
}
