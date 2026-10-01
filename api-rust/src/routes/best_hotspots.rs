use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use rusqlite::OptionalExtension;
use serde_json::{Map, Value, json};

use crate::ebird::ebd_citation;
use crate::error::{AppError, AppResult};
use crate::http::{field, parse_json_body};
use crate::js::{
    f64_to_json, is_nullish, is_truthy, iso_timestamp, js_round, js_trim, query_time,
    round_tenth_percent, sql_to_f64, sql_to_json, sql_to_opt_string, sql_to_string, to_js_string,
    utf16_prefix,
};
use crate::occurrences::{
    HotspotQuery, MONTHS_IN_YEAR, MonthHotspotQuery, OccurrencesIndex, ResolvedSpecies,
    SpeciesInput,
};
use crate::state::{LifeListVersion, SharedState};
use crate::validators::{
    is_h3_index, is_location_id, is_token, parse_bbox_body, parse_best_hotspots_limit,
    parse_frequency, parse_min_checklists, parse_month_selection, parse_region_codes,
    parse_resolution, parse_token,
};

const UNMATCHED_SAMPLE_SIZE: usize = 25;
const FILE_NAME_MAX_LENGTH: usize = 200;
const CELLS_MAX: usize = 500;
const QUANTILE_BREAKS: usize = 10;
const JSON_BODY_MESSAGE: &str = "Request body must be JSON";

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/api/v1/best-hotspots/status", get(status))
        .route("/api/v1/best-hotspots/list", post(save_list))
        .route(
            "/api/v1/best-hotspots/list/{token}",
            get(get_list).delete(delete_list),
        )
        .route("/api/v1/best-hotspots/hotspots", post(hotspots))
        .route(
            "/api/v1/best-hotspots/hotspot/{location_id}",
            post(hotspot_lifers),
        )
        .route("/api/v1/best-hotspots/grid", post(grid))
        .route("/api/v1/best-hotspots/grid-scale", post(grid_scale))
        .route("/api/v1/best-hotspots/cells", post(cells))
}

fn parse_species_input(value: Option<&Value>) -> AppResult<Vec<SpeciesInput>> {
    let items = match value {
        Some(Value::Array(items)) if !items.is_empty() => items,
        _ => {
            return Err(AppError::bad_request(
                "species must be a non-empty array of { sciName, commonName, code }",
            ));
        }
    };
    items
        .iter()
        .map(|item| {
            SpeciesInput::from_json(item).ok_or_else(|| {
                AppError::bad_request("each species entry must be a string or object")
            })
        })
        .collect()
}

enum SpeciesSource {
    Inline(Vec<SpeciesInput>),
    LifeList {
        token: String,
        version: (Option<String>, Option<String>),
    },
}

impl SpeciesSource {
    async fn from_body(state: &SharedState, body: &Value) -> AppResult<Self> {
        let Some(token) = field(body, "listToken").filter(|v| !v.is_null()) else {
            return Ok(Self::Inline(parse_species_input(field(body, "species"))?));
        };
        let token = match token {
            Value::String(token) => parse_token(token)?,
            _ => return Err(AppError::bad_request("listToken must be a UUID")),
        };
        let lookup = token.clone();
        let version = state
            .main
            .run(move |conn| {
                Ok(conn
                    .query_row(
                        r#"select "created_at", "updated_at" from "life_lists" where "token" = ?"#,
                        [&lookup],
                        |row| {
                            Ok((
                                sql_to_opt_string(row.get_ref(0)?),
                                sql_to_opt_string(row.get_ref(1)?),
                            ))
                        },
                    )
                    .optional()?)
            })
            .await?
            .ok_or_else(life_list_missing)?;
        Ok(Self::LifeList { token, version })
    }

    async fn resolve(
        self,
        state: &SharedState,
        index: &Arc<OccurrencesIndex>,
    ) -> AppResult<Arc<ResolvedSpecies>> {
        let (token, (created_at, updated_at)) = match self {
            Self::Inline(inputs) => return Ok(Arc::new(index.resolve_species(&inputs))),
            Self::LifeList { token, version } => (token, version),
        };
        let version = LifeListVersion {
            created_at,
            updated_at,
            index_generation: index.generation,
        };
        if let Some(cached) = state.life_lists.get(&token, &version) {
            return Ok(cached);
        }
        let lookup = token.clone();
        let stored: String = state
            .main
            .run(move |conn| {
                Ok(conn
                    .query_row(
                        r#"select "species" from "life_lists" where "token" = ?"#,
                        [&lookup],
                        |row| row.get_ref(0).map(sql_to_string),
                    )
                    .optional()?)
            })
            .await?
            .ok_or_else(life_list_missing)?;
        let parsed: Value = serde_json::from_str(&stored)?;
        let inputs = parse_species_input(Some(&parsed))?;
        let index = Arc::clone(index);
        let resolved =
            Arc::new(tokio::task::spawn_blocking(move || index.resolve_species(&inputs)).await?);
        state
            .life_lists
            .insert(token, version, Arc::clone(&resolved));
        Ok(resolved)
    }
}

fn life_list_missing() -> AppError {
    AppError::user(
        StatusCode::NOT_FOUND,
        "Life list not found — please upload it again",
    )
}

async fn region_names(state: &SharedState) -> Arc<HashMap<String, String>> {
    let loaded = state
        .region_names
        .get_or_try_init(|| async {
            state
                .main
                .run(|conn| {
                    let mut stmt =
                        conn.prepare(r#"select "id", "name", "long_name" from "regions""#)?;
                    let names = stmt
                        .query_map([], |row| {
                            let name = sql_to_string(row.get_ref(1)?);
                            let long_name = sql_to_opt_string(row.get_ref(2)?);
                            Ok((sql_to_string(row.get_ref(0)?), long_name.unwrap_or(name)))
                        })?
                        .collect::<rusqlite::Result<HashMap<_, _>>>()?;
                    Ok(Arc::new(names))
                })
                .await
        })
        .await;
    match loaded {
        Ok(names) => Arc::clone(names),
        Err(err) => {
            tracing::error!("Failed to load region names: {err:?}");
            Arc::new(HashMap::new())
        }
    }
}

fn region_name_for(code: &str, names: &HashMap<String, String>) -> Value {
    let mut current = code;
    while !current.is_empty() {
        if let Some(name) = names.get(current).filter(|n| !n.is_empty()) {
            return Value::String(name.clone());
        }
        match current.rfind('-') {
            Some(i) => current = &current[..i],
            None => return Value::Null,
        }
    }
    Value::Null
}

fn citation_fields(response: &mut Map<String, Value>, index: &OccurrencesIndex) {
    response.insert(
        "citation".into(),
        Value::String(ebd_citation(&index.version_month, &index.version_year)),
    );
    response.insert("taxonomyVersion".into(), index.taxonomy_version.clone());
}

async fn status(State(state): State<SharedState>) -> Json<Value> {
    let (available, error) = state.occurrences.status();
    if !available {
        return Json(json!({ "ready": false, "available": false, "error": error }));
    }
    match state.occurrences.get().await {
        Ok(index) => Json(json!({
            "ready": true,
            "available": true,
            "buckets": index.buckets_json,
            "minChecklistsFloor": index.min_checklists_floor_json,
            "monthMinChecklistsFloor": index.months.map(|months| f64_to_json(months.min_checklists)),
            "version": index.version(),
            "locations": index.num_year_locs,
            "zonesLoaded": index.zones_loaded(),
            "resolutions": index.resolutions(),
        })),
        Err(err) => {
            let message = match err {
                AppError::Internal(message) | AppError::Http { message, .. } => message,
                AppError::BasicAuth => String::new(),
            };
            Json(json!({ "ready": false, "available": true, "error": message }))
        }
    }
}

async fn save_list(State(state): State<SharedState>, body: Bytes) -> AppResult<Json<Value>> {
    let body = parse_json_body(&body, JSON_BODY_MESSAGE)?;
    let inputs = parse_species_input(field(&body, "species"))?;
    let file_name = field(&body, "fileName")
        .and_then(Value::as_str)
        .map(|n| utf16_prefix(n, FILE_NAME_MAX_LENGTH));
    let requested_token = field(&body, "token")
        .and_then(Value::as_str)
        .filter(|t| is_token(t))
        .map(str::to_string);

    let index = state.occurrences.get().await?;
    let resolve_index = Arc::clone(&index);
    let resolve_inputs = inputs.clone();
    let resolved =
        tokio::task::spawn_blocking(move || resolve_index.resolve_species(&resolve_inputs)).await?;
    let matched = resolved.matched();
    let species =
        serde_json::to_string(&inputs.iter().map(SpeciesInput::to_json).collect::<Vec<_>>())?;

    let token = state
        .main
        .run(move |conn| {
            if let Some(token) = requested_token {
                let updated = conn.execute(
                    r#"update "life_lists" set "species" = ?, "file_name" = ?, "species_count" = ?, "updated_at" = ? where "token" = ?"#,
                    rusqlite::params![species, file_name, matched as i64, iso_timestamp(chrono::Utc::now()), token],
                )?;
                if updated > 0 {
                    return Ok(token);
                }
            }
            let token = uuid::Uuid::new_v4().to_string();
            conn.execute(
                r#"insert into "life_lists" ("token", "species", "file_name", "species_count") values (?, ?, ?, ?)"#,
                rusqlite::params![token, species, file_name, matched as i64],
            )?;
            Ok(token)
        })
        .await?;
    state.life_lists.invalidate(&token);

    Ok(Json(
        json!({ "token": token, "count": matched, "matched": matched, "unmatchedCount": resolved.unmatched.len() }),
    ))
}

async fn get_list(
    State(state): State<SharedState>,
    Path(token): Path<String>,
) -> AppResult<Json<Value>> {
    let token = parse_token(&token)?;
    let lookup = token.clone();
    let row = state
        .main
        .run(move |conn| {
            Ok(conn
                .query_row(
                    r#"select "file_name", "species_count", "created_at", "updated_at" from "life_lists" where "token" = ?"#,
                    [&lookup],
                    |row| {
                        Ok(json!({
                            "token": lookup,
                            "fileName": sql_to_json(row.get_ref(0)?),
                            "speciesCount": sql_to_json(row.get_ref(1)?),
                            "createdAt": sql_to_json(row.get_ref(2)?),
                            "updatedAt": sql_to_json(row.get_ref(3)?),
                        }))
                    },
                )
                .optional()?)
        })
        .await?;
    row.map(Json)
        .ok_or_else(|| AppError::not_found("Life list not found"))
}

async fn delete_list(
    State(state): State<SharedState>,
    Path(token): Path<String>,
) -> AppResult<Json<Value>> {
    let token = parse_token(&token)?;
    let lookup = token.clone();
    state
        .main
        .run(move |conn| {
            conn.execute(r#"delete from "life_lists" where "token" = ?"#, [&lookup])?;
            Ok(())
        })
        .await?;
    state.life_lists.invalidate(&token);
    Ok(Json(json!({ "ok": true })))
}

async fn hotspots(State(state): State<SharedState>, body: Bytes) -> AppResult<Json<Value>> {
    let start = Instant::now();
    let body = parse_json_body(&body, JSON_BODY_MESSAGE)?;
    let source = SpeciesSource::from_body(&state, &body).await?;
    let frequency = parse_frequency(field(&body, "frequency"))?;
    let requested_min_checklists = field(&body, "minChecklists");
    let year_min_checklists = parse_min_checklists(requested_min_checklists)?;
    let limit = parse_best_hotspots_limit(field(&body, "limit"))?;
    let months = parse_month_selection(field(&body, "months"))?
        .filter(|months| months.len() < MONTHS_IN_YEAR);
    let region = field(&body, "region");
    let region_codes = if is_truthy(region) {
        Some(parse_region_codes(&to_js_string(
            region.unwrap_or(&Value::Null),
        ))?)
    } else {
        None
    };
    let bbox = parse_bbox_body(field(&body, "bbox"))?;
    if months.is_some() && region_codes.is_none() {
        return Err(AppError::bad_request(
            "region is required when months are selected",
        ));
    }
    if months.is_some() && bbox.is_some() {
        return Err(AppError::bad_request("bbox cannot be combined with months"));
    }

    let index = state.occurrences.get().await?;
    let month_settings = match &months {
        Some(_) => Some(index.months.ok_or_else(|| {
            AppError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "Month filtering is not available for this dataset",
            )
        })?),
        None => None,
    };
    let min_checklists = match month_settings {
        Some(settings) if is_nullish(requested_min_checklists) => settings.min_checklists,
        Some(settings) => year_min_checklists.max(settings.min_checklists),
        None => year_min_checklists.max(index.min_checklists_floor),
    };
    let seen = source.resolve(&state, &index).await?;
    let bucket = index.bucket_for_frequency(frequency);
    let bucket_frequency = index.bucket_value(bucket);

    let query_index = Arc::clone(&index);
    let query_seen = Arc::clone(&seen);
    let query_months = months.clone();
    let (items, candidates) = tokio::task::spawn_blocking(move || {
        let (items, candidates) = match (&query_months, month_settings, &region_codes) {
            (Some(months), Some(settings), Some(region_codes)) => query_index
                .query_month_hotspots(
                    settings,
                    &MonthHotspotQuery {
                        seen: &query_seen,
                        months,
                        frequency: bucket_frequency,
                        min_checklists,
                        region_codes,
                        limit,
                    },
                )
                .map_err(AppError::internal)?,
            _ => query_index.query_hotspots(&HotspotQuery {
                seen: &query_seen,
                bucket,
                min_checklists,
                region_codes: region_codes.as_deref(),
                bbox,
                limit,
            }),
        };
        let items: Vec<(Value, String)> = items
            .iter()
            .map(|item| {
                (
                    serde_json::to_value(item).unwrap_or(Value::Null),
                    item.region_code.to_string(),
                )
            })
            .collect();
        Ok::<_, AppError>((items, candidates))
    })
    .await??;

    let names = region_names(&state).await;
    let items: Vec<Value> = items
        .into_iter()
        .map(|(mut item, region_code)| {
            if let Value::Object(object) = &mut item {
                object.insert("regionName".into(), region_name_for(&region_code, &names));
            }
            item
        })
        .collect();

    let unmatched_sample: Vec<&String> =
        seen.unmatched.iter().take(UNMATCHED_SAMPLE_SIZE).collect();
    let mut response = Map::new();
    response.insert("items".into(), Value::Array(items));
    response.insert(
        "meta".into(),
        json!({
            "hotspotsInScope": candidates,
            "seenMatched": seen.matched(),
            "seenUnmatched": seen.unmatched.len(),
            "unmatchedSample": unmatched_sample,
            "frequency": f64_to_json(bucket_frequency),
            "frequencyPct": f64_to_json(js_round(bucket_frequency * 100.0 * 10.0) / 10.0),
            "minChecklists": f64_to_json(min_checklists),
            "months": months,
            "version": index.version(),
        }),
    );
    citation_fields(&mut response, &index);
    response.insert("queryTime".into(), Value::String(query_time(start)));
    Ok(Json(Value::Object(response)))
}

async fn hotspot_lifers(
    State(state): State<SharedState>,
    Path(location_id): Path<String>,
    body: Bytes,
) -> AppResult<Json<Value>> {
    let start = Instant::now();
    let location_id = js_trim(&location_id).to_uppercase();
    if !is_location_id(&location_id) {
        return Err(AppError::bad_request("locationId must look like L12345"));
    }
    let body = parse_json_body(&body, JSON_BODY_MESSAGE)?;
    let source = SpeciesSource::from_body(&state, &body).await?;
    let frequency = parse_frequency(field(&body, "frequency"))?;

    let index = state.occurrences.get().await?;
    let seen = source.resolve(&state, &index).await?;
    let threshold = index.bucket_value(index.bucket_for_frequency(frequency));

    let targets = state.targets.require()?;
    let lookup = location_id.clone();
    let mut lifers: Vec<(f64, f64, Value)> = targets
        .run(move |conn, _| {
            let mut stmt = conn.prepare(
                r#"select "species"."id" as "id", "species"."code" as "code", "species"."name" as "name", "species"."sci_name" as "sciName",
                          "species"."taxon_order" as "taxonOrder", "year_obs"."obs" as "obs", "year_obs"."samples" as "samples", "year_obs"."score" as "score"
                   from "year_obs" inner join "species" on "species"."id" = "year_obs"."species_id"
                   where "year_obs"."location_id" = ? and "year_obs"."score" >= ?"#,
            )?;
            let rows = stmt
                .query_map(rusqlite::params![lookup, threshold], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        sql_to_string(row.get_ref(1)?),
                        sql_to_json(row.get_ref(2)?),
                        sql_to_json(row.get_ref(3)?),
                        sql_to_f64(row.get_ref(4)?),
                        sql_to_f64(row.get_ref(5)?),
                        sql_to_f64(row.get_ref(6)?),
                        sql_to_f64(row.get_ref(7)?),
                    ))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(rows)
        })
        .await?
        .into_iter()
        .filter(|(id, ..)| !seen.lookup.contains(&(*id as i32)))
        .map(|(_, code, name, sci_name, taxon_order, obs, samples, score)| {
            let score = round_tenth_percent(score);
            let lifer = json!({
                "code": code,
                "name": name,
                "sciName": sci_name,
                "frequency": f64_to_json(round_tenth_percent(obs / samples)),
                "score": f64_to_json(score),
                "taxonOrder": f64_to_json(taxon_order),
                "photo": state.avicommons.photo(&code),
            });
            (score, taxon_order, lifer)
        })
        .collect();
    lifers.sort_by(|a, b| {
        b.0.partial_cmp(&a.0)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
    });
    let lifers: Vec<Value> = lifers.into_iter().map(|(_, _, lifer)| lifer).collect();

    let mut response = Map::new();
    response.insert("locationId".into(), Value::String(location_id));
    let lifer_count = lifers.len();
    response.insert("lifers".into(), Value::Array(lifers));
    response.insert("liferCount".into(), json!(lifer_count));
    response.insert("frequency".into(), f64_to_json(threshold));
    citation_fields(&mut response, &index);
    response.insert("queryTime".into(), Value::String(query_time(start)));
    Ok(Json(Value::Object(response)))
}

async fn grid(State(state): State<SharedState>, body: Bytes) -> AppResult<Json<Value>> {
    let start = Instant::now();
    let body = parse_json_body(&body, JSON_BODY_MESSAGE)?;
    let source = SpeciesSource::from_body(&state, &body).await?;
    let bbox = parse_bbox_body(field(&body, "bbox"))?
        .ok_or_else(|| AppError::bad_request("bbox is required for grid queries"))?;

    let index = state.occurrences.get().await?;
    let zones = index.ensure_zones().await?;
    let resolution = parse_resolution(field(&body, "resolution"), &index.resolutions())?;
    let seen = source.resolve(&state, &index).await?;
    let (cells, max_lifers) =
        tokio::task::spawn_blocking(move || index.grid_cells(&zones, &seen, resolution, &bbox))
            .await?;
    let cells: Vec<Value> = cells
        .into_iter()
        .map(|(h3, lifers)| json!({ "h3": h3, "lifers": lifers }))
        .collect();

    Ok(Json(json!({
        "resolution": resolution,
        "cells": cells,
        "maxLifers": max_lifers,
        "queryTime": query_time(start),
    })))
}

async fn grid_scale(State(state): State<SharedState>, body: Bytes) -> AppResult<Json<Value>> {
    let body = parse_json_body(&body, JSON_BODY_MESSAGE)?;
    let source = SpeciesSource::from_body(&state, &body).await?;
    let index = state.occurrences.get().await?;
    let zones = index.ensure_zones().await?;
    let seen = source.resolve(&state, &index).await?;
    let breaks =
        tokio::task::spawn_blocking(move || index.grid_quantiles(&zones, &seen, QUANTILE_BREAKS))
            .await?;
    let breaks_by_res: Map<String, Value> = breaks
        .into_iter()
        .map(|(res, values)| (res.to_string(), json!(values)))
        .collect();
    Ok(Json(json!({ "breaksByRes": breaks_by_res })))
}

async fn cells(State(state): State<SharedState>, body: Bytes) -> AppResult<Json<Value>> {
    let body = parse_json_body(&body, JSON_BODY_MESSAGE)?;
    let source = SpeciesSource::from_body(&state, &body).await?;
    let raw_cells = match field(&body, "cells") {
        Some(Value::Array(cells)) if !cells.is_empty() && cells.len() <= CELLS_MAX => cells,
        _ => {
            return Err(AppError::bad_request(
                "cells must be a non-empty array of at most 500 h3 strings",
            ));
        }
    };
    let cells: Vec<String> = raw_cells
        .iter()
        .map(|cell| {
            cell.as_str()
                .filter(|h| is_h3_index(h))
                .map(str::to_string)
                .ok_or_else(|| AppError::bad_request("each cell must be a 15-char hex h3 index"))
        })
        .collect::<AppResult<_>>()?;

    let index = state.occurrences.get().await?;
    let zones = index.ensure_zones().await?;
    let resolution = parse_resolution(field(&body, "resolution"), &index.resolutions())?;
    let seen = source.resolve(&state, &index).await?;
    let (cells, summary) =
        tokio::task::spawn_blocking(move || index.cells_info(&zones, &seen, resolution, &cells))
            .await?;
    Ok(Json(
        json!({ "resolution": resolution, "cells": cells, "summary": summary }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn region_names_walk_up_parents() {
        let names: HashMap<String, String> = [
            ("US".to_string(), "United States".to_string()),
            ("US-CA".to_string(), "California, US".to_string()),
        ]
        .into();
        assert_eq!(
            region_name_for("US-CA-001", &names),
            json!("California, US")
        );
        assert_eq!(region_name_for("US-NY", &names), json!("United States"));
        assert_eq!(region_name_for("MX-ROO", &names), Value::Null);
        assert_eq!(region_name_for("", &names), Value::Null);
    }

    #[test]
    fn species_input_parsing() {
        let parsed = parse_species_input(Some(
            &json!(["Turdus migratorius", {"code": "blujay", "sciName": 5}]),
        ))
        .unwrap();
        assert_eq!(
            parsed[0].to_json(),
            json!({ "sciName": "Turdus migratorius" })
        );
        assert_eq!(
            parsed[1].to_json(),
            json!({ "sciName": null, "commonName": null, "code": "blujay" })
        );
        assert!(parse_species_input(Some(&json!([]))).is_err());
        assert!(parse_species_input(Some(&json!([null]))).is_err());
        assert!(parse_species_input(Some(&json!([3]))).is_err());
    }
}
