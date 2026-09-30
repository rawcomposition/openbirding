use axum::extract::State;
use axum::response::Response;
use axum::routing::get;
use axum::{Router, middleware};
use chrono::{DateTime, Datelike, Months, NaiveDateTime, TimeZone, Utc};

use crate::error::AppResult;
use crate::http::{escape_html, html, not_found, require_reports_auth};
use crate::js::{js_round, sql_to_opt_string, sql_to_string};
use crate::state::SharedState;

const DOWNLOADS_LIMIT: usize = 500;
const TABLE_STYLE: &str = "    body { font-family: system-ui, sans-serif; padding: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    tr:hover { background: #f9f9f9; }";

pub fn routes(state: SharedState) -> Router<SharedState> {
    Router::new()
        .route("/api/v1/reports/downloads", get(downloads))
        .route("/api/v1/reports/android", get(android))
        .route("/api/v1/reports", axum::routing::any(not_found))
        .route("/api/v1/reports/{*rest}", axum::routing::any(not_found))
        .layer(middleware::from_fn_with_state(state, require_reports_auth))
}

fn or_dash(value: Option<String>) -> String {
    escape_html(
        &value
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| "-".into()),
    )
}

fn page(title: &str, summary: &str, header_cells: &[&str], rows: &str) -> String {
    let headers: String = header_cells
        .iter()
        .map(|h| format!("\n      <th>{h}</th>"))
        .collect();
    format!(
        "<!DOCTYPE html>
<html>
<head>
  <title>{title}</title>
  <style>
{TABLE_STYLE}
  </style>
</head>
<body>
  <h1>{title}</h1>
  <p>{summary}</p>
  <table>
    <tr>{headers}
    </tr>
    {rows}
  </table>
</body>
</html>"
    )
}

async fn downloads(State(state): State<SharedState>) -> AppResult<Response> {
    let rows = state
        .main
        .run(|conn| {
            let mut stmt = conn.prepare(&format!(
                r#"select "pack_downloads"."id", "pack_downloads"."pack_region", "regions"."long_name",
                          "pack_downloads"."method", "pack_downloads"."app_version", "pack_downloads"."app_platform",
                          "pack_downloads"."app_environment", "pack_downloads"."user_agent", "pack_downloads"."created_at"
                   from "pack_downloads" left join "regions" on "pack_downloads"."pack_region" = "regions"."id"
                   order by "pack_downloads"."created_at" desc limit {DOWNLOADS_LIMIT}"#
            ))?;
            let now = Utc::now();
            let rows = stmt
                .query_map([], |row| {
                    let text = |i: usize| row.get_ref(i).map(sql_to_opt_string);
                    let pack = text(2)?.filter(|n| !n.is_empty()).or(text(1)?);
                    Ok(format!(
                        "
    <tr>
      <td>{}</td>
      <td>{}</td>
      <td>{}</td>
      <td>{}</td>
      <td>{}</td>
      <td>{}</td>
      <td>{}</td>
      <td>{}</td>
    </tr>",
                        escape_html(&sql_to_string(row.get_ref(0)?)),
                        escape_html(&pack.unwrap_or_default()),
                        or_dash(text(3)?),
                        or_dash(text(4)?),
                        or_dash(text(5)?),
                        or_dash(text(6)?),
                        or_dash(text(7)?),
                        escape_html(&from_now(text(8)?.as_deref(), now)),
                    ))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(rows)
        })
        .await?;
    let headers = [
        "ID",
        "Pack",
        "Method",
        "Version",
        "Platform",
        "Environment",
        "User Agent",
        "Created At",
    ];
    Ok(html(page(
        "Pack Downloads",
        &format!("Found {} results", rows.len()),
        &headers,
        &rows.concat(),
    )))
}

async fn android(State(state): State<SharedState>) -> AppResult<Response> {
    let rows = state
        .main
        .run(|conn| {
            let mut stmt = conn.prepare(
                r#"select "id", "email", "created_at" from "android" order by "created_at" desc"#,
            )?;
            let now = Utc::now();
            let rows = stmt
                .query_map([], |row| {
                    Ok(format!(
                        "
    <tr>
      <td>{}</td>
      <td>{}</td>
      <td>{}</td>
    </tr>",
                        escape_html(&sql_to_string(row.get_ref(0)?)),
                        escape_html(&sql_to_string(row.get_ref(1)?)),
                        escape_html(&from_now(
                            row.get_ref(2).map(sql_to_opt_string)?.as_deref(),
                            now
                        )),
                    ))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(rows)
        })
        .await?;
    Ok(html(page(
        "Android Signups",
        &format!("Found {} signups", rows.len()),
        &["ID", "Email", "Signed Up"],
        &rows.concat(),
    )))
}

fn parse_utc(raw: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(raw)
        .map(|t| t.with_timezone(&Utc))
        .ok()
        .or_else(|| {
            [
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%d %H:%M:%S%.f",
                "%Y-%m-%dT%H:%M:%S%.f",
            ]
            .iter()
            .find_map(|format| NaiveDateTime::parse_from_str(raw, format).ok())
            .map(|naive| Utc.from_utc_datetime(&naive))
        })
}

fn add_months(time: DateTime<Utc>, months: i32) -> DateTime<Utc> {
    let shifted = if months >= 0 {
        time.checked_add_months(Months::new(months as u32))
    } else {
        time.checked_sub_months(Months::new(months.unsigned_abs()))
    };
    shifted.unwrap_or(time)
}

fn month_diff(a: DateTime<Utc>, b: DateTime<Utc>) -> f64 {
    if a.day() < b.day() {
        return -month_diff(b, a);
    }
    let whole = (b.year() - a.year()) * 12 + (b.month() as i32 - a.month() as i32);
    let anchor = add_months(a, whole);
    let before_anchor = b < anchor;
    let anchor2 = add_months(a, whole + if before_anchor { -1 } else { 1 });
    let millis = |t: DateTime<Utc>| t.timestamp_millis() as f64;
    let span = if before_anchor {
        millis(anchor) - millis(anchor2)
    } else {
        millis(anchor2) - millis(anchor)
    };
    let result = -(whole as f64 + (millis(b) - millis(anchor)) / span);
    if result.is_nan() { 0.0 } else { result + 0.0 }
}

pub fn from_now(raw: Option<&str>, now: DateTime<Utc>) -> String {
    let Some(time) = raw.and_then(parse_utc) else {
        return "Invalid Date".into();
    };
    let diff_ms = (time - now).num_milliseconds() as f64;
    let thresholds: [(&str, Option<f64>, Option<f64>); 11] = [
        ("s", Some(44.0), Some(diff_ms / 1000.0)),
        ("m", Some(89.0), None),
        ("mm", Some(44.0), Some(diff_ms / 60_000.0)),
        ("h", Some(89.0), None),
        ("hh", Some(21.0), Some(diff_ms / 3_600_000.0)),
        ("d", Some(35.0), None),
        ("dd", Some(25.0), Some(diff_ms / 86_400_000.0)),
        ("M", Some(45.0), None),
        ("MM", Some(10.0), Some(month_diff(time, now))),
        ("y", Some(17.0), None),
        ("yy", None, Some(month_diff(time, now) / 12.0)),
    ];
    let mut result = 0.0;
    let mut output = String::new();
    for (i, (_, limit, diff)) in thresholds.iter().enumerate() {
        if let Some(diff) = diff {
            result = *diff;
        }
        let abs = js_round(result.abs());
        if limit.is_none_or(|limit| abs <= limit) {
            let label = if abs <= 1.0 && i > 0 {
                thresholds[i - 1].0
            } else {
                thresholds[i].0
            };
            let n = abs as i64;
            output = match label {
                "s" => "a few seconds".into(),
                "m" => "a minute".into(),
                "mm" => format!("{n} minutes"),
                "h" => "an hour".into(),
                "hh" => format!("{n} hours"),
                "d" => "a day".into(),
                "dd" => format!("{n} days"),
                "M" => "a month".into(),
                "MM" => format!("{n} months"),
                "y" => "a year".into(),
                _ => format!("{n} years"),
            };
            break;
        }
    }
    if result > 0.0 {
        format!("in {output}")
    } else {
        format!("{output} ago")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(raw: &str) -> DateTime<Utc> {
        parse_utc(raw).unwrap()
    }

    #[test]
    fn relative_times_match_dayjs() {
        let now = at("2026-09-30 12:00:00");
        assert_eq!(
            from_now(Some("2026-09-30 11:59:30"), now),
            "a few seconds ago"
        );
        assert_eq!(from_now(Some("2026-09-30 11:59:00"), now), "a minute ago");
        assert_eq!(from_now(Some("2026-09-30 11:30:00"), now), "30 minutes ago");
        assert_eq!(from_now(Some("2026-09-30 11:00:00"), now), "an hour ago");
        assert_eq!(from_now(Some("2026-09-30 07:00:00"), now), "5 hours ago");
        assert_eq!(from_now(Some("2026-09-29 12:00:00"), now), "a day ago");
        assert_eq!(from_now(Some("2026-09-20 12:00:00"), now), "10 days ago");
        assert_eq!(from_now(Some("2026-08-30 12:00:00"), now), "a month ago");
        assert_eq!(from_now(Some("2026-05-30 12:00:00"), now), "4 months ago");
        assert_eq!(from_now(Some("2025-09-30 12:00:00"), now), "a year ago");
        assert_eq!(from_now(Some("2023-09-30 12:00:00"), now), "3 years ago");
    }
}
