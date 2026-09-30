use std::sync::LazyLock;

use axum::body::{Body, Bytes};
use axum::extract::{FromRequestParts, Request, State};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, header, request::Parts};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use base64::Engine;
use base64::engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig};
use regex::Regex;
use serde_json::{Value, json};
use subtle::ConstantTimeEq;

use crate::error::{AppError, AppResult};
use crate::state::SharedState;

const ALLOWED_METHODS: &str = "GET,HEAD,PUT,POST,DELETE,PATCH";
const BASIC_AUTH_USER: &str = "admin";

static BASIC_CREDENTIALS_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^ *(?:[Bb][Aa][Ss][Ii][Cc]) +([A-Za-z0-9._~+/-]+=*) *$").unwrap()
});
static HEADER_LIST_SEPARATOR_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\s*,\s*").unwrap());
static BASE64: LazyLock<GeneralPurpose> = LazyLock::new(|| {
    GeneralPurpose::new(
        &base64::alphabet::STANDARD,
        GeneralPurposeConfig::new().with_decode_padding_mode(DecodePaddingMode::Indifferent),
    )
});

pub struct QueryParams(Vec<(String, String)>);

impl QueryParams {
    pub fn parse(query: Option<&str>) -> Self {
        Self(
            query
                .map(|q| form_urlencoded::parse(q.as_bytes()).into_owned().collect())
                .unwrap_or_default(),
        )
    }

    pub fn get(&self, key: &str) -> Option<&str> {
        self.0
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.as_str())
    }

    pub fn value(&self, key: &str) -> Option<Value> {
        self.get(key).map(|v| Value::String(v.to_string()))
    }
}

impl<S: Send + Sync> FromRequestParts<S> for QueryParams {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        Ok(Self::parse(parts.uri.query()))
    }
}

pub fn parse_json_body(body: &Bytes, message: &str) -> AppResult<Value> {
    serde_json::from_slice(body).map_err(|_| AppError::bad_request(message))
}

pub fn field<'a>(body: &'a Value, key: &str) -> Option<&'a Value> {
    body.as_object().and_then(|object| object.get(key))
}

pub fn json_with_cache(value: Value, cache_control: &'static str) -> Response {
    let mut response = axum::Json(value).into_response();
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static(cache_control),
    );
    response
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && bool::from(a.ct_eq(b))
}

pub fn check_cron_secret(
    secret: Option<&str>,
    headers: &HeaderMap,
    query: &QueryParams,
) -> AppResult<()> {
    let Some(secret) = secret else {
        return Err(AppError::unauthorized());
    };
    let bearer = format!("Bearer {secret}");
    let header_matches = headers
        .get(header::AUTHORIZATION)
        .is_some_and(|value| constant_time_eq(value.as_bytes(), bearer.as_bytes()));
    let key_matches = query
        .get("key")
        .is_some_and(|key| constant_time_eq(key.as_bytes(), secret.as_bytes()));
    if header_matches || key_matches {
        Ok(())
    } else {
        Err(AppError::unauthorized())
    }
}

fn basic_credentials(headers: &HeaderMap) -> Option<(String, String)> {
    let authorization = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    let encoded = BASIC_CREDENTIALS_RE
        .captures(authorization)?
        .get(1)?
        .as_str();
    let decoded = String::from_utf8(BASE64.decode(encoded).ok()?).ok()?;
    let (user, pass) = decoded.split_once(':')?;
    Some((user.to_string(), pass.to_string()))
}

pub async fn require_cron_secret(
    State(state): State<SharedState>,
    request: Request,
    next: Next,
) -> Response {
    let query = QueryParams::parse(request.uri().query());
    match check_cron_secret(
        state.config.cron_secret.as_deref(),
        request.headers(),
        &query,
    ) {
        Ok(()) => next.run(request).await,
        Err(err) => err.into_response(),
    }
}

pub async fn require_reports_auth(
    State(state): State<SharedState>,
    request: Request,
    next: Next,
) -> Response {
    let authorized = match (
        &state.config.reports_pass,
        basic_credentials(request.headers()),
    ) {
        (Some(expected), Some((user, pass))) => {
            let user_ok = constant_time_eq(user.as_bytes(), BASIC_AUTH_USER.as_bytes());
            let pass_ok = constant_time_eq(pass.as_bytes(), expected.as_bytes());
            user_ok & pass_ok
        }
        _ => false,
    };
    if authorized {
        next.run(request).await
    } else {
        AppError::BasicAuth.into_response()
    }
}

pub async fn require_targets_db(
    State(state): State<SharedState>,
    request: Request,
    next: Next,
) -> Response {
    if state.targets.current().is_none() {
        return AppError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "Targets database unavailable",
        )
        .into_response();
    }
    next.run(request).await
}

pub fn not_found_response() -> Response {
    (
        StatusCode::NOT_FOUND,
        axum::Json(json!({ "message": "Not Found" })),
    )
        .into_response()
}

pub async fn not_found() -> Response {
    not_found_response()
}

pub async fn method_not_allowed_as_not_found(request: Request, next: Next) -> Response {
    let response = next.run(request).await;
    if response.status() == StatusCode::METHOD_NOT_ALLOWED {
        not_found_response()
    } else {
        response
    }
}

pub async fn cors(State(state): State<SharedState>, request: Request, next: Next) -> Response {
    let origin = request
        .headers()
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let allowed_origin = state
        .config
        .cors_origins
        .contains(&origin)
        .then_some(origin);
    let vary = request
        .headers()
        .get(header::VARY)
        .cloned()
        .unwrap_or(HeaderValue::from_static("Origin"));
    let is_preflight = request.method() == Method::OPTIONS;
    let requested_headers = request
        .headers()
        .get(header::ACCESS_CONTROL_REQUEST_HEADERS)
        .and_then(|v| v.to_str().ok())
        .filter(|v| !v.is_empty())
        .map(|v| {
            HEADER_LIST_SEPARATOR_RE
                .split(v)
                .collect::<Vec<_>>()
                .join(",")
        });

    let mut response = if is_preflight {
        let mut preflight = Response::new(Body::empty());
        *preflight.status_mut() = StatusCode::NO_CONTENT;
        preflight
    } else {
        next.run(request).await
    };

    let headers = response.headers_mut();
    if let Some(origin) = allowed_origin.and_then(|o| HeaderValue::from_str(&o).ok()) {
        headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin);
    }
    headers.insert(header::VARY, vary);
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_CREDENTIALS,
        HeaderValue::from_static("true"),
    );
    if is_preflight {
        headers.insert(
            header::ACCESS_CONTROL_ALLOW_METHODS,
            HeaderValue::from_static(ALLOWED_METHODS),
        );
        if let Some(value) = requested_headers.and_then(|v| HeaderValue::from_str(&v).ok()) {
            headers.insert(header::ACCESS_CONTROL_ALLOW_HEADERS, value);
            headers.append(
                header::VARY,
                HeaderValue::from_static("Access-Control-Request-Headers"),
            );
        }
        headers.remove(header::CONTENT_LENGTH);
        headers.remove(header::CONTENT_TYPE);
    }
    response
}

pub fn escape_html(raw: &str) -> String {
    let mut escaped = String::with_capacity(raw.len());
    for c in raw.chars() {
        match c {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            _ => escaped.push(c),
        }
    }
    escaped
}

pub fn html(body: String) -> Response {
    let mut response = body.into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/html; charset=UTF-8"),
    );
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cron_secret_rejects_when_unset() {
        let headers = HeaderMap::new();
        assert!(check_cron_secret(None, &headers, &QueryParams::parse(Some("key="))).is_err());
        assert!(
            check_cron_secret(
                Some("s3cret"),
                &headers,
                &QueryParams::parse(Some("key=s3cret"))
            )
            .is_ok()
        );
        let mut bearer = HeaderMap::new();
        bearer.insert(
            header::AUTHORIZATION,
            HeaderValue::from_static("Bearer s3cret"),
        );
        assert!(check_cron_secret(Some("s3cret"), &bearer, &QueryParams::parse(None)).is_ok());
        assert!(check_cron_secret(Some("other"), &bearer, &QueryParams::parse(None)).is_err());
    }

    #[test]
    fn basic_credentials_parse_like_hono() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_static("basic YWRtaW46cDphc3M"),
        );
        assert_eq!(
            basic_credentials(&headers),
            Some(("admin".into(), "p:ass".into()))
        );
    }

    #[test]
    fn html_is_escaped() {
        assert_eq!(
            escape_html("<a href=\"x\">&'"),
            "&lt;a href=&quot;x&quot;&gt;&amp;&#39;"
        );
    }
}
