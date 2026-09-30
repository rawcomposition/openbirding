use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{Map, Value, json};

use crate::error::AppResult;
use crate::http::QueryParams;
use crate::js::{sql_to_json, sql_to_string};
use crate::state::SharedState;

const SEARCH_LIMIT: usize = 20;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/api/v1/regions", get(all_regions))
        .route("/api/v1/regions/search", get(search_regions))
}

pub fn strip_fts_specials(raw: &str) -> String {
    let stripped: String = raw
        .chars()
        .filter(|c| !matches!(c, '\'' | '"' | '*' | '(' | ')'))
        .collect();
    crate::js::js_trim(&stripped).to_string()
}

pub fn fts_prefix_query(escaped: &str) -> String {
    format!("\"{escaped}\"*")
}

async fn all_regions(State(state): State<SharedState>) -> AppResult<Json<Value>> {
    let regions = state
        .main
        .run(|conn| {
            let mut stmt = conn.prepare(r#"select "id", "name" from "regions""#)?;
            let mut rows = stmt.query([])?;
            let mut regions = Map::new();
            while let Some(row) = rows.next()? {
                regions.insert(sql_to_string(row.get_ref(0)?), sql_to_json(row.get_ref(1)?));
            }
            Ok(regions)
        })
        .await?;
    Ok(Json(Value::Object(regions)))
}

async fn search_regions(
    State(state): State<SharedState>,
    query: QueryParams,
) -> AppResult<Json<Value>> {
    let Some(q) = query.get("q").filter(|q| q.encode_utf16().count() >= 2) else {
        return Ok(Json(json!({ "regions": [] })));
    };
    let fts_query = fts_prefix_query(&strip_fts_specials(q));
    let regions = state
        .main
        .run(move |conn| {
            let mut stmt = conn.prepare(&format!(
                r#"SELECT r.id, r.name, r.long_name as "longName"
                   FROM regions_fts fts
                   JOIN regions r ON r.rowid = fts.rowid
                   WHERE regions_fts MATCH ?
                   ORDER BY r.level ASC, r.name ASC
                   LIMIT {SEARCH_LIMIT}"#
            ))?;
            let regions = stmt
                .query_map([fts_query], |row| {
                    Ok(json!({
                        "id": sql_to_json(row.get_ref(0)?),
                        "name": sql_to_json(row.get_ref(1)?),
                        "longName": sql_to_json(row.get_ref(2)?),
                    }))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(regions)
        })
        .await?;
    Ok(Json(json!({ "regions": regions })))
}
