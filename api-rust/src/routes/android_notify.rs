use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Json, Router};
use rusqlite::OptionalExtension;
use serde_json::{Value, json};

use crate::error::{AppError, AppResult};
use crate::http::field;
use crate::js::js_trim;
use crate::state::SharedState;
use crate::validators::is_email;

pub fn routes() -> Router<SharedState> {
    Router::new().route("/api/v1/android-notify", post(signup))
}

async fn signup(State(state): State<SharedState>, body: Bytes) -> AppResult<Response> {
    let body: Value = serde_json::from_slice(&body).map_err(AppError::internal)?;
    let email = field(&body, "email")
        .and_then(Value::as_str)
        .map(|e| js_trim(e).to_lowercase())
        .unwrap_or_default();
    if email.is_empty() || !is_email(&email) {
        return Ok((
            StatusCode::BAD_REQUEST,
            Json(json!({ "message": "A valid email address is required" })),
        )
            .into_response());
    }

    let already_signed_up = state
        .main
        .run(move |conn| {
            let existing = conn
                .query_row(
                    r#"select "id" from "android" where "email" = ?"#,
                    [&email],
                    |_| Ok(()),
                )
                .optional()?;
            if existing.is_some() {
                return Ok(true);
            }
            conn.execute(r#"insert into "android" ("email") values (?)"#, [&email])?;
            Ok(false)
        })
        .await?;

    let message = if already_signed_up {
        "You're already signed up!"
    } else {
        "You'll be notified when the Android version is available!"
    };
    Ok(Json(json!({ "success": true, "message": message })).into_response())
}
