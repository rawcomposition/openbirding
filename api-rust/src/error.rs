use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde_json::json;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug)]
pub enum AppError {
    Http {
        status: StatusCode,
        message: String,
        user_facing: bool,
    },
    BasicAuth,
    Internal(String),
}

impl AppError {
    pub fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self::Http {
            status,
            message: message.into(),
            user_facing: false,
        }
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, message)
    }

    pub fn unauthorized() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "Unauthorized")
    }

    pub fn user(status: StatusCode, message: impl Into<String>) -> Self {
        Self::Http {
            status,
            message: message.into(),
            user_facing: true,
        }
    }

    pub fn internal(detail: impl std::fmt::Display) -> Self {
        Self::Internal(detail.to_string())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        match self {
            Self::Http {
                status,
                message,
                user_facing,
            } => {
                let body = if user_facing {
                    json!({ "message": message, "userMessage": message })
                } else {
                    json!({ "message": message })
                };
                (status, axum::Json(body)).into_response()
            }
            Self::BasicAuth => {
                let mut response = (StatusCode::UNAUTHORIZED, "Unauthorized").into_response();
                response.headers_mut().insert(
                    header::WWW_AUTHENTICATE,
                    HeaderValue::from_static("Basic realm=\"Secure Area\""),
                );
                response
            }
            Self::Internal(detail) => {
                tracing::error!("{detail}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    axum::Json(json!({ "message": "Internal Server Error" })),
                )
                    .into_response()
            }
        }
    }
}

macro_rules! internal_from {
    ($($source:ty),* $(,)?) => {
        $(impl From<$source> for AppError {
            fn from(err: $source) -> Self {
                Self::internal(err)
            }
        })*
    };
}

internal_from!(
    rusqlite::Error,
    r2d2::Error,
    reqwest::Error,
    std::io::Error,
    tokio::task::JoinError,
    serde_json::Error,
);
