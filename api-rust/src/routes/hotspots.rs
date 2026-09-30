use std::collections::HashMap;
use std::time::Instant;

use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::response::Response;
use axum::routing::{any, get, post};
use axum::{Json, Router, middleware};
use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, OptionalExtension, params_from_iter};
use serde_json::{Map, Value, json};

use crate::error::{AppError, AppResult};
use crate::http::{
    QueryParams, field, json_with_cache, not_found, parse_json_body, require_targets_db,
};
use crate::js::{
    f64_to_json, is_integer, is_nullish, js_trim, round_tenth_percent, sql_to_f64, sql_to_json,
    sql_to_opt_string, to_number,
};
use crate::state::SharedState;
use crate::validators::{
    BoundingBox, is_location_id, parse_bbox_body, parse_bbox_param, parse_limit,
    parse_location_ids, parse_min_count, parse_min_observations, parse_month, parse_region_codes,
};

use super::targets::{finish_response, placeholders, unique_region_codes};

const BBOX_HOTSPOTS_MAX: usize = 50_000;
const LOOKUP_CHUNK_SIZE: usize = 999;
const HOTSPOT_CACHE_CONTROL: &str = "public, max-age=86400";
const HOTSPOT_DETAIL_COLUMNS: &str = r#""id", "name", "country_code", "subnational1_code", "subnational2_code", "region_code", "lat", "lng", "num_species", "num_checklists""#;
const HOTSPOT_DETAIL_KEYS: [&str; 10] = [
    "id",
    "name",
    "countryCode",
    "subnational1Code",
    "subnational2Code",
    "regionCode",
    "lat",
    "lng",
    "numSpecies",
    "numChecklists",
];
const MONTHS_MESSAGE: &str = "months must be an array of values between 1 and 12";

pub fn routes(state: SharedState) -> Router<SharedState> {
    Router::new()
        .route("/api/v1/hotspots", get(hotspots_in_bbox))
        .route("/api/v1/hotspots/region/{region}", get(hotspots_in_region))
        .route(
            "/api/v1/hotspots/species/{species_code}",
            get(species_hotspots).post(species_hotspots_post),
        )
        .route("/api/v1/hotspots/location/{id}", get(hotspot_detail))
        .route("/api/v1/hotspots/lookup", post(lookup_hotspots))
        .route("/api/v1/hotspots/{*rest}", any(not_found))
        .layer(middleware::from_fn_with_state(state, require_targets_db))
}

fn integer_param(n: f64) -> SqlValue {
    if is_integer(n) && n.abs() < i64::MAX as f64 {
        SqlValue::Integer(n as i64)
    } else {
        SqlValue::Real(n)
    }
}

fn detail_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let mut object = Map::new();
    for (i, key) in HOTSPOT_DETAIL_KEYS.iter().enumerate() {
        object.insert((*key).to_string(), sql_to_json(row.get_ref(i)?));
    }
    Ok(Value::Object(object))
}

async fn hotspots_in_bbox(
    State(state): State<SharedState>,
    query: QueryParams,
) -> AppResult<Response> {
    let bbox = parse_bbox_param(query.get("bbox"))?
        .ok_or_else(|| AppError::bad_request("bbox is required"))?;
    let min_checklists = parse_min_count(query.get("minChecklists"), "minChecklists")?;
    let min_species = parse_min_count(query.get("minSpecies"), "minSpecies")?;
    let targets = state.targets.require()?;

    let items = targets
        .run(move |conn, _| {
            let mut sql = String::from(
                r#"select "id", "lat", "lng", "num_species" from "hotspots" where "lat" >= ? and "lat" <= ? and "lng" >= ? and "lng" <= ?"#,
            );
            let mut params = vec![
                SqlValue::Real(bbox.min_lat),
                SqlValue::Real(bbox.max_lat),
                SqlValue::Real(bbox.min_lng),
                SqlValue::Real(bbox.max_lng),
            ];
            if let Some(min) = min_checklists {
                sql.push_str(r#" and "num_checklists" >= ?"#);
                params.push(integer_param(min));
            }
            if let Some(min) = min_species {
                sql.push_str(r#" and "num_species" >= ?"#);
                params.push(integer_param(min));
            }
            sql.push_str(r#" order by "num_species" desc limit ?"#);
            params.push(SqlValue::Integer(BBOX_HOTSPOTS_MAX as i64 + 1));
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt
                .query_map(params_from_iter(params), |row| {
                    Ok(json!([
                        sql_to_json(row.get_ref(0)?),
                        sql_to_json(row.get_ref(1)?),
                        sql_to_json(row.get_ref(2)?),
                        sql_to_json(row.get_ref(3)?)
                    ]))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(rows)
        })
        .await?;

    if items.len() > BBOX_HOTSPOTS_MAX {
        return Err(AppError::bad_request(format!(
            "bbox contains more than {BBOX_HOTSPOTS_MAX} hotspots — use a smaller area"
        )));
    }
    Ok(json_with_cache(
        json!({ "items": items }),
        HOTSPOT_CACHE_CONTROL,
    ))
}

fn region_match_clause(codes: &[String]) -> (String, Vec<SqlValue>) {
    let clause = codes
        .iter()
        .map(|_| r#""hotspots"."region_code" = ? or "hotspots"."region_code" like ?"#)
        .collect::<Vec<_>>()
        .join(" or ");
    let params = codes
        .iter()
        .flat_map(|code| {
            [
                SqlValue::Text(code.clone()),
                SqlValue::Text(format!("{code}-%")),
            ]
        })
        .collect();
    (format!("({clause})"), params)
}

async fn hotspots_in_region(
    State(state): State<SharedState>,
    Path(region): Path<String>,
) -> AppResult<Response> {
    let region_codes = parse_region_codes(&region)?;
    let targets = state.targets.require()?;
    let items = targets
        .run(move |conn, _| {
            let (clause, params) = region_match_clause(&region_codes);
            let mut stmt = conn.prepare(&format!(
                r#"select "id", "name", "lat", "lng", "num_species", "num_checklists" from "hotspots" where {clause} order by "num_species" desc"#
            ))?;
            let items = stmt
                .query_map(params_from_iter(params), |row| {
                    let or_zero = |value: Value| if value.is_null() { Value::from(0) } else { value };
                    Ok(json!({
                        "id": sql_to_json(row.get_ref(0)?),
                        "name": sql_to_json(row.get_ref(1)?),
                        "lat": sql_to_json(row.get_ref(2)?),
                        "lng": sql_to_json(row.get_ref(3)?),
                        "species": or_zero(sql_to_json(row.get_ref(4)?)),
                        "checklists": or_zero(sql_to_json(row.get_ref(5)?)),
                    }))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(items)
        })
        .await?;
    Ok(json_with_cache(
        json!({ "items": items }),
        HOTSPOT_CACHE_CONTROL,
    ))
}

#[derive(Clone, Copy, PartialEq)]
enum SortBy {
    Best,
    Frequency,
}

struct SpeciesHotspotsOptions {
    species_code: String,
    region: Option<String>,
    limit: f64,
    months: Option<Vec<f64>>,
    min_observations: Option<f64>,
    bbox: Option<BoundingBox>,
    location_ids: Option<Vec<String>>,
    sort_by: Option<SortBy>,
}

struct HotspotRow {
    id: Value,
    name: Value,
    country_code: Option<String>,
    subnational1_code: Option<String>,
    subnational2_code: Option<String>,
    lat: Value,
    lng: Value,
    obs: f64,
    samples: Value,
    score: Option<f64>,
}

impl HotspotRow {
    fn read(row: &rusqlite::Row<'_>, has_score: bool) -> rusqlite::Result<Self> {
        let score = if has_score {
            match row.get_ref(9)? {
                rusqlite::types::ValueRef::Null => None,
                value => Some(sql_to_f64(value)),
            }
        } else {
            None
        };
        Ok(Self {
            id: sql_to_json(row.get_ref(0)?),
            name: sql_to_json(row.get_ref(1)?),
            country_code: sql_to_opt_string(row.get_ref(2)?),
            subnational1_code: sql_to_opt_string(row.get_ref(3)?),
            subnational2_code: sql_to_opt_string(row.get_ref(4)?),
            lat: sql_to_json(row.get_ref(5)?),
            lng: sql_to_json(row.get_ref(6)?),
            obs: sql_to_f64(row.get_ref(7)?),
            samples: sql_to_json(row.get_ref(8)?),
            score,
        })
    }

    fn frequency(&self) -> Value {
        f64_to_json(round_tenth_percent(
            self.obs / to_number(Some(&self.samples)),
        ))
    }

    fn deepest_region_code(&self) -> Option<&str> {
        [
            &self.subnational2_code,
            &self.subnational1_code,
            &self.country_code,
        ]
        .into_iter()
        .flatten()
        .find(|code| !code.is_empty())
        .map(String::as_str)
    }
}

struct RegionInfo {
    name: String,
    long_name: Option<String>,
}

fn resolve_species_id(conn: &Connection, species_code: &str) -> AppResult<i64> {
    conn.query_row(
        r#"select "id" from "species" where "code" = ?"#,
        [species_code.to_lowercase()],
        |row| row.get(0),
    )
    .optional()?
    .ok_or_else(|| AppError::not_found("Species not found"))
}

struct WhereFilters {
    sql: String,
    params: Vec<SqlValue>,
}

fn hotspot_filters(options: &SpeciesHotspotsOptions) -> AppResult<WhereFilters> {
    let mut sql = String::new();
    let mut params = Vec::new();
    if let Some(region) = options.region.as_deref().filter(|r| !r.is_empty()) {
        let (clause, region_params) = region_match_clause(&parse_region_codes(region)?);
        sql.push_str(&format!(" and {clause}"));
        params.extend(region_params);
    }
    if let Some(location_ids) = &options.location_ids {
        sql.push_str(&format!(
            r#" and "hotspots"."id" in ({})"#,
            placeholders(location_ids.len())
        ));
        params.extend(location_ids.iter().map(|id| SqlValue::Text(id.clone())));
    }
    if let Some(bbox) = options.bbox {
        sql.push_str(r#" and "hotspots"."lat" >= ? and "hotspots"."lat" <= ? and "hotspots"."lng" >= ? and "hotspots"."lng" <= ?"#);
        params.extend([bbox.min_lat, bbox.max_lat, bbox.min_lng, bbox.max_lng].map(SqlValue::Real));
    }
    Ok(WhereFilters { sql, params })
}

const HOTSPOT_SELECT: &str = r#""hotspots"."id", "hotspots"."name", "hotspots"."country_code", "hotspots"."subnational1_code", "hotspots"."subnational2_code", "hotspots"."lat", "hotspots"."lng""#;

fn query_rows(
    conn: &Connection,
    sql: &str,
    params: Vec<SqlValue>,
    has_score: bool,
) -> AppResult<Vec<HotspotRow>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt
        .query_map(params_from_iter(params), |row| {
            HotspotRow::read(row, has_score)
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn fetch_get_rows(
    conn: &Connection,
    species_id: i64,
    options: &SpeciesHotspotsOptions,
) -> AppResult<Vec<HotspotRow>> {
    let table = if options.months.is_some() {
        "month_obs"
    } else {
        "year_obs"
    };
    let mut sql = format!(
        r#"select {HOTSPOT_SELECT}, "{table}"."obs", "{table}"."samples", "{table}"."score" from "{table}" inner join "hotspots" on "{table}"."location_id" = "hotspots"."id" where "{table}"."species_id" = ?"#
    );
    let mut params = vec![SqlValue::Integer(species_id)];
    if let Some(month) = options.months.as_ref().and_then(|m| m.first()) {
        sql.push_str(r#" and "month_obs"."month" = ?"#);
        params.push(integer_param(*month));
    }
    if let Some(min) = options.min_observations {
        sql.push_str(&format!(r#" and "{table}"."obs" >= ?"#));
        params.push(integer_param(min));
    }
    let filters = hotspot_filters(options)?;
    sql.push_str(&filters.sql);
    params.extend(filters.params);
    sql.push_str(r#" order by "score" desc limit ?"#);
    params.push(integer_param(options.limit));
    query_rows(conn, &sql, params, true)
}

fn fetch_post_rows(
    conn: &Connection,
    species_id: i64,
    options: &SpeciesHotspotsOptions,
) -> AppResult<Vec<HotspotRow>> {
    let use_best = options.sort_by == Some(SortBy::Best);
    let mut params = Vec::new();

    let mut sql = if let Some(months) = &options.months {
        let samples_expr = format!(
            "({})",
            months
                .iter()
                .map(|_| "COALESCE((SELECT samples FROM month_obs WHERE location_id = species_obs.location_id AND month = ? LIMIT 1), 0)")
                .collect::<Vec<_>>()
                .join(" + ")
        );
        let month_params: Vec<SqlValue> = months.iter().map(|m| integer_param(*m)).collect();
        let mut select =
            format!(r#"select {HOTSPOT_SELECT}, "species_obs"."obs", {samples_expr} as "samples""#);
        params.extend(month_params.iter().cloned());
        if use_best {
            select.push_str(&format!(
                r#", (species_obs.weighted_score * 1.0 / NULLIF({samples_expr}, 0)) as "score""#
            ));
            params.extend(month_params.iter().cloned());
        }
        select.push_str(&format!(
            r#" from (select "month_obs"."location_id", SUM(month_obs.obs) as "obs", SUM(month_obs.score * month_obs.samples) as "weighted_score" from "month_obs" as "month_obs" where "month_obs"."species_id" = ? and month_obs.month IN ({}) group by "month_obs"."location_id") as "species_obs" inner join "hotspots" on "species_obs"."location_id" = "hotspots"."id""#,
            placeholders(months.len())
        ));
        params.push(SqlValue::Integer(species_id));
        params.extend(month_params);
        let mut conditions: Vec<&str> = Vec::new();
        if let Some(min) = options.min_observations {
            conditions.push(r#""species_obs"."obs" >= ?"#);
            params.push(integer_param(min));
        }
        let filters = hotspot_filters(options)?;
        let mut where_sql = conditions.join(" and ");
        if !filters.sql.is_empty() {
            let rest = filters.sql.trim_start_matches(" and ");
            if where_sql.is_empty() {
                where_sql = rest.to_string();
            } else {
                where_sql = format!("{where_sql} and {rest}");
            }
        }
        params.extend(filters.params);
        if !where_sql.is_empty() {
            select.push_str(&format!(" where {where_sql}"));
        }
        let order = if use_best {
            r#" order by score desc, "species_obs"."obs" desc"#
        } else {
            r#" order by (species_obs.obs * 1.0 / samples) desc, "species_obs"."obs" desc"#
        };
        select.push_str(order);
        select
    } else {
        let score_column = if use_best {
            r#", "year_obs"."score""#
        } else {
            ""
        };
        let mut select = format!(
            r#"select {HOTSPOT_SELECT}, "year_obs"."obs", "year_obs"."samples"{score_column} from "year_obs" as "year_obs" inner join "hotspots" on "year_obs"."location_id" = "hotspots"."id" where "year_obs"."species_id" = ?"#
        );
        params.push(SqlValue::Integer(species_id));
        if let Some(min) = options.min_observations {
            select.push_str(r#" and "year_obs"."obs" >= ?"#);
            params.push(integer_param(min));
        }
        let filters = hotspot_filters(options)?;
        select.push_str(&filters.sql);
        params.extend(filters.params);
        let order = if use_best {
            r#" order by "year_obs"."score" desc, "year_obs"."obs" desc"#
        } else {
            r#" order by (year_obs.obs * 1.0 / year_obs.samples) desc, "year_obs"."obs" desc"#
        };
        select.push_str(order);
        select
    };
    sql.push_str(" limit ?");
    params.push(integer_param(options.limit));
    query_rows(conn, &sql, params, use_best)
}

async fn load_region_map(
    state: &SharedState,
    rows: &[HotspotRow],
) -> AppResult<HashMap<String, RegionInfo>> {
    let codes = unique_region_codes(rows.iter().flat_map(|row| {
        [
            &row.country_code,
            &row.subnational1_code,
            &row.subnational2_code,
        ]
    }));
    if codes.is_empty() {
        return Ok(HashMap::new());
    }
    state
        .main
        .run(move |conn| {
            let mut stmt = conn.prepare(&format!(
                r#"select "id", "name", "long_name" from "regions" where "id" in ({})"#,
                placeholders(codes.len())
            ))?;
            let regions = stmt
                .query_map(params_from_iter(codes.iter()), |row| {
                    Ok((
                        crate::js::sql_to_string(row.get_ref(0)?),
                        RegionInfo {
                            name: crate::js::sql_to_string(row.get_ref(1)?),
                            long_name: sql_to_opt_string(row.get_ref(2)?),
                        },
                    ))
                })?
                .collect::<rusqlite::Result<HashMap<_, _>>>()?;
            Ok(regions)
        })
        .await
}

fn hotspot_region(
    row: &HotspotRow,
    regions: &HashMap<String, RegionInfo>,
    selected: Option<&[String]>,
) -> Value {
    let Some(deepest_code) = row.deepest_region_code() else {
        return Value::Null;
    };
    let Some(deepest) = regions.get(deepest_code) else {
        return Value::Null;
    };
    let Some(selected) = selected else {
        let label = deepest
            .long_name
            .as_deref()
            .filter(|n| !n.is_empty())
            .unwrap_or(&deepest.name);
        return Value::String(label.to_string());
    };
    if selected.iter().any(|code| code == deepest_code) {
        return Value::Null;
    }
    let mut breadcrumb: Vec<&str> = Vec::new();
    let mut current: Option<&str> = Some(deepest_code);
    while let Some(code) = current.filter(|c| !c.is_empty() && !selected.iter().any(|s| s == c)) {
        let Some(region) = regions.get(code) else {
            return Value::Null;
        };
        breadcrumb.push(&region.name);
        current = code.rfind('-').map(|i| &code[..i]);
    }
    if current.is_some_and(|c| !c.is_empty()) {
        Value::String(breadcrumb.join(", "))
    } else {
        Value::Null
    }
}

async fn run_species_query(
    state: SharedState,
    options: SpeciesHotspotsOptions,
    is_post: bool,
) -> AppResult<Json<Value>> {
    let targets = state.targets.require()?;
    let start = Instant::now();
    let (rows, options) = targets
        .run(move |conn, _| {
            let species_id = resolve_species_id(conn, &options.species_code)?;
            let rows = if is_post {
                fetch_post_rows(conn, species_id, &options)?
            } else {
                fetch_get_rows(conn, species_id, &options)?
            };
            Ok((rows, options))
        })
        .await?;
    let regions = load_region_map(&state, &rows).await?;
    let selected = match options.region.as_deref().filter(|r| !r.is_empty()) {
        Some(region) => Some(parse_region_codes(region)?),
        None => None,
    };

    let items: Vec<Value> = rows
        .iter()
        .map(|row| {
            let mut item = Map::new();
            item.insert("id".into(), row.id.clone());
            item.insert("name".into(), row.name.clone());
            item.insert(
                "region".into(),
                hotspot_region(row, &regions, selected.as_deref()),
            );
            item.insert("lat".into(), row.lat.clone());
            item.insert("lng".into(), row.lng.clone());
            let score = row.score.map(|s| f64_to_json(round_tenth_percent(s)));
            if !is_post {
                item.insert("score".into(), score.clone().unwrap_or(Value::from(0)));
            }
            item.insert("frequency".into(), row.frequency());
            item.insert("samples".into(), row.samples.clone());
            if is_post && let Some(score) = score {
                item.insert("score".into(), score);
            }
            Value::Object(item)
        })
        .collect();

    let mut response = Map::new();
    response.insert("items".into(), Value::Array(items));
    Ok(finish_response(response, &targets, start))
}

async fn species_hotspots(
    State(state): State<SharedState>,
    Path(species_code): Path<String>,
    query: QueryParams,
) -> AppResult<Json<Value>> {
    let options = SpeciesHotspotsOptions {
        species_code: js_trim(&species_code).to_lowercase(),
        region: query.get("region").map(str::to_string),
        limit: parse_limit(query.value("limit").as_ref())?,
        months: parse_month(query.value("month").as_ref())?.map(|m| vec![m]),
        min_observations: parse_min_observations(query.value("minObservations").as_ref())?,
        bbox: parse_bbox_param(query.get("bbox"))?,
        location_ids: None,
        sort_by: None,
    };
    run_species_query(state, options, false).await
}

fn parse_post_months(value: Option<&Value>) -> AppResult<Option<Vec<f64>>> {
    if is_nullish(value) {
        return Ok(None);
    }
    let Some(Value::Array(items)) = value else {
        return Err(AppError::bad_request(MONTHS_MESSAGE));
    };
    let mut months: Vec<f64> = Vec::new();
    for month in items.iter().map(|item| to_number(Some(item))) {
        if !months
            .iter()
            .any(|m| *m == month || (m.is_nan() && month.is_nan()))
        {
            months.push(month);
        }
    }
    months.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    if months.is_empty()
        || months
            .iter()
            .any(|m| !is_integer(*m) || *m < 1.0 || *m > 12.0)
    {
        return Err(AppError::bad_request(MONTHS_MESSAGE));
    }
    Ok(Some(months))
}

async fn species_hotspots_post(
    State(state): State<SharedState>,
    Path(species_code): Path<String>,
    body: Bytes,
) -> AppResult<Json<Value>> {
    let species_code = js_trim(&species_code).to_lowercase();
    let body = parse_json_body(&body, "Request body must be valid JSON")?;
    if !is_nullish(field(&body, "month")) {
        return Err(AppError::bad_request(MONTHS_MESSAGE));
    }
    let months = parse_post_months(field(&body, "months"))?;
    let sort_by = match field(&body, "sortBy") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) if s == "best" => Some(SortBy::Best),
        Some(Value::String(s)) if s == "frequency" => Some(SortBy::Frequency),
        Some(_) => {
            return Err(AppError::bad_request(
                "sortBy must be 'best' or 'frequency'",
            ));
        }
    };
    let options = SpeciesHotspotsOptions {
        species_code,
        region: field(&body, "region")
            .and_then(Value::as_str)
            .map(str::to_string),
        limit: parse_limit(field(&body, "limit"))?,
        months,
        min_observations: parse_min_observations(field(&body, "minObservations"))?,
        bbox: parse_bbox_body(field(&body, "bbox"))?,
        location_ids: parse_location_ids(field(&body, "locationIds"))?,
        sort_by,
    };
    run_species_query(state, options, true).await
}

async fn hotspot_detail(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> AppResult<Response> {
    let id = js_trim(&id).to_uppercase();
    if !is_location_id(&id) {
        return Err(AppError::bad_request("id must be a hotspot ID like L12345"));
    }
    let targets = state.targets.require()?;
    let hotspot = targets
        .run(move |conn, _| {
            Ok(conn
                .query_row(
                    &format!(r#"select {HOTSPOT_DETAIL_COLUMNS} from "hotspots" where "id" = ?"#),
                    [&id],
                    detail_row,
                )
                .optional()?)
        })
        .await?
        .ok_or_else(|| AppError::not_found("Hotspot not found"))?;
    Ok(json_with_cache(hotspot, HOTSPOT_CACHE_CONTROL))
}

async fn lookup_hotspots(State(state): State<SharedState>, body: Bytes) -> AppResult<Json<Value>> {
    let body = parse_json_body(&body, "Request body must be valid JSON")?;
    let raw_ids = match field(&body, "ids") {
        Some(Value::Array(ids)) if ids.iter().all(Value::is_string) => ids,
        _ => return Err(AppError::bad_request("ids must be an array of strings")),
    };
    let mut seen = std::collections::HashSet::new();
    let ids: Vec<String> = raw_ids
        .iter()
        .filter_map(Value::as_str)
        .map(|id| js_trim(id).to_uppercase())
        .filter(|id| !id.is_empty() && seen.insert(id.clone()))
        .collect();
    if ids.is_empty() {
        return Ok(Json(json!({ "items": [] })));
    }

    let targets = state.targets.require()?;
    let items = targets
        .run(move |conn, _| {
            let mut items = Vec::with_capacity(ids.len());
            for chunk in ids.chunks(LOOKUP_CHUNK_SIZE) {
                let mut stmt = conn.prepare(&format!(
                    r#"select {HOTSPOT_DETAIL_COLUMNS} from "hotspots" where "id" in ({})"#,
                    placeholders(chunk.len())
                ))?;
                let rows = stmt.query_map(params_from_iter(chunk.iter()), detail_row)?;
                for row in rows {
                    items.push(row?);
                }
            }
            Ok(items)
        })
        .await?;
    Ok(Json(json!({ "items": items })))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(country: &str, state: Option<&str>, county: Option<&str>) -> HotspotRow {
        HotspotRow {
            id: json!("L1"),
            name: json!("n"),
            country_code: Some(country.into()),
            subnational1_code: state.map(Into::into),
            subnational2_code: county.map(Into::into),
            lat: json!(0),
            lng: json!(0),
            obs: 1.0,
            samples: json!(2),
            score: None,
        }
    }

    fn regions() -> HashMap<String, RegionInfo> {
        [
            ("US", "United States", None),
            ("US-CA", "California", Some("California, US")),
            ("US-CA-001", "Alameda", Some("Alameda, California, US")),
        ]
        .into_iter()
        .map(|(id, name, long)| {
            (
                id.to_string(),
                RegionInfo {
                    name: name.into(),
                    long_name: long.map(Into::into),
                },
            )
        })
        .collect()
    }

    #[test]
    fn region_labels_follow_selection() {
        let regions = regions();
        let county = row("US", Some("US-CA"), Some("US-CA-001"));
        assert_eq!(
            hotspot_region(&county, &regions, None),
            json!("Alameda, California, US")
        );
        assert_eq!(
            hotspot_region(&county, &regions, Some(&["US".into()])),
            json!("Alameda, California")
        );
        assert_eq!(
            hotspot_region(&county, &regions, Some(&["US-CA-001".into()])),
            Value::Null
        );
        assert_eq!(
            hotspot_region(&county, &regions, Some(&["MX".into()])),
            Value::Null
        );
        assert_eq!(
            hotspot_region(&row("US", Some(""), None), &regions, None),
            json!("United States")
        );
    }
}
