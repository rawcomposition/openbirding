use std::collections::{BTreeSet, HashMap};

use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::routing::{get, post};
use axum::{Json, Router};
use rusqlite::{OptionalExtension, params, params_from_iter};
use serde_json::{Value, json};

use crate::ebird::hotspots_for_region;
use crate::error::{AppError, AppResult};
use crate::js::{parse_int, sql_to_json, sql_to_string};
use crate::state::SharedState;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/api/v1/packs", get(list_packs))
        .route("/api/v1/packs/{id}", get(download_pack))
        .route("/api/v1/packs/{id}/log-download", post(log_download))
}

async fn list_packs(State(state): State<SharedState>) -> AppResult<Json<Value>> {
    let packs = state
        .main
        .run(|conn| {
            let mut clusters: HashMap<i64, Vec<Value>> = HashMap::new();
            let mut stmt = conn.prepare(r#"select "pack_id", "lat", "lng" from "clusters""#)?;
            let mut rows = stmt.query([])?;
            while let Some(row) = rows.next()? {
                let pack_id: i64 = row.get(0)?;
                clusters.entry(pack_id).or_default().push(json!([sql_to_json(row.get_ref(1)?), sql_to_json(row.get_ref(2)?)]));
            }

            let mut stmt = conn.prepare(
                r#"select "packs"."id", "packs"."hotspots", "regions"."long_name", "packs"."region", "packs"."center_lat", "packs"."center_lng"
                   from "packs" inner join "regions" on "packs"."region" = "regions"."id"
                   order by "regions"."long_name" asc"#,
            )?;
            let packs = stmt
                .query_map([], |row| {
                    let id: i64 = row.get(0)?;
                    Ok(json!({
                        "id": id,
                        "hotspots": sql_to_json(row.get_ref(1)?),
                        "region": sql_to_json(row.get_ref(3)?),
                        "name": sql_to_json(row.get_ref(2)?),
                        "lat": sql_to_json(row.get_ref(4)?),
                        "lng": sql_to_json(row.get_ref(5)?),
                        "clusters": clusters.get(&id).cloned().unwrap_or_default(),
                    }))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(packs)
        })
        .await?;
    Ok(Json(Value::Array(packs)))
}

struct DownloadHeaders {
    app_version: Option<String>,
    app_platform: Option<String>,
    app_environment: Option<String>,
    method: Option<String>,
    user_agent: Option<String>,
}

impl DownloadHeaders {
    fn from(headers: &HeaderMap) -> Self {
        let text = |name: &str| {
            headers
                .get(name)
                .map(|v| String::from_utf8_lossy(v.as_bytes()).into_owned())
                .filter(|v| !v.is_empty())
        };
        Self {
            app_version: text("App-Version"),
            app_platform: text("App-Platform"),
            app_environment: text("App-Environment"),
            method: text("Download-Method"),
            user_agent: text("User-Agent"),
        }
    }
}

async fn record_download(
    state: &SharedState,
    raw_id: &str,
    headers: &HeaderMap,
) -> AppResult<String> {
    let pack_id =
        parse_int(raw_id).ok_or_else(|| AppError::bad_request("Pack ID must be a valid number"))?;
    let download = DownloadHeaders::from(headers);
    state
        .main
        .run(move |conn| {
            let pack = conn
                .query_row(r#"select "id", "region" from "packs" where "id" = ?"#, [pack_id], |row| {
                    Ok((sql_to_json(row.get_ref(0)?), sql_to_string(row.get_ref(1)?)))
                })
                .optional()?;
            let Some((id, region)) = pack else {
                return Err(AppError::not_found("Pack not found"));
            };
            conn.execute(
                r#"insert into "pack_downloads" ("pack_id", "pack_region", "method", "app_version", "app_platform", "app_environment", "user_agent")
                   values (?, ?, ?, ?, ?, ?, ?)"#,
                params![
                    id.as_i64(),
                    region,
                    download.method,
                    download.app_version,
                    download.app_platform,
                    download.app_environment,
                    download.user_agent
                ],
            )?;
            Ok(region)
        })
        .await
}

async fn download_pack(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> AppResult<Json<Value>> {
    let region = record_download(&state, &id, &headers).await?;
    let hotspots = hotspots_for_region(&state.http, state.config.ebird_api_key.as_deref(), &region)
        .await
        .map_err(AppError::internal)?;

    let region_codes: BTreeSet<String> = hotspots
        .iter()
        .flat_map(|h| [&h.country_code, &h.subnational1_code, &h.subnational2_code])
        .flatten()
        .cloned()
        .collect();
    let region_names: HashMap<String, String> = if region_codes.is_empty() {
        HashMap::new()
    } else {
        state
            .main
            .run(move |conn| {
                let placeholders = vec!["?"; region_codes.len()].join(", ");
                let mut stmt = conn.prepare(&format!(
                    r#"select "id", "name" from "regions" where "id" in ({placeholders})"#
                ))?;
                let names = stmt
                    .query_map(params_from_iter(region_codes.iter()), |row| {
                        Ok((
                            sql_to_string(row.get_ref(0)?),
                            sql_to_string(row.get_ref(1)?),
                        ))
                    })?
                    .collect::<rusqlite::Result<Vec<_>>>()?;
                Ok(names
                    .into_iter()
                    .filter(|(_, name)| !name.is_empty())
                    .collect())
            })
            .await?
    };

    let name_for = |code: &Option<String>| -> Value {
        code.as_ref().map_or(Value::Null, |c| {
            Value::String(region_names.get(c).unwrap_or(c).clone())
        })
    };
    let items: Vec<Value> = hotspots
        .iter()
        .map(|h| {
            json!({
                "id": h.location_id,
                "name": h.name,
                "species": h.total,
                "lat": h.lat,
                "lng": h.lng,
                "country": h.country_code,
                "state": h.subnational1_code,
                "county": h.subnational2_code,
                "countryName": name_for(&h.country_code),
                "stateName": name_for(&h.subnational1_code),
                "countyName": name_for(&h.subnational2_code),
            })
        })
        .collect();
    Ok(Json(json!({ "hotspots": items })))
}

async fn log_download(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> AppResult<Json<Value>> {
    record_download(&state, &id, &headers).await?;
    Ok(Json(json!({ "success": true })))
}
