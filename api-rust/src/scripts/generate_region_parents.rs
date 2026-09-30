use std::collections::HashMap;

use rusqlite::params;
use serde_json::json;

use crate::db::main::{MainDb, setup_regions_fts};
use crate::error::AppResult;
use crate::js::sql_to_string;

const BATCH_SIZE: usize = 1000;
const ABBREVIATED_PARENTS: [(&str, &str); 1] = [("US", "US")];

struct Parent {
    id: String,
    name: String,
}

fn parent_regions(region_id: &str, names: &HashMap<String, String>) -> Vec<Parent> {
    let parts: Vec<&str> = region_id.split('-').collect();
    (1..parts.len())
        .rev()
        .filter_map(|i| {
            let parent_id = parts[..i].join("-");
            let name = names.get(&parent_id)?;
            let display = ABBREVIATED_PARENTS
                .iter()
                .find(|(id, _)| *id == parent_id)
                .map_or_else(|| name.clone(), |(_, short)| short.to_string());
            Some(Parent {
                id: parent_id,
                name: display,
            })
        })
        .collect()
}

pub async fn run(db: &MainDb, prefix: Option<String>) -> AppResult<()> {
    tracing::info!("Starting region parent generation...");
    if let Some(prefix) = &prefix {
        tracing::info!("Processing only regions under: {prefix}");
    }

    db.run(move |conn| {
        let regions: Vec<(String, String)> = {
            let (sql, filter) = match &prefix {
                Some(prefix) => (r#"select "id", "name" from "regions" where "id" like ?"#, Some(format!("{prefix}%"))),
                None => (r#"select "id", "name" from "regions""#, None),
            };
            let mut stmt = conn.prepare(sql)?;
            let map_row = |row: &rusqlite::Row<'_>| Ok((sql_to_string(row.get_ref(0)?), sql_to_string(row.get_ref(1)?)));
            match &filter {
                Some(filter) => stmt.query_map([filter], map_row)?.collect::<rusqlite::Result<Vec<_>>>()?,
                None => stmt.query_map([], map_row)?.collect::<rusqlite::Result<Vec<_>>>()?,
            }
        };
        tracing::info!("Found {} regions to process", regions.len());

        let names: HashMap<String, String> = regions.iter().cloned().collect();
        let ids: Vec<&str> = regions.iter().map(|(id, _)| id.as_str()).collect();
        let total_batches = regions.len().div_ceil(BATCH_SIZE);
        let mut processed = 0;

        for (batch_number, batch) in regions.chunks(BATCH_SIZE).enumerate() {
            tracing::info!("Processing batch {}/{total_batches} ({} regions)", batch_number + 1, batch.len());
            let tx = conn.transaction()?;
            {
                let mut stmt = tx.prepare(
                    r#"update "regions" set "parents" = ?, "long_name" = ?, "has_children" = ? where "id" = ?"#,
                )?;
                for (id, name) in batch {
                    let parents = parent_regions(id, &names);
                    let parents_json = serde_json::to_string(
                        &parents.iter().map(|p| json!({ "name": p.name, "id": p.id })).collect::<Vec<_>>(),
                    )?;
                    let long_name =
                        std::iter::once(name.as_str()).chain(parents.iter().map(|p| p.name.as_str())).collect::<Vec<_>>().join(", ");
                    let child_prefix = format!("{id}-");
                    let has_children = ids.iter().any(|other| other.starts_with(&child_prefix));
                    stmt.execute(params![parents_json, long_name, i64::from(has_children), id])?;
                }
            }
            tx.commit()?;
            processed += batch.len();
            let percent = crate::js::js_round(processed as f64 / regions.len() as f64 * 100.0);
            tracing::info!("Processed {processed}/{} regions ({percent}%)", regions.len());
        }

        tracing::info!("Region parent generation completed! Total regions processed: {processed}");
        tracing::info!("Rebuilding regions FTS index...");
        setup_regions_fts(conn)?;
        tracing::info!("Regions FTS index rebuilt successfully");
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parents_are_nearest_first_with_us_abbreviated() {
        let names: HashMap<String, String> = [("US", "United States"), ("US-CA", "California")]
            .into_iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        let parents = parent_regions("US-CA-001", &names);
        let labels: Vec<(&str, &str)> = parents
            .iter()
            .map(|p| (p.id.as_str(), p.name.as_str()))
            .collect();
        assert_eq!(labels, vec![("US-CA", "California"), ("US", "US")]);
        assert!(parent_regions("US", &names).is_empty());
    }
}
