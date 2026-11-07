use std::collections::HashMap;
use std::path::Path;

use serde_json::{Value, json};

const CDN: &str = "https://static.avicommons.org";
const INDEX_URL: &str = "https://avicommons.org/latest-lite.json";
const PHOTO_SIZE: u32 = 160;

#[derive(Default)]
pub struct Avicommons {
    photos: HashMap<String, (String, String)>,
}

impl Avicommons {
    pub async fn load(path: &Path, http: &reqwest::Client) -> Self {
        let raw = match std::fs::read_to_string(path) {
            Ok(raw) => raw,
            Err(_) => match download(http, path).await {
                Ok(raw) => raw,
                Err(err) => {
                    tracing::warn!(
                        "[avicommons] {} missing and download failed ({err}) — species photos will be omitted",
                        path.display()
                    );
                    return Self::default();
                }
            },
        };
        let parsed =
            serde_json::from_str::<HashMap<String, Value>>(&raw).map_err(|err| err.to_string());
        match parsed {
            Ok(entries) => Self {
                photos: entries
                    .into_iter()
                    .filter_map(|(code, entry)| {
                        let text = |i: usize| {
                            entry
                                .get(i)
                                .map(crate::js::to_js_string)
                                .unwrap_or_else(|| "undefined".into())
                        };
                        entry.is_array().then(|| (code, (text(0), text(1))))
                    })
                    .collect(),
            },
            Err(err) => {
                tracing::warn!("[avicommons] failed to parse {}: {err}", path.display());
                Self::default()
            }
        }
    }

    pub fn photo(&self, code: &str) -> Value {
        match self.photos.get(code) {
            Some((photo_key, by)) => {
                json!({ "url": format!("{CDN}/{code}-{photo_key}-{PHOTO_SIZE}.jpg"), "by": by })
            }
            None => Value::Null,
        }
    }
}

async fn download(http: &reqwest::Client, path: &Path) -> Result<String, String> {
    tracing::info!("[avicommons] downloading {INDEX_URL} to {}", path.display());
    let raw = http
        .get(INDEX_URL)
        .send()
        .await
        .and_then(|response| response.error_for_status())
        .map_err(|err| err.to_string())?
        .text()
        .await
        .map_err(|err| err.to_string())?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|err| err.to_string())?;
    }
    std::fs::write(path, &raw).map_err(|err| err.to_string())?;
    Ok(raw)
}
