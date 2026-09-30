use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{any, post};
use axum::{Json, Router, middleware};
use serde_json::Value;

use crate::http::{not_found, require_cron_secret};
use crate::state::SharedState;

pub fn routes(state: SharedState) -> Router<SharedState> {
    Router::new()
        .route("/api/v1/admin/swap-targets-db", post(swap_targets_db))
        .route(
            "/api/v1/admin/swap-occurrences-db",
            post(swap_occurrences_db),
        )
        .route("/api/v1/admin", any(not_found))
        .route("/api/v1/admin/{*rest}", any(not_found))
        .layer(middleware::from_fn_with_state(state, require_cron_secret))
}

fn swap_response((ok, body): (bool, Value)) -> Response {
    let status = if ok {
        StatusCode::OK
    } else {
        StatusCode::BAD_REQUEST
    };
    (status, Json(body)).into_response()
}

async fn swap_targets_db(State(state): State<SharedState>) -> Response {
    swap_response(state.targets.swap().await)
}

async fn swap_occurrences_db(State(state): State<SharedState>) -> Response {
    swap_response(state.occurrences.swap().await)
}
