use serde_json::{Map, Value};

use crate::js::js_trim;

const EBIRD_API: &str = "https://api.ebird.org/v2";

pub fn ebd_citation(version_month: &str, version_year: &str) -> String {
    format!(
        "eBird Basic Dataset. Version: EBD_rel{version_month}-{version_year}. Cornell Lab of Ornithology, Ithaca, New York. {version_month} {version_year}."
    )
}

pub struct EbirdHotspot {
    pub location_id: Value,
    pub name: String,
    pub lat: Value,
    pub lng: Value,
    pub total: Value,
    pub country_code: Option<String>,
    pub subnational1_code: Option<String>,
    pub subnational2_code: Option<String>,
}

fn require_key(api_key: Option<&str>) -> Result<&str, String> {
    api_key.ok_or_else(|| "EBIRD_API_KEY environment variable is required".to_string())
}

fn status_text(response: &reqwest::Response) -> &'static str {
    response.status().canonical_reason().unwrap_or("")
}

fn string_field(object: &Map<String, Value>, key: &str) -> Option<String> {
    object
        .get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

pub async fn hotspots_for_region(
    http: &reqwest::Client,
    api_key: Option<&str>,
    region: &str,
) -> Result<Vec<EbirdHotspot>, String> {
    let api_key = require_key(api_key)?;
    let response = http
        .get(format!(
            "{EBIRD_API}/ref/hotspot/{region}?fmt=json&key={api_key}"
        ))
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "eBird API request failed: {}",
            status_text(&response)
        ));
    }
    let json: Value = response.json().await.map_err(|err| err.to_string())?;
    let Value::Array(items) = json else {
        return Err("Error fetching eBird hotspots".into());
    };
    Ok(items
        .iter()
        .filter_map(Value::as_object)
        .map(|hotspot| {
            let total = hotspot
                .get("numSpeciesAllTime")
                .filter(|v| crate::js::is_truthy(Some(v)))
                .cloned();
            EbirdHotspot {
                location_id: hotspot.get("locId").cloned().unwrap_or(Value::Null),
                name: js_trim(hotspot.get("locName").and_then(Value::as_str).unwrap_or(""))
                    .to_string(),
                lat: hotspot.get("lat").cloned().unwrap_or(Value::Null),
                lng: hotspot.get("lng").cloned().unwrap_or(Value::Null),
                total: total.unwrap_or(Value::from(0)),
                country_code: string_field(hotspot, "countryCode"),
                subnational1_code: string_field(hotspot, "subnational1Code"),
                subnational2_code: string_field(hotspot, "subnational2Code"),
            }
        })
        .filter(|hotspot| !hotspot.name.to_lowercase().starts_with("stakeout"))
        .collect())
}

pub async fn taxonomy(http: &reqwest::Client, api_key: Option<&str>) -> Result<Value, String> {
    let api_key = require_key(api_key)?;
    let response = http
        .get(format!(
            "{EBIRD_API}/ref/taxonomy/ebird?fmt=json&cat=species,form&key={api_key}"
        ))
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "eBird taxonomy request failed: {}",
            status_text(&response)
        ));
    }
    let taxa: Vec<Value> = response.json().await.map_err(|err| err.to_string())?;
    let entries = taxa
        .iter()
        .filter_map(Value::as_object)
        .filter(|taxon| {
            taxon.get("category").and_then(Value::as_str) == Some("species")
                || !crate::js::is_truthy(taxon.get("reportAs"))
        })
        .map(|taxon| {
            let mut entry = Map::new();
            for (target, source) in [
                ("name", "comName"),
                ("sciName", "sciName"),
                ("code", "speciesCode"),
            ] {
                if let Some(value) = taxon.get(source) {
                    entry.insert(target.to_string(), value.clone());
                }
            }
            Value::Object(entry)
        })
        .collect();
    Ok(Value::Array(entries))
}

pub async fn region_list(
    http: &reqwest::Client,
    api_key: Option<&str>,
    region_type: &str,
    parent_region_code: &str,
) -> Result<Vec<(String, String)>, String> {
    let api_key = require_key(api_key)?;
    let url = format!("{EBIRD_API}/ref/region/list/{region_type}/{parent_region_code}");
    tracing::info!("Fetching regions: {url}");
    let response = http
        .get(format!("{url}?key={api_key}"))
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "eBird API request failed: {}",
            status_text(&response)
        ));
    }
    let regions: Vec<Value> = response.json().await.map_err(|err| err.to_string())?;
    Ok(regions
        .iter()
        .filter_map(|region| {
            Some((
                region.get("code")?.as_str()?.to_string(),
                region.get("name")?.as_str()?.to_string(),
            ))
        })
        .collect())
}
