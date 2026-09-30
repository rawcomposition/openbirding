mod admin;
mod android_notify;
mod backups;
mod best_hotspots;
mod hotspots;
mod packs;
mod regions;
mod reports;
mod species;
mod targets;
mod taxonomy;

use axum::extract::DefaultBodyLimit;
use axum::{Router, middleware};
use tower_http::trace::TraceLayer;

use crate::http::{cors, method_not_allowed_as_not_found, not_found};
use crate::state::SharedState;

const BODY_LIMIT_BYTES: usize = 50 * 1024 * 1024;

pub fn router(state: SharedState) -> Router {
    Router::new()
        .merge(packs::routes())
        .merge(backups::routes())
        .merge(reports::routes(state.clone()))
        .merge(targets::routes(state.clone()))
        .merge(best_hotspots::routes())
        .merge(hotspots::routes(state.clone()))
        .merge(species::routes(state.clone()))
        .merge(regions::routes())
        .merge(taxonomy::routes())
        .merge(android_notify::routes())
        .merge(admin::routes(state.clone()))
        .fallback(not_found)
        .layer(middleware::from_fn(method_not_allowed_as_not_found))
        .layer(DefaultBodyLimit::max(BODY_LIMIT_BYTES))
        .layer(middleware::from_fn_with_state(state.clone(), cors))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
