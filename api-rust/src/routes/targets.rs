use std::collections::{HashMap, HashSet};
use std::time::Instant;

use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::routing::{any, get, post};
use axum::{Json, Router, middleware};
use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, OptionalExtension, params_from_iter};
use serde_json::{Map, Value, json};

use crate::db::targets::TargetsDb;
use crate::error::{AppError, AppResult};
use crate::http::{QueryParams, field, not_found, parse_json_body, require_targets_db};
use crate::js::{
    f64_to_json, js_round, js_trim, query_time, sql_to_f64, sql_to_json, sql_to_string,
    str_to_number,
};
use crate::state::SharedState;
use crate::validators::{
    is_location_id, parse_h3_cells, parse_location_ids_body, parse_months_body, parse_months_param,
    parse_region_codes,
};

const MONTHS: usize = 12;

pub fn routes(state: SharedState) -> Router<SharedState> {
    Router::new()
        .route("/api/v1/targets/region/{region_code}", get(region_targets))
        .route("/api/v1/targets/h3", post(h3_targets))
        .route("/api/v1/targets/locations", post(locations_targets))
        .route(
            "/api/v1/targets/location/{location_id}",
            get(location_targets),
        )
        .route("/api/v1/targets", any(not_found))
        .route("/api/v1/targets/{*rest}", any(not_found))
        .layer(middleware::from_fn_with_state(state, require_targets_db))
}

pub fn insert_ebd_meta(response: &mut Map<String, Value>, db: &TargetsDb) {
    response.insert("citation".into(), Value::String(db.citation()));
    response.insert(
        "taxonomyVersion".into(),
        db.metadata.taxonomy_version.clone(),
    );
}

pub fn finish_response(
    mut response: Map<String, Value>,
    db: &TargetsDb,
    start: Instant,
) -> Json<Value> {
    insert_ebd_meta(&mut response, db);
    response.insert("queryTime".into(), Value::String(query_time(start)));
    Json(Value::Object(response))
}

pub fn round_frequency(pct: f64) -> f64 {
    if pct >= 1.0 {
        js_round(pct)
    } else if pct >= 0.1 {
        js_round(pct * 10.0) / 10.0
    } else {
        js_round(pct * 100.0) / 100.0
    }
}

pub fn month_index(month: f64) -> Option<usize> {
    (month >= 1.0 && month <= MONTHS as f64 && month.fract() == 0.0).then(|| month as usize - 1)
}

pub fn placeholders(count: usize) -> String {
    vec!["?"; count].join(", ")
}

struct SpeciesMonthRow {
    code: String,
    name: Value,
    sci_name: Value,
    taxon_order: f64,
    month: f64,
    obs: Value,
}

fn read_species_month_rows(
    conn: &Connection,
    sql: &str,
    params: Vec<SqlValue>,
) -> AppResult<Vec<SpeciesMonthRow>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt
        .query_map(params_from_iter(params), |row| {
            Ok(SpeciesMonthRow {
                code: sql_to_string(row.get_ref(0)?),
                name: sql_to_json(row.get_ref(1)?),
                sci_name: sql_to_json(row.get_ref(2)?),
                taxon_order: sql_to_f64(row.get_ref(3)?),
                month: sql_to_f64(row.get_ref(4)?),
                obs: sql_to_json(row.get_ref(5)?),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn read_monthly_samples(
    conn: &Connection,
    sql: &str,
    params: Vec<SqlValue>,
) -> AppResult<Vec<Value>> {
    let mut samples = vec![Value::from(0); MONTHS];
    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query(params_from_iter(params))?;
    while let Some(row) = rows.next()? {
        if let Some(i) = month_index(sql_to_f64(row.get_ref(0)?)) {
            samples[i] = sql_to_json(row.get_ref(1)?);
        }
    }
    Ok(samples)
}

fn build_targets_items(
    rows: Vec<SpeciesMonthRow>,
    samples: &[Value],
    months: Option<&[f64]>,
) -> Vec<Value> {
    let in_filter = |month: f64| months.is_none_or(|m| m.contains(&month));
    let filtered_samples: f64 = samples
        .iter()
        .enumerate()
        .filter(|(i, _)| in_filter((i + 1) as f64))
        .map(|(_, count)| crate::js::to_number(Some(count)))
        .sum();

    struct Entry {
        code: String,
        name: Value,
        sci_name: Value,
        taxon_order: f64,
        obs: Vec<Value>,
        filtered_obs: f64,
    }
    let mut entries: Vec<Entry> = Vec::new();
    let mut by_code: HashMap<String, usize> = HashMap::new();
    for row in rows {
        let position = *by_code.entry(row.code.clone()).or_insert_with(|| {
            entries.push(Entry {
                code: row.code.clone(),
                name: row.name.clone(),
                sci_name: row.sci_name.clone(),
                taxon_order: row.taxon_order,
                obs: vec![Value::from(0); MONTHS],
                filtered_obs: 0.0,
            });
            entries.len() - 1
        });
        let entry = &mut entries[position];
        if let Some(i) = month_index(row.month) {
            entry.obs[i] = row.obs.clone();
        }
        if in_filter(row.month) {
            entry.filtered_obs += crate::js::to_number(Some(&row.obs));
        }
    }

    if filtered_samples == 0.0 {
        return Vec::new();
    }

    let mut ranked: Vec<(f64, Entry)> = entries
        .into_iter()
        .filter(|entry| entry.filtered_obs > 0.0)
        .map(|entry| {
            (
                round_frequency((entry.filtered_obs / filtered_samples) * 100.0),
                entry,
            )
        })
        .collect();
    ranked.sort_by(|(fa, a), (fb, b)| {
        fb.partial_cmp(fa)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                b.filtered_obs
                    .partial_cmp(&a.filtered_obs)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| {
                a.taxon_order
                    .partial_cmp(&b.taxon_order)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    });
    ranked
        .into_iter()
        .map(|(frequency, entry)| {
            json!({
                "code": entry.code,
                "name": entry.name,
                "sciName": entry.sci_name,
                "frequency": f64_to_json(frequency),
                "obs": entry.obs,
            })
        })
        .collect()
}

fn region_id_subquery(codes: &[String]) -> (String, Vec<SqlValue>) {
    let conditions = codes
        .iter()
        .map(|_| "(code = ? OR code LIKE ?)")
        .collect::<Vec<_>>()
        .join(" OR ");
    let params = codes
        .iter()
        .flat_map(|code| {
            [
                SqlValue::Text(code.clone()),
                SqlValue::Text(format!("{code}-%")),
            ]
        })
        .collect();
    (format!("SELECT id FROM regions WHERE {conditions}"), params)
}

async fn region_targets(
    State(state): State<SharedState>,
    Path(region_code): Path<String>,
    query: QueryParams,
) -> AppResult<Json<Value>> {
    let months = parse_months_param(query.get("months"))?;
    let targets = state.targets.require()?;
    let start = Instant::now();
    let region_codes = parse_region_codes(&region_code)?;
    let (subquery, params) = region_id_subquery(&region_codes);

    let species_sql = format!(
        "SELECT s.code, s.name, s.sci_name, s.taxon_order, rmo.month, SUM(rmo.obs) AS obs
         FROM region_month_obs rmo
         JOIN species s ON s.id = rmo.species_id
         WHERE rmo.region_id IN ({subquery})
         GROUP BY rmo.species_id, rmo.month"
    );
    let samples_sql = format!(
        "SELECT month, SUM(samples) AS samples
         FROM region_month_samples
         WHERE region_id IN ({subquery})
         GROUP BY month"
    );
    let species_params = params.clone();
    let (species_rows, samples) = tokio::try_join!(
        targets.run(move |conn, _| read_species_month_rows(conn, &species_sql, species_params)),
        targets.run(move |conn, _| read_monthly_samples(conn, &samples_sql, params)),
    )?;

    let items = build_targets_items(species_rows, &samples, months.as_deref());
    let mut response = Map::new();
    response.insert("items".into(), Value::Array(items));
    response.insert("samples".into(), Value::Array(samples));
    Ok(finish_response(response, &targets, start))
}

async fn h3_targets(State(state): State<SharedState>, body: Bytes) -> AppResult<Json<Value>> {
    let body = parse_json_body(&body, "Request body must be JSON")?;
    let cells = parse_h3_cells(field(&body, "cells"))?;
    let months = parse_months_body(field(&body, "months"))?;
    let targets = state.targets.require()?;
    let start = Instant::now();

    let refs: Vec<(i64, i64)> = targets
        .run(move |conn, _| {
            let sql = format!(
                "SELECT res, cell_ref FROM h3_cells WHERE h3 IN ({})",
                placeholders(cells.len())
            );
            let mut stmt = conn.prepare(&sql)?;
            let refs = stmt
                .query_map(params_from_iter(cells.iter()), |row| {
                    Ok((row.get(0)?, row.get(1)?))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(refs)
        })
        .await?;

    let mut response = Map::new();
    if refs.is_empty() {
        response.insert("items".into(), json!([]));
        response.insert("samples".into(), json!(vec![0; MONTHS]));
        response.insert("cellCount".into(), json!(0));
        return Ok(finish_response(response, &targets, start));
    }

    let ref_list = vec!["(?, ?)"; refs.len()].join(", ");
    let params: Vec<SqlValue> = refs
        .iter()
        .flat_map(|(res, cell_ref)| [SqlValue::Integer(*res), SqlValue::Integer(*cell_ref)])
        .collect();
    let species_sql = format!(
        "SELECT s.code, s.name, s.sci_name, s.taxon_order, o.month, SUM(o.obs) AS obs
         FROM h3_cell_obs o
         JOIN species s ON s.id = o.species_id
         WHERE (o.res, o.cell_ref) IN (VALUES {ref_list})
         GROUP BY o.species_id, o.month"
    );
    let samples_sql = format!(
        "SELECT month, SUM(samples) AS samples
         FROM h3_cell_samples
         WHERE (res, cell_ref) IN (VALUES {ref_list})
         GROUP BY month"
    );
    let species_params = params.clone();
    let (species_rows, samples) = tokio::try_join!(
        targets.run(move |conn, _| read_species_month_rows(conn, &species_sql, species_params)),
        targets.run(move |conn, _| read_monthly_samples(conn, &samples_sql, params)),
    )?;

    let items = build_targets_items(species_rows, &samples, months.as_deref());
    response.insert("items".into(), Value::Array(items));
    response.insert("samples".into(), Value::Array(samples));
    response.insert("cellCount".into(), json!(refs.len()));
    Ok(finish_response(response, &targets, start))
}

async fn location_targets(
    State(state): State<SharedState>,
    Path(location_id): Path<String>,
) -> AppResult<Json<Value>> {
    let location_id = js_trim(&location_id).to_uppercase();
    if !is_location_id(&location_id) {
        return Err(AppError::bad_request("locationId must look like L12345"));
    }
    let targets = state.targets.require()?;
    let start = Instant::now();

    let (items, samples) = targets
        .run(move |conn, _| {
            let exists = conn
                .query_row(r#"select "id" from "hotspots" where "id" = ?"#, [&location_id], |_| Ok(()))
                .optional()?;
            if exists.is_none() {
                return Err(AppError::not_found("Hotspot not found"));
            }
            let mut stmt = conn.prepare(
                r#"select "species"."code", "species"."name", "month_obs"."month", "month_obs"."obs", "month_obs"."samples"
                   from "month_obs" inner join "species" on "species"."id" = "month_obs"."species_id"
                   where "month_obs"."location_id" = ?"#,
            )?;
            let mut rows = stmt.query([&location_id])?;
            let mut samples = vec![Value::Null; MONTHS];
            let mut entries: Vec<(String, Value, Vec<Value>)> = Vec::new();
            let mut by_code: HashMap<String, usize> = HashMap::new();
            while let Some(row) = rows.next()? {
                let code = sql_to_string(row.get_ref(0)?);
                let month = month_index(sql_to_f64(row.get_ref(2)?));
                if let Some(i) = month
                    && samples[i].is_null()
                {
                    samples[i] = sql_to_json(row.get_ref(4)?);
                }
                let position = match by_code.get(&code) {
                    Some(&position) => position,
                    None => {
                        entries.push((code.clone(), sql_to_json(row.get_ref(1)?), vec![Value::from(0); MONTHS]));
                        by_code.insert(code, entries.len() - 1);
                        entries.len() - 1
                    }
                };
                if let Some(i) = month {
                    entries[position].2[i] = sql_to_json(row.get_ref(3)?);
                }
            }
            let items: Vec<Value> =
                entries.into_iter().map(|(code, name, obs)| json!({ "code": code, "name": name, "obs": obs })).collect();
            Ok((items, samples))
        })
        .await?;

    let mut response = Map::new();
    response.insert("items".into(), Value::Array(items));
    response.insert("samples".into(), Value::Array(samples));
    Ok(finish_response(response, &targets, start))
}

async fn locations_targets(
    State(state): State<SharedState>,
    body: Bytes,
) -> AppResult<Json<Value>> {
    let body = parse_json_body(&body, "Request body must be JSON")?;
    let location_ids = parse_location_ids_body(field(&body, "locationIds"))?;
    let months = parse_months_body(field(&body, "months"))?;
    let targets = state.targets.require()?;
    let start = Instant::now();

    let locations = targets
        .run(move |conn, db| {
            let species_names = db.species_names(conn)?;
            let month_clause = months
                .as_ref()
                .map(|m| format!(" AND month IN ({})", placeholders(m.len())))
                .unwrap_or_default();
            let sql = format!(
                "SELECT location_id, group_concat(species_id), group_concat(month), group_concat(obs), group_concat(samples)
                 FROM month_obs WHERE location_id IN ({}){month_clause} GROUP BY location_id",
                placeholders(location_ids.len())
            );
            let params: Vec<SqlValue> = location_ids
                .iter()
                .map(|id| SqlValue::Text(id.clone()))
                .chain(months.iter().flatten().map(|m| SqlValue::Real(*m)))
                .collect();
            let mut stmt = conn.prepare(&sql)?;
            let mut rows = stmt.query(params_from_iter(params))?;
            let mut locations = Map::new();
            while let Some(row) = rows.next()? {
                let location_id = sql_to_string(row.get_ref(0)?);
                let column = |i: usize| row.get_ref(i).map(sql_to_string);
                let (species_col, month_col, obs_col, samples_col) = (column(1)?, column(2)?, column(3)?, column(4)?);
                let species_ids: Vec<&str> = species_col.split(',').collect();
                let months: Vec<&str> = month_col.split(',').collect();
                let obs: Vec<&str> = obs_col.split(',').collect();
                let sample_counts: Vec<&str> = samples_col.split(',').collect();

                let mut samples = vec![Value::Null; MONTHS];
                let mut obs_by_species: Vec<(f64, Vec<Value>)> = Vec::new();
                let mut seen_species: HashMap<u64, usize> = HashMap::new();
                for i in 0..species_ids.len() {
                    let parse = |column: &[&str]| str_to_number(column.get(i).copied().unwrap_or(""));
                    let month = month_index(parse(&months));
                    if let Some(m) = month
                        && samples[m].is_null()
                    {
                        samples[m] = f64_to_json(parse(&sample_counts));
                    }
                    let species_id = parse(&species_ids);
                    let position = *seen_species.entry(species_id.to_bits()).or_insert_with(|| {
                        obs_by_species.push((species_id, vec![Value::from(0); MONTHS]));
                        obs_by_species.len() - 1
                    });
                    if let Some(m) = month {
                        obs_by_species[position].1[m] = f64_to_json(parse(&obs));
                    }
                }

                let items: Vec<Value> = obs_by_species
                    .into_iter()
                    .filter_map(|(species_id, obs)| {
                        let species = species_names.get(&(species_id as i64)).filter(|_| species_id.fract() == 0.0)?;
                        Some(json!({ "code": species.code.as_ref(), "name": species.name.as_ref(), "obs": obs }))
                    })
                    .collect();
                locations.insert(location_id, json!({ "items": items, "samples": samples }));
            }
            Ok(locations)
        })
        .await?;

    let mut response = Map::new();
    response.insert("locations".into(), Value::Object(locations));
    Ok(finish_response(response, &targets, start))
}

pub fn unique_region_codes<'a>(codes: impl Iterator<Item = &'a Option<String>>) -> Vec<String> {
    let mut seen = HashSet::new();
    codes
        .flatten()
        .filter(|code| seen.insert(code.as_str()))
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_frequency_matches_js() {
        assert_eq!(round_frequency(12.5), 13.0);
        assert_eq!(round_frequency(0.55), 0.6);
        assert_eq!(round_frequency(0.0149), 0.01);
    }

    #[test]
    fn targets_items_filter_and_rank() {
        let row = |code: &str, taxon: f64, month: f64, obs: i64| SpeciesMonthRow {
            code: code.into(),
            name: json!(code),
            sci_name: json!(code),
            taxon_order: taxon,
            month,
            obs: json!(obs),
        };
        let mut samples = vec![json!(0); 12];
        samples[0] = json!(10);
        samples[1] = json!(10);
        let rows = vec![
            row("b", 2.0, 1.0, 5),
            row("a", 1.0, 1.0, 5),
            row("c", 3.0, 2.0, 9),
            row("a", 1.0, 2.0, 1),
        ];
        let items = build_targets_items(rows, &samples, Some(&[1.0]));
        let codes: Vec<&str> = items.iter().map(|i| i["code"].as_str().unwrap()).collect();
        assert_eq!(codes, vec!["a", "b"]);
        assert_eq!(items[0]["frequency"], json!(50));
        assert_eq!(items[0]["obs"][1], json!(1));
        assert!(
            build_targets_items(vec![row("a", 1.0, 3.0, 1)], &samples, Some(&[3.0])).is_empty()
        );
    }
}
