use axum::Router;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderValue, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;

use crate::ebird::taxonomy;
use crate::error::{AppError, AppResult};
use crate::state::SharedState;

pub fn routes() -> Router<SharedState> {
    Router::new().route("/api/v1/taxonomy", get(get_taxonomy))
}

fn json_bytes(body: Bytes) -> Response {
    let mut response = body.into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    response
}

async fn get_taxonomy(State(state): State<SharedState>) -> AppResult<Response> {
    if let Some(cached) = state.taxonomy.get() {
        return Ok(json_bytes(cached));
    }
    let entries = taxonomy(&state.http, state.config.ebird_api_key.as_deref())
        .await
        .map_err(AppError::internal)?;
    let body = Bytes::from(serde_json::to_vec(&entries)?);
    state.taxonomy.set(body.clone());
    Ok(json_bytes(body))
}
