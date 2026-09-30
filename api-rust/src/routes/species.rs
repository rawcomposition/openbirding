use axum::extract::State;
use axum::routing::{any, get};
use axum::{Json, Router, middleware};
use serde_json::{Value, json};

use crate::error::AppResult;
use crate::http::{QueryParams, not_found, require_targets_db};
use crate::js::{js_trim, sql_to_json};
use crate::state::SharedState;

use super::regions::{fts_prefix_query, strip_fts_specials};

const SEARCH_LIMIT: usize = 20;

pub fn routes(state: SharedState) -> Router<SharedState> {
    Router::new()
        .route("/api/v1/species/search", get(search_species))
        .route("/api/v1/species", any(not_found))
        .route("/api/v1/species/{*rest}", any(not_found))
        .layer(middleware::from_fn_with_state(state, require_targets_db))
}

async fn search_species(
    State(state): State<SharedState>,
    query: QueryParams,
) -> AppResult<Json<Value>> {
    let empty = || Json(json!({ "species": [] }));
    let Some(q) = query
        .get("q")
        .filter(|q| js_trim(q).encode_utf16().count() >= 2)
    else {
        return Ok(empty());
    };
    let escaped = strip_fts_specials(q);
    if escaped.encode_utf16().count() < 2 {
        return Ok(empty());
    }
    let fts_query = fts_prefix_query(&escaped);
    let targets = state.targets.require()?;
    let species = targets
        .run(move |conn, _| {
            let mut stmt = conn.prepare(&format!(
                r#"SELECT s.code, s.name, s.sci_name as "sciName"
                   FROM species_fts fts
                   JOIN species s ON s.id = fts.rowid
                   WHERE species_fts MATCH ?
                   ORDER BY s.taxon_order ASC
                   LIMIT {SEARCH_LIMIT}"#
            ))?;
            let species = stmt
                .query_map([fts_query], |row| {
                    Ok(json!({
                        "code": sql_to_json(row.get_ref(0)?),
                        "name": sql_to_json(row.get_ref(1)?),
                        "sciName": sql_to_json(row.get_ref(2)?),
                    }))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(species)
        })
        .await?;
    Ok(Json(json!({ "species": species })))
}
