use std::collections::HashSet;
use std::sync::LazyLock;

use regex::Regex;
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::js::{is_integer, is_nullish, js_trim, str_to_number, to_js_string, to_number};

const LIMIT_DEFAULT: f64 = 200.0;
const LOCATION_IDS_MAX: usize = 500;
const H3_CELLS_MAX: usize = 3000;
const REGION_CODES_MAX: usize = 20;
const BEST_HOTSPOTS_LIMIT_DEFAULT: f64 = 100.0;
const BEST_HOTSPOTS_LIMIT_MAX: f64 = 500.0;
const FREQUENCY_DEFAULT: f64 = 0.05;
const MIN_CHECKLISTS_DEFAULT: f64 = 30.0;

static REGION_CODE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[A-Z]{2}(?:-[A-Z0-9]{1,3}){0,2}$").unwrap());
static LOCATION_ID_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^L\d+$").unwrap());
static H3_INDEX_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[0-9a-f]{15}$").unwrap());
static TOKEN_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$").unwrap()
});
static EMAIL_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[^\s@]+@[^\s@]+\.[^\s@]+$").unwrap());

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BoundingBox {
    pub min_lng: f64,
    pub min_lat: f64,
    pub max_lng: f64,
    pub max_lat: f64,
}

pub fn is_location_id(id: &str) -> bool {
    LOCATION_ID_RE.is_match(id)
}

pub fn is_h3_index(cell: &str) -> bool {
    H3_INDEX_RE.is_match(cell)
}

pub fn is_token(token: &str) -> bool {
    TOKEN_RE.is_match(token)
}

pub fn is_email(email: &str) -> bool {
    EMAIL_RE.is_match(email)
}

fn dedupe_sorted_numbers(values: impl Iterator<Item = f64>) -> Vec<f64> {
    let mut months: Vec<f64> = Vec::new();
    for value in values {
        let seen = months
            .iter()
            .any(|m| m == &value || (m.is_nan() && value.is_nan()));
        if !seen {
            months.push(value);
        }
    }
    months.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    months
}

pub fn parse_months_param(raw: Option<&str>) -> AppResult<Option<Vec<f64>>> {
    let Some(raw) = raw.filter(|r| !r.is_empty()) else {
        return Ok(None);
    };
    let months = dedupe_sorted_numbers(raw.split(',').map(str_to_number));
    if months.iter().any(|m| m.is_nan() || *m < 1.0 || *m > 12.0) {
        return Err(AppError::bad_request(
            "months must be comma-separated values between 1 and 12",
        ));
    }
    Ok(Some(months))
}

pub fn parse_months_body(value: Option<&Value>) -> AppResult<Option<Vec<f64>>> {
    if is_nullish(value) {
        return Ok(None);
    }
    match value {
        Some(array @ Value::Array(items)) if !items.is_empty() => {
            parse_months_param(Some(&to_js_string(array)))
        }
        _ => Err(AppError::bad_request(
            "months must be a non-empty array of values between 1 and 12",
        )),
    }
}

pub fn parse_h3_cells(value: Option<&Value>) -> AppResult<Vec<i64>> {
    let items = match value {
        Some(Value::Array(items)) if !items.is_empty() => items,
        _ => {
            return Err(AppError::bad_request(
                "cells must be a non-empty array of H3 cell indexes",
            ));
        }
    };
    if items.len() > H3_CELLS_MAX {
        return Err(AppError::bad_request(format!(
            "cells cannot contain more than {H3_CELLS_MAX} cells — use an eBird region for areas this large"
        )));
    }
    let mut seen = HashSet::with_capacity(items.len());
    let mut cells = Vec::with_capacity(items.len());
    for item in items {
        let cell = item
            .as_str()
            .map(|s| js_trim(s).to_lowercase())
            .unwrap_or_default();
        if !is_h3_index(&cell) {
            return Err(AppError::bad_request(
                "cells must contain H3 cell indexes like 86be8d92fffffff",
            ));
        }
        let parsed = i64::from_str_radix(&cell, 16).map_err(AppError::internal)?;
        if seen.insert(parsed) {
            cells.push(parsed);
        }
    }
    Ok(cells)
}

pub fn parse_region_codes(raw: &str) -> AppResult<Vec<String>> {
    let raw_codes: Vec<String> = raw
        .split(',')
        .map(|s| js_trim(s).to_uppercase())
        .filter(|s| !s.is_empty())
        .collect();
    if raw_codes.is_empty() {
        return Err(AppError::bad_request(
            "At least one region code is required",
        ));
    }
    if raw_codes.len() > REGION_CODES_MAX {
        return Err(AppError::bad_request("Maximum 20 region codes allowed"));
    }
    if raw_codes.iter().any(|code| !REGION_CODE_RE.is_match(code)) {
        return Err(AppError::bad_request(
            "regionCode must be comma-separated eBird region codes like US, US-CA, or US-CA-065",
        ));
    }
    let mut sorted: Vec<String> = raw_codes
        .into_iter()
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect();
    sorted.sort_by(|a, b| a.len().cmp(&b.len()).then_with(|| a.cmp(b)));
    let mut region_codes: Vec<String> = Vec::new();
    for code in sorted {
        let covered_by_parent = region_codes
            .iter()
            .any(|parent| code.starts_with(&format!("{parent}-")));
        if !covered_by_parent {
            region_codes.push(code);
        }
    }
    Ok(region_codes)
}

pub fn parse_limit(value: Option<&Value>) -> AppResult<f64> {
    let normalized = if is_nullish(value) {
        LIMIT_DEFAULT
    } else {
        to_number(value)
    };
    if !is_integer(normalized) || normalized < 1.0 {
        return Err(AppError::bad_request("limit must be a positive number"));
    }
    Ok(normalized)
}

pub fn parse_month(value: Option<&Value>) -> AppResult<Option<f64>> {
    if is_nullish(value) {
        return Ok(None);
    }
    let month = to_number(value);
    if !is_integer(month) || !(1.0..=12.0).contains(&month) {
        return Err(AppError::bad_request("month must be between 1 and 12"));
    }
    Ok(Some(month))
}

pub fn parse_min_observations(value: Option<&Value>) -> AppResult<Option<f64>> {
    if is_nullish(value) {
        return Ok(None);
    }
    let min_observations = to_number(value);
    if !is_integer(min_observations) || min_observations < 1.0 {
        return Err(AppError::bad_request(
            "minObservations must be a positive number",
        ));
    }
    Ok(Some(min_observations))
}

pub fn parse_min_count(value: Option<&str>, name: &str) -> AppResult<Option<f64>> {
    let Some(value) = value else {
        return Ok(None);
    };
    let min_count = str_to_number(value);
    if !is_integer(min_count) || min_count < 0.0 {
        return Err(AppError::bad_request(format!(
            "{name} must be a non-negative integer"
        )));
    }
    Ok(Some(min_count))
}

pub fn parse_bbox_param(value: Option<&str>) -> AppResult<Option<BoundingBox>> {
    let Some(value) = value.filter(|v| !v.is_empty()) else {
        return Ok(None);
    };
    let parts: Vec<f64> = value.split(',').map(str_to_number).collect();
    if parts.len() != 4 || parts.iter().any(|p| p.is_nan()) {
        return Err(AppError::bad_request(
            "bbox must be minLng,minLat,maxLng,maxLat",
        ));
    }
    Ok(Some(BoundingBox {
        min_lng: parts[0],
        min_lat: parts[1],
        max_lng: parts[2],
        max_lat: parts[3],
    }))
}

pub fn parse_bbox_body(value: Option<&Value>) -> AppResult<Option<BoundingBox>> {
    if is_nullish(value) {
        return Ok(None);
    }
    let invalid =
        || AppError::bad_request("bbox must be an object with minLng,minLat,maxLng,maxLat");
    let field = |name: &str| match value {
        Some(Value::Object(map)) => to_number(map.get(name)),
        _ => f64::NAN,
    };
    if !matches!(value, Some(Value::Object(_) | Value::Array(_))) {
        return Err(invalid());
    }
    let bbox = BoundingBox {
        min_lng: field("minLng"),
        min_lat: field("minLat"),
        max_lng: field("maxLng"),
        max_lat: field("maxLat"),
    };
    if [bbox.min_lng, bbox.min_lat, bbox.max_lng, bbox.max_lat]
        .iter()
        .any(|p| p.is_nan())
    {
        return Err(invalid());
    }
    Ok(Some(bbox))
}

pub fn parse_location_ids(value: Option<&Value>) -> AppResult<Option<Vec<String>>> {
    if is_nullish(value) {
        return Ok(None);
    }
    let Some(Value::Array(items)) = value else {
        return Err(AppError::bad_request(
            "locationIds must be an array of hotspot IDs",
        ));
    };
    if items.is_empty() {
        return Err(AppError::bad_request(
            "locationIds must contain at least one hotspot ID",
        ));
    }
    if items.len() > LOCATION_IDS_MAX {
        return Err(AppError::bad_request(format!(
            "locationIds cannot contain more than {LOCATION_IDS_MAX} hotspots"
        )));
    }
    let mut seen = HashSet::with_capacity(items.len());
    let mut location_ids = Vec::with_capacity(items.len());
    for item in items {
        let Some(raw) = item.as_str().filter(|s| !js_trim(s).is_empty()) else {
            return Err(AppError::bad_request(
                "locationIds must be an array of hotspot IDs",
            ));
        };
        let location_id = js_trim(raw).to_uppercase();
        if !is_location_id(&location_id) {
            return Err(AppError::bad_request(
                "locationIds must contain hotspot IDs like L12345",
            ));
        }
        if seen.insert(location_id.clone()) {
            location_ids.push(location_id);
        }
    }
    Ok(Some(location_ids))
}

pub fn parse_location_ids_body(value: Option<&Value>) -> AppResult<Vec<String>> {
    parse_location_ids(value)?
        .ok_or_else(|| AppError::bad_request("locationIds must contain at least one hotspot ID"))
}

pub fn parse_frequency(value: Option<&Value>) -> AppResult<f64> {
    if is_nullish(value) {
        return Ok(FREQUENCY_DEFAULT);
    }
    let n = to_number(value);
    if n.is_nan() || n < 0.0 {
        return Err(AppError::bad_request(
            "frequency must be a non-negative number",
        ));
    }
    Ok(if n > 1.0 { n / 100.0 } else { n })
}

pub fn parse_min_checklists(value: Option<&Value>) -> AppResult<f64> {
    if is_nullish(value) {
        return Ok(MIN_CHECKLISTS_DEFAULT);
    }
    let n = to_number(value);
    if !is_integer(n) || n < 1.0 {
        return Err(AppError::bad_request(
            "minChecklists must be a positive integer",
        ));
    }
    Ok(n)
}

pub fn parse_best_hotspots_limit(value: Option<&Value>) -> AppResult<usize> {
    if is_nullish(value) {
        return Ok(BEST_HOTSPOTS_LIMIT_DEFAULT as usize);
    }
    let n = to_number(value);
    if !is_integer(n) || n < 1.0 || n > BEST_HOTSPOTS_LIMIT_MAX {
        return Err(AppError::bad_request(format!(
            "limit must be an integer between 1 and {BEST_HOTSPOTS_LIMIT_MAX}"
        )));
    }
    Ok(n as usize)
}

pub fn parse_resolution(value: Option<&Value>, allowed: &[i64]) -> AppResult<i64> {
    let n = to_number(value);
    if !is_integer(n) || !allowed.iter().any(|&res| res as f64 == n) {
        let list = allowed
            .iter()
            .map(i64::to_string)
            .collect::<Vec<_>>()
            .join(", ");
        return Err(AppError::bad_request(format!(
            "resolution must be one of {list}"
        )));
    }
    Ok(n as i64)
}

pub fn parse_token(value: &str) -> AppResult<String> {
    if !is_token(value) {
        return Err(AppError::bad_request("listToken must be a UUID"));
    }
    Ok(value.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn message(err: AppError) -> String {
        match err {
            AppError::Http { message, .. } => message,
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn months_param_dedupes_and_sorts() {
        assert_eq!(
            parse_months_param(Some("5,3,5")).unwrap(),
            Some(vec![3.0, 5.0])
        );
        assert_eq!(parse_months_param(Some("")).unwrap(), None);
        assert_eq!(parse_months_param(None).unwrap(), None);
        assert!(parse_months_param(Some("0")).is_err());
        assert!(parse_months_param(Some("1,,2")).is_err());
        assert!(parse_months_param(Some("x")).is_err());
    }

    #[test]
    fn months_body_joins_like_js() {
        assert_eq!(
            parse_months_body(Some(&json!([4, "2"]))).unwrap(),
            Some(vec![2.0, 4.0])
        );
        assert_eq!(
            parse_months_body(Some(&json!([[1, 2]]))).unwrap(),
            Some(vec![1.0, 2.0])
        );
        assert_eq!(parse_months_body(Some(&json!(null))).unwrap(), None);
        assert_eq!(
            message(parse_months_body(Some(&json!([]))).unwrap_err()),
            "months must be a non-empty array of values between 1 and 12"
        );
        assert!(parse_months_body(Some(&json!("3"))).is_err());
    }

    #[test]
    fn h3_cells_are_validated_and_deduped() {
        let cells = parse_h3_cells(Some(&json!([" 86BE8D92FFFFFFF", "86be8d92fffffff"]))).unwrap();
        assert_eq!(cells, vec![0x86be8d92fffffff]);
        assert!(parse_h3_cells(Some(&json!([]))).is_err());
        assert!(parse_h3_cells(Some(&json!([123]))).is_err());
        let too_many: Vec<String> = (0..3001)
            .map(|i| format!("{:015x}", 0x860000000000000u64 + i))
            .collect();
        assert!(
            message(parse_h3_cells(Some(&json!(too_many))).unwrap_err()).contains("more than 3000")
        );
    }

    #[test]
    fn region_codes_drop_covered_children() {
        assert_eq!(
            parse_region_codes("us-ca, US ,US-NY-061,CA").unwrap(),
            vec!["CA", "US"]
        );
        assert_eq!(
            parse_region_codes("US-CA-065,US-CA").unwrap(),
            vec!["US-CA"]
        );
        assert!(parse_region_codes(" , ").is_err());
        assert!(parse_region_codes("USA").is_err());
        let many = (0..21)
            .map(|i| format!("US-{i}"))
            .collect::<Vec<_>>()
            .join(",");
        assert_eq!(
            message(parse_region_codes(&many).unwrap_err()),
            "Maximum 20 region codes allowed"
        );
    }

    #[test]
    fn numeric_params() {
        assert_eq!(parse_limit(None).unwrap(), 200.0);
        assert_eq!(parse_limit(Some(&json!("15"))).unwrap(), 15.0);
        assert!(parse_limit(Some(&json!("1.5"))).is_err());
        assert!(parse_limit(Some(&json!(0))).is_err());
        assert_eq!(parse_month(Some(&json!("12"))).unwrap(), Some(12.0));
        assert!(parse_month(Some(&json!("13"))).is_err());
        assert_eq!(parse_min_count(Some(""), "minSpecies").unwrap(), Some(0.0));
        assert_eq!(
            message(parse_min_count(Some("-1"), "minSpecies").unwrap_err()),
            "minSpecies must be a non-negative integer"
        );
        assert_eq!(parse_frequency(Some(&json!(10))).unwrap(), 0.1);
        assert_eq!(parse_frequency(Some(&json!(0.2))).unwrap(), 0.2);
        assert_eq!(parse_min_checklists(None).unwrap(), 30.0);
        assert_eq!(parse_best_hotspots_limit(Some(&json!(500))).unwrap(), 500);
        assert!(parse_best_hotspots_limit(Some(&json!(501))).is_err());
        assert_eq!(parse_resolution(Some(&json!("4")), &[3, 4]).unwrap(), 4);
        assert_eq!(
            message(parse_resolution(None, &[3, 4]).unwrap_err()),
            "resolution must be one of 3, 4"
        );
    }

    #[test]
    fn bboxes() {
        let bbox = parse_bbox_param(Some("-10,20,30,40")).unwrap().unwrap();
        assert_eq!(
            bbox,
            BoundingBox {
                min_lng: -10.0,
                min_lat: 20.0,
                max_lng: 30.0,
                max_lat: 40.0
            }
        );
        assert!(parse_bbox_param(Some("1,2,3")).is_err());
        assert_eq!(
            parse_bbox_body(Some(
                &json!({"minLng": "1", "minLat": null, "maxLng": 3, "maxLat": 4})
            ))
            .unwrap(),
            Some(BoundingBox {
                min_lng: 1.0,
                min_lat: 0.0,
                max_lng: 3.0,
                max_lat: 4.0
            })
        );
        assert!(parse_bbox_body(Some(&json!({"minLng": 1}))).is_err());
        assert!(parse_bbox_body(Some(&json!("x"))).is_err());
        assert!(parse_bbox_body(Some(&json!([1, 2, 3, 4]))).is_err());
    }

    #[test]
    fn location_ids() {
        assert_eq!(
            parse_location_ids(Some(&json!([" l1", "L1", "L22"]))).unwrap(),
            Some(vec!["L1".into(), "L22".into()])
        );
        assert!(parse_location_ids(Some(&json!(["X1"]))).is_err());
        assert!(parse_location_ids(Some(&json!([]))).is_err());
        assert!(parse_location_ids_body(None).is_err());
    }
}
