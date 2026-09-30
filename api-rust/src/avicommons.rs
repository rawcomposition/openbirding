use std::collections::HashMap;
use std::path::Path;

use serde_json::{Value, json};

const CDN: &str = "https://static.avicommons.org";
const PHOTO_SIZE: u32 = 160;

#[derive(Default)]
pub struct Avicommons {
    photos: HashMap<String, (String, String)>,
}

impl Avicommons {
    pub fn load(path: &Path) -> Self {
        if !path.exists() {
            tracing::warn!(
                "[avicommons] {} not found — species photos will be omitted",
                path.display()
            );
            return Self::default();
        }
        let parsed = std::fs::read_to_string(path)
            .map_err(|err| err.to_string())
            .and_then(|raw| {
                serde_json::from_str::<HashMap<String, Value>>(&raw).map_err(|err| err.to_string())
            });
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
