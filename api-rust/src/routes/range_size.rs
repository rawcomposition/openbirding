use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::time::Instant;

use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router, middleware};
use rusqlite::{Connection, OptionalExtension};
use serde_json::{Map, Value, json};

use super::best_hotspots::{SpeciesSource, region_name_for, region_names};
use super::targets::finish_response;
use crate::error::{AppError, AppResult};
use crate::http::{field, parse_json_body, require_targets_db};
use crate::js::{
    f64_to_json, is_integer, is_nullish, js_trim, sql_to_f64, sql_to_json, sql_to_string, to_number,
};
use crate::state::SharedState;

const WORLD: &str = "world";
const WORLD_NAME: &str = "World";
const JSON_BODY_MESSAGE: &str = "Request body must be JSON";
const LIMIT_DEFAULT: usize = 100;
const LIMIT_MAX: usize = 1000;

pub fn routes(state: SharedState) -> Router<SharedState> {
    Router::new()
        .route("/api/v1/range-size/regions", get(regions))
        .route("/api/v1/range-size/species", post(species))
        .layer(middleware::from_fn_with_state(state, require_targets_db))
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum RangeSort {
    Region,
    World,
    Name,
}

impl RangeSort {
    fn parse(value: Option<&Value>) -> AppResult<Self> {
        match value.and_then(Value::as_str) {
            None if is_nullish(value) => Ok(Self::Region),
            Some("region") => Ok(Self::Region),
            Some("world") => Ok(Self::World),
            Some("name") => Ok(Self::Name),
            _ => Err(AppError::bad_request(
                "sort must be \"region\", \"world\" or \"name\"",
            )),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Region => "region",
            Self::World => "world",
            Self::Name => "name",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum SortDirection {
    Asc,
    Desc,
}

impl SortDirection {
    fn parse(value: Option<&Value>) -> AppResult<Self> {
        match value.and_then(Value::as_str) {
            None if is_nullish(value) => Ok(Self::Asc),
            Some("asc") => Ok(Self::Asc),
            Some("desc") => Ok(Self::Desc),
            _ => Err(AppError::bad_request(
                "direction must be \"asc\" or \"desc\"",
            )),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Asc => "asc",
            Self::Desc => "desc",
        }
    }
}

fn parse_range_region(value: Option<&Value>) -> AppResult<String> {
    let raw = value
        .and_then(Value::as_str)
        .map(js_trim)
        .unwrap_or_default();
    if raw.eq_ignore_ascii_case(WORLD) {
        return Ok(WORLD.into());
    }
    if raw.len() == 2 && raw.chars().all(|c| c.is_ascii_alphabetic()) {
        return Ok(raw.to_ascii_uppercase());
    }
    Err(AppError::bad_request(
        "region must be \"world\" or a two-letter country code like US",
    ))
}

fn parse_offset(value: Option<&Value>) -> AppResult<usize> {
    if is_nullish(value) {
        return Ok(0);
    }
    let n = to_number(value);
    if !is_integer(n) || n < 0.0 {
        return Err(AppError::bad_request(
            "offset must be a non-negative integer",
        ));
    }
    Ok(n as usize)
}

fn parse_limit(value: Option<&Value>) -> AppResult<usize> {
    if is_nullish(value) {
        return Ok(LIMIT_DEFAULT);
    }
    let n = to_number(value);
    if !is_integer(n) || n < 1.0 || n > LIMIT_MAX as f64 {
        return Err(AppError::bad_request(format!(
            "limit must be an integer between 1 and {LIMIT_MAX}"
        )));
    }
    Ok(n as usize)
}

struct RangeSettings {
    res: i64,
    min_obs: i64,
    min_samples: i64,
}

impl RangeSettings {
    fn read(conn: &Connection) -> rusqlite::Result<Self> {
        conn.query_row(
            "SELECT res, min_obs, min_samples FROM species_ranges_metadata",
            [],
            |row| {
                Ok(Self {
                    res: row.get(0)?,
                    min_obs: row.get(1)?,
                    min_samples: row.get(2)?,
                })
            },
        )
    }
}

struct RangeRow {
    species_id: i64,
    code: String,
    name: Value,
    sci_name: Value,
    taxon_order: f64,
    region_cells: i64,
    region_obs: i64,
    world_cells: i64,
    world_obs: i64,
}

impl RangeRow {
    fn region_key(&self) -> (i64, i64) {
        (self.region_cells, self.region_obs)
    }

    fn world_key(&self) -> (i64, i64) {
        (self.world_cells, self.world_obs)
    }
}

fn compare_taxon_order(a: &RangeRow, b: &RangeRow) -> Ordering {
    a.taxon_order
        .partial_cmp(&b.taxon_order)
        .unwrap_or(Ordering::Equal)
}

fn compare_rows(a: &RangeRow, b: &RangeRow, sort: RangeSort) -> Ordering {
    let by_cells = match sort {
        RangeSort::Region => (a.region_key(), a.world_key()).cmp(&(b.region_key(), b.world_key())),
        RangeSort::World => (a.world_key(), a.region_key()).cmp(&(b.world_key(), b.region_key())),
        RangeSort::Name => a
            .name
            .as_str()
            .unwrap_or_default()
            .cmp(b.name.as_str().unwrap_or_default()),
    };
    by_cells.then_with(|| compare_taxon_order(a, b))
}

fn rank_rows(rows: &mut [RangeRow], sort: RangeSort, direction: SortDirection) {
    rows.sort_by(|a, b| match direction {
        SortDirection::Asc => compare_rows(a, b, sort),
        SortDirection::Desc => compare_rows(b, a, sort),
    });
}

fn surveyed_cells(conn: &Connection, region_code: &str) -> rusqlite::Result<Option<i64>> {
    conn.query_row(
        "SELECT surveyed_cells FROM region_surveyed_cells WHERE region_code = ?",
        [region_code],
        |row| row.get(0),
    )
    .optional()
}

fn region_rows(conn: &Connection, region_code: &str) -> rusqlite::Result<Vec<RangeRow>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.code, s.name, s.sci_name, s.taxon_order,
                r.occupied_cells, r.obs, w.occupied_cells, w.obs
         FROM species_ranges r
         JOIN species s ON s.id = r.species_id
         LEFT JOIN species_ranges w ON w.region_code = ? AND w.species_id = r.species_id
         WHERE r.region_code = ?",
    )?;
    stmt.query_map([WORLD, region_code], |row| {
        let region_cells: i64 = row.get(5)?;
        let region_obs: i64 = row.get(6)?;
        Ok(RangeRow {
            species_id: row.get(0)?,
            code: sql_to_string(row.get_ref(1)?),
            name: sql_to_json(row.get_ref(2)?),
            sci_name: sql_to_json(row.get_ref(3)?),
            taxon_order: sql_to_f64(row.get_ref(4)?),
            region_cells,
            region_obs,
            world_cells: row.get::<_, Option<i64>>(7)?.unwrap_or(region_cells),
            world_obs: row.get::<_, Option<i64>>(8)?.unwrap_or(region_obs),
        })
    })?
    .collect()
}

fn ranges_unavailable() -> AppError {
    AppError::new(
        StatusCode::SERVICE_UNAVAILABLE,
        "Range data is not available for this dataset",
    )
}

fn pct(cells: i64, surveyed: i64) -> Value {
    if surveyed <= 0 {
        return Value::Null;
    }
    f64_to_json(cells as f64 / surveyed as f64 * 100.0)
}

async fn regions(State(state): State<SharedState>) -> AppResult<Json<Value>> {
    let start = Instant::now();
    let targets = state.targets.require()?;
    if !targets.has_species_ranges {
        return Err(ranges_unavailable());
    }
    let counts: Vec<(String, i64)> = targets
        .run(|conn, _| {
            let mut stmt =
                conn.prepare("SELECT region_code, surveyed_cells FROM region_surveyed_cells")?;
            let rows = stmt
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(rows)
        })
        .await?;
    let names = region_names(&state).await;
    let mut regions: Vec<(bool, String, String, i64)> = counts
        .into_iter()
        .map(|(code, surveyed)| {
            let name = display_name(&code, &names);
            (code != WORLD, name, code, surveyed)
        })
        .collect();
    regions.sort();
    let regions: Vec<Value> = regions
        .into_iter()
        .map(|(_, name, code, surveyed)| {
            json!({ "code": code, "name": name, "surveyedCells": surveyed })
        })
        .collect();
    let mut response = Map::new();
    response.insert("regions".into(), Value::Array(regions));
    Ok(finish_response(response, &targets, start))
}

fn display_name(code: &str, names: &HashMap<String, String>) -> String {
    if code == WORLD {
        return WORLD_NAME.into();
    }
    match region_name_for(code, names) {
        Value::String(name) => name,
        _ => code.to_string(),
    }
}

async fn species(State(state): State<SharedState>, body: Bytes) -> AppResult<Json<Value>> {
    let start = Instant::now();
    let body = parse_json_body(&body, JSON_BODY_MESSAGE)?;
    let region = parse_range_region(field(&body, "region"))?;
    let sort = RangeSort::parse(field(&body, "sort"))?;
    let direction = SortDirection::parse(field(&body, "direction"))?;
    let offset = parse_offset(field(&body, "offset"))?;
    let limit = parse_limit(field(&body, "limit"))?;

    let seen = if is_nullish(field(&body, "listToken")) {
        None
    } else {
        let source = SpeciesSource::from_body(&state, &body).await?;
        let index = state.occurrences.get().await?;
        Some(source.resolve(&state, &index).await?)
    };

    let targets = state.targets.require()?;
    if !targets.has_species_ranges {
        return Err(ranges_unavailable());
    }
    let lookup = region.clone();
    let seen_ids: Option<HashSet<i64>> = seen
        .as_ref()
        .map(|seen| seen.lookup.iter().map(|&id| i64::from(id)).collect());
    let (settings, region_surveyed, world_surveyed, total, rows) = targets
        .run(move |conn, _| {
            let settings = RangeSettings::read(conn)?;
            let region_surveyed = surveyed_cells(conn, &lookup)?
                .ok_or_else(|| AppError::not_found("No range data for this region"))?;
            let world_surveyed = surveyed_cells(conn, WORLD)?.unwrap_or(region_surveyed);
            let mut rows = region_rows(conn, &lookup)?;
            if let Some(seen_ids) = &seen_ids {
                rows.retain(|row| seen_ids.contains(&row.species_id));
            }
            rank_rows(&mut rows, sort, direction);
            let total = rows.len();
            let page: Vec<RangeRow> = rows.into_iter().skip(offset).take(limit).collect();
            Ok((settings, region_surveyed, world_surveyed, total, page))
        })
        .await?;

    let items: Vec<Value> = rows
        .into_iter()
        .enumerate()
        .map(|(i, row)| {
            json!({
                "rank": offset + i + 1,
                "code": row.code,
                "name": row.name,
                "sciName": row.sci_name,
                "regionPct": pct(row.region_cells, region_surveyed),
                "worldPct": pct(row.world_cells, world_surveyed),
                "regionObs": row.region_obs,
                "worldObs": row.world_obs,
                "photo": state.avicommons.photo(&row.code),
            })
        })
        .collect();

    let names = region_names(&state).await;
    let mut response = Map::new();
    response.insert("items".into(), Value::Array(items));
    response.insert(
        "meta".into(),
        json!({
            "region": region,
            "regionName": display_name(&region, &names),
            "sort": sort.as_str(),
            "direction": direction.as_str(),
            "total": total,
            "offset": offset,
            "limit": limit,
            "seenMatched": seen.as_ref().map(|seen| seen.matched()),
            "resolution": settings.res,
            "minObs": settings.min_obs,
            "minChecklists": settings.min_samples,
        }),
    );
    Ok(finish_response(response, &targets, start))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(species_id: i64, taxon_order: f64, region_cells: i64, world_cells: i64) -> RangeRow {
        RangeRow {
            species_id,
            code: species_id.to_string(),
            name: Value::Null,
            sci_name: Value::Null,
            taxon_order,
            region_cells,
            region_obs: 1,
            world_cells,
            world_obs: 1,
        }
    }

    fn ids(rows: &[RangeRow]) -> Vec<i64> {
        rows.iter().map(|row| row.species_id).collect()
    }

    #[test]
    fn ranks_by_region_then_world_then_taxon_order() {
        let mut rows = vec![
            row(1, 3.0, 2, 50),
            row(2, 2.0, 1, 900),
            row(3, 1.0, 1, 10),
            row(4, 0.5, 1, 10),
        ];
        rank_rows(&mut rows, RangeSort::Region, SortDirection::Asc);
        assert_eq!(ids(&rows), vec![4, 3, 2, 1]);
        rank_rows(&mut rows, RangeSort::World, SortDirection::Asc);
        assert_eq!(ids(&rows), vec![4, 3, 1, 2]);
        rank_rows(&mut rows, RangeSort::World, SortDirection::Desc);
        assert_eq!(ids(&rows), vec![2, 1, 3, 4]);
    }

    #[test]
    fn breaks_cell_ties_by_obs() {
        let mut rows = vec![row(1, 1.0, 1, 1), row(2, 2.0, 1, 1), row(3, 3.0, 1, 1)];
        rows[0].region_obs = 200;
        rows[1].region_obs = 3;
        rows[2].region_obs = 3;
        rows[2].world_obs = 50;
        rank_rows(&mut rows, RangeSort::Region, SortDirection::Asc);
        assert_eq!(ids(&rows), vec![2, 3, 1]);
    }

    #[test]
    fn ranks_by_name_with_null_names_first() {
        let mut rows = vec![row(1, 1.0, 1, 1), row(2, 2.0, 1, 1)];
        rows[0].name = json!("Wren");
        rows[1].name = json!("Finch");
        rank_rows(&mut rows, RangeSort::Name, SortDirection::Asc);
        assert_eq!(ids(&rows), vec![2, 1]);
    }

    #[test]
    fn region_parsing() {
        assert_eq!(
            parse_range_region(Some(&json!(" World "))).unwrap(),
            "world"
        );
        assert_eq!(parse_range_region(Some(&json!("us"))).unwrap(), "US");
        assert!(parse_range_region(Some(&json!("US-CA"))).is_err());
        assert!(parse_range_region(Some(&json!("U1"))).is_err());
        assert!(parse_range_region(None).is_err());
    }

    #[test]
    fn sort_and_offset_parsing() {
        assert_eq!(RangeSort::parse(None).unwrap(), RangeSort::Region);
        assert_eq!(
            RangeSort::parse(Some(&json!("world"))).unwrap(),
            RangeSort::World
        );
        assert!(RangeSort::parse(Some(&json!("area"))).is_err());
        assert_eq!(SortDirection::parse(None).unwrap(), SortDirection::Asc);
        assert_eq!(
            SortDirection::parse(Some(&json!("desc"))).unwrap(),
            SortDirection::Desc
        );
        assert!(SortDirection::parse(Some(&json!("up"))).is_err());
        assert_eq!(parse_offset(None).unwrap(), 0);
        assert_eq!(parse_offset(Some(&json!(200))).unwrap(), 200);
        assert!(parse_offset(Some(&json!(-1))).is_err());
        assert!(parse_offset(Some(&json!(1.5))).is_err());
        assert_eq!(parse_limit(None).unwrap(), 100);
        assert_eq!(parse_limit(Some(&json!(1000))).unwrap(), 1000);
        assert!(parse_limit(Some(&json!(1001))).is_err());
        assert!(parse_limit(Some(&json!(0))).is_err());
    }

    #[test]
    fn pct_guards_zero_surveyed() {
        assert_eq!(pct(1, 0), Value::Null);
        assert_eq!(pct(1, 4), json!(25));
    }
}
