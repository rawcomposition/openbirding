use rusqlite::types::ValueRef;
use serde_json::Value;

fn is_js_whitespace(c: char) -> bool {
    c.is_whitespace() || c == '\u{FEFF}'
}

pub fn js_trim(s: &str) -> &str {
    s.trim_matches(is_js_whitespace)
}

fn is_decimal_literal(s: &str) -> bool {
    let bytes = s.as_bytes();
    let mut i = 0;
    if matches!(bytes.first(), Some(b'+' | b'-')) {
        i += 1;
    }
    let int_start = i;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    let int_digits = i - int_start;
    let mut frac_digits = 0;
    if i < bytes.len() && bytes[i] == b'.' {
        i += 1;
        let frac_start = i;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
        frac_digits = i - frac_start;
    }
    if int_digits == 0 && frac_digits == 0 {
        return false;
    }
    if i < bytes.len() && matches!(bytes[i], b'e' | b'E') {
        i += 1;
        if matches!(bytes.get(i), Some(b'+' | b'-')) {
            i += 1;
        }
        let exp_start = i;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
        if i == exp_start {
            return false;
        }
    }
    i == bytes.len()
}

fn parse_radix_integer(digits: &str, radix: u32) -> f64 {
    if digits.is_empty() || !digits.chars().all(|c| c.is_digit(radix)) {
        return f64::NAN;
    }
    digits.chars().fold(0.0, |acc, c| {
        acc * radix as f64 + c.to_digit(radix).unwrap_or(0) as f64
    })
}

pub fn str_to_number(raw: &str) -> f64 {
    let s = js_trim(raw);
    if s.is_empty() {
        return 0.0;
    }
    match s {
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    if s.len() > 2 && s.as_bytes()[0] == b'0' {
        let radix = match s.as_bytes()[1] {
            b'x' | b'X' => Some(16),
            b'o' | b'O' => Some(8),
            b'b' | b'B' => Some(2),
            _ => None,
        };
        if let Some(radix) = radix {
            return parse_radix_integer(&s[2..], radix);
        }
    }
    if !is_decimal_literal(s) {
        return f64::NAN;
    }
    s.parse::<f64>().unwrap_or(f64::NAN)
}

pub fn number_to_js_string(n: f64) -> String {
    if n.is_nan() {
        "NaN".into()
    } else if n.is_infinite() {
        if n > 0.0 {
            "Infinity".into()
        } else {
            "-Infinity".into()
        }
    } else if n == 0.0 {
        "0".into()
    } else if n.fract() == 0.0 && n.abs() < 1e21 {
        format!("{n:.0}")
    } else if n.abs() >= 1e21 || n.abs() < 1e-6 {
        let formatted = format!("{n:e}");
        match formatted.split_once('e') {
            Some((mantissa, exponent)) if !exponent.starts_with('-') => {
                format!("{mantissa}e+{exponent}")
            }
            _ => formatted,
        }
    } else {
        format!("{n}")
    }
}

pub fn to_js_string(value: &Value) -> String {
    match value {
        Value::Null => "null".into(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => number_to_js_string(n.as_f64().unwrap_or(f64::NAN)),
        Value::String(s) => s.clone(),
        Value::Array(items) => items
            .iter()
            .map(|item| {
                if item.is_null() {
                    String::new()
                } else {
                    to_js_string(item)
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".into(),
    }
}

pub fn to_number(value: Option<&Value>) -> f64 {
    match value {
        None => f64::NAN,
        Some(Value::Null) => 0.0,
        Some(Value::Bool(b)) => f64::from(u8::from(*b)),
        Some(Value::Number(n)) => n.as_f64().unwrap_or(f64::NAN),
        Some(Value::String(s)) => str_to_number(s),
        Some(array @ Value::Array(_)) => str_to_number(&to_js_string(array)),
        Some(Value::Object(_)) => f64::NAN,
    }
}

pub fn is_nullish(value: Option<&Value>) -> bool {
    matches!(value, None | Some(Value::Null))
}

pub fn is_truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(_) | Value::Object(_)) => true,
    }
}

pub fn is_integer(n: f64) -> bool {
    n.is_finite() && n.trunc() == n
}

pub fn js_round(x: f64) -> f64 {
    if !x.is_finite() {
        return x;
    }
    let floor = x.floor();
    if x - floor >= 0.5 { floor + 1.0 } else { floor }
}

pub fn round_tenth_percent(ratio: f64) -> f64 {
    js_round(ratio * 1000.0) / 10.0
}

pub fn parse_int(raw: &str) -> Option<f64> {
    let s = js_trim(raw);
    let (negative, unsigned) = match s.as_bytes().first() {
        Some(b'-') => (true, &s[1..]),
        Some(b'+') => (false, &s[1..]),
        _ => (false, s),
    };
    let (radix, digits) = if unsigned.len() >= 2 && matches!(&unsigned[..2], "0x" | "0X") {
        (16, &unsigned[2..])
    } else {
        (10, unsigned)
    };
    let prefix: String = digits.chars().take_while(|c| c.is_digit(radix)).collect();
    if prefix.is_empty() {
        return None;
    }
    let magnitude = parse_radix_integer(&prefix, radix);
    Some(if negative { -magnitude } else { magnitude })
}

pub fn utf16_prefix(s: &str, max_units: usize) -> String {
    let mut units = 0;
    s.chars()
        .take_while(|c| {
            units += c.len_utf16();
            units <= max_units
        })
        .collect()
}

pub fn sql_to_json(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => serde_json::Number::from_f64(f).map_or(Value::Null, Value::Number),
        ValueRef::Text(bytes) => Value::String(String::from_utf8_lossy(bytes).into_owned()),
        ValueRef::Blob(bytes) => serde_json::json!({ "type": "Buffer", "data": bytes }),
    }
}

pub fn sql_to_f64(value: ValueRef<'_>) -> f64 {
    match value {
        ValueRef::Null => 0.0,
        ValueRef::Integer(i) => i as f64,
        ValueRef::Real(f) => f,
        ValueRef::Text(bytes) => str_to_number(&String::from_utf8_lossy(bytes)),
        ValueRef::Blob(_) => f64::NAN,
    }
}

pub fn sql_to_opt_string(value: ValueRef<'_>) -> Option<String> {
    match value {
        ValueRef::Null => None,
        ValueRef::Integer(i) => Some(i.to_string()),
        ValueRef::Real(f) => Some(number_to_js_string(f)),
        ValueRef::Text(bytes) | ValueRef::Blob(bytes) => {
            Some(String::from_utf8_lossy(bytes).into_owned())
        }
    }
}

pub fn sql_to_string(value: ValueRef<'_>) -> String {
    sql_to_opt_string(value).unwrap_or_default()
}

pub fn f64_to_json(n: f64) -> Value {
    if is_integer(n) && n.abs() < 9_007_199_254_740_992.0 {
        Value::from(n as i64)
    } else {
        serde_json::Number::from_f64(n).map_or(Value::Null, Value::Number)
    }
}

pub fn iso_timestamp(time: chrono::DateTime<chrono::Utc>) -> String {
    time.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

pub fn query_time(start: std::time::Instant) -> String {
    format!("{} ms", js_round(start.elapsed().as_secs_f64() * 1000.0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn string_to_number_follows_js() {
        assert_eq!(str_to_number(""), 0.0);
        assert_eq!(str_to_number("  12 "), 12.0);
        assert_eq!(str_to_number("1e3"), 1000.0);
        assert_eq!(str_to_number(".5"), 0.5);
        assert_eq!(str_to_number("5."), 5.0);
        assert_eq!(str_to_number("0x1f"), 31.0);
        assert!(str_to_number("12px").is_nan());
        assert!(str_to_number("inf").is_nan());
        assert!(str_to_number("-0x10").is_nan());
        assert_eq!(str_to_number("-Infinity"), f64::NEG_INFINITY);
    }

    #[test]
    fn value_to_number_follows_js() {
        assert!(to_number(None).is_nan());
        assert_eq!(to_number(Some(&json!(null))), 0.0);
        assert_eq!(to_number(Some(&json!(true))), 1.0);
        assert_eq!(to_number(Some(&json!([]))), 0.0);
        assert_eq!(to_number(Some(&json!([7]))), 7.0);
        assert!(to_number(Some(&json!([1, 2]))).is_nan());
        assert!(to_number(Some(&json!({}))).is_nan());
    }

    #[test]
    fn array_join_follows_js() {
        assert_eq!(
            to_js_string(&json!([1, "2", null, [3, 4], 1.5])),
            "1,2,,3,4,1.5"
        );
    }

    #[test]
    fn rounding_follows_math_round() {
        assert_eq!(js_round(2.5), 3.0);
        assert_eq!(js_round(-2.5), -2.0);
        assert_eq!(js_round(0.49999999999999994), 0.0);
        assert!(js_round(f64::INFINITY).is_infinite());
    }

    #[test]
    fn parse_int_follows_js() {
        assert_eq!(parse_int("12abc"), Some(12.0));
        assert_eq!(parse_int(" -7"), Some(-7.0));
        assert_eq!(parse_int("0x1A"), Some(26.0));
        assert_eq!(parse_int("abc"), None);
    }

    #[test]
    fn number_strings_follow_js() {
        assert_eq!(number_to_js_string(3.0), "3");
        assert_eq!(number_to_js_string(0.25), "0.25");
        assert_eq!(number_to_js_string(1e21), "1e+21");
        assert_eq!(number_to_js_string(1e-7), "1e-7");
    }
}
