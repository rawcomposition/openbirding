use std::time::Duration;

use rusqlite::params;

use crate::config::Config;
use crate::db::main::MainDb;
use crate::ebird::region_list;
use crate::error::AppError;

const DELAY_BETWEEN_COUNTRIES: Duration = Duration::from_secs(5);

async fn save_regions(db: &MainDb, regions: Vec<(String, String)>) -> Result<usize, String> {
    if regions.is_empty() {
        return Ok(0);
    }
    let count = regions.len();
    db.run(move |conn| {
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare(
                r#"insert into "regions" ("id", "name", "long_name", "parents", "level", "has_children")
                   values (?, ?, NULL, '[]', ?, 0)
                   on conflict ("id") do update set "name" = ?, "level" = ?"#,
            )?;
            for (code, name) in &regions {
                let level = code.split('-').count() as i64;
                stmt.execute(params![code, name, level, name, level])?;
            }
        }
        tx.commit()?;
        Ok(())
    })
    .await
    .map_err(describe)?;
    tracing::info!("Synced {count} regions");
    Ok(count)
}

fn describe(err: AppError) -> String {
    format!("{err:?}")
}

pub async fn run(config: &Config, db: &MainDb) -> Result<(), String> {
    tracing::info!("Starting region sync...");
    let http = reqwest::Client::new();
    let api_key = config.ebird_api_key.as_deref();

    let countries = region_list(&http, api_key, "country", "world").await?;
    tracing::info!("Found {} countries", countries.len());
    let mut total_synced = save_regions(db, countries.clone()).await?;

    for (i, (country, _)) in countries.iter().enumerate() {
        tracing::info!("Processing country: {country}");
        let (states, counties) = tokio::try_join!(
            region_list(&http, api_key, "subnational1", country),
            region_list(&http, api_key, "subnational2", country),
        )?;
        tracing::info!(
            "Found {} states and {} counties for {country}",
            states.len(),
            counties.len()
        );
        total_synced += save_regions(db, states.into_iter().chain(counties).collect()).await?;

        if i + 1 < countries.len() {
            tracing::info!(
                "Waiting {} seconds before next country...",
                DELAY_BETWEEN_COUNTRIES.as_secs()
            );
            tokio::time::sleep(DELAY_BETWEEN_COUNTRIES).await;
        }
    }

    tracing::info!("Region sync completed! Total regions synced: {total_synced}");
    Ok(())
}
