use crate::config::Config;
use crate::js::{js_round, parse_int};

const DISK_USAGE_THRESHOLD: f64 = 70.0;
const KIB_PER_GIB: f64 = 1024.0 * 1024.0;

struct DiskUsage {
    percent: f64,
    used_gb: f64,
    total_gb: f64,
}

fn disk_usage() -> Result<DiskUsage, String> {
    let output = std::process::Command::new("df")
        .args(["-kP", "/"])
        .output()
        .map_err(|err| err.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let columns: Vec<&str> = stdout
        .trim()
        .lines()
        .last()
        .unwrap_or("")
        .split_whitespace()
        .collect();
    let column = |i: usize| columns.get(i).and_then(|c| parse_int(c));
    let percent = column(4).ok_or("Could not parse disk usage from df output")?;
    Ok(DiskUsage {
        percent,
        used_gb: js_round(column(2).unwrap_or(f64::NAN) / KIB_PER_GIB),
        total_gb: js_round(column(1).unwrap_or(f64::NAN) / KIB_PER_GIB),
    })
}

async fn notify(
    config: &Config,
    title: &str,
    message: String,
    priority: Option<&str>,
) -> Result<(), String> {
    let Some(topic) = &config.system_alerts_ntfy_topic else {
        tracing::warn!("SYSTEM_ALERTS_NTFY_TOPIC not set, skipping notification");
        return Ok(());
    };
    let mut request = reqwest::Client::new()
        .post(format!("https://ntfy.sh/{topic}"))
        .header("Title", title)
        .body(message);
    if let Some(priority) = priority {
        request = request.header("Priority", priority);
    }
    let response = request.send().await.map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "ntfy request failed: {}",
            response.status().canonical_reason().unwrap_or("")
        ));
    }
    Ok(())
}

pub async fn run(config: &Config) -> Result<(), String> {
    tracing::info!("Running system health checks...");
    let DiskUsage {
        percent,
        used_gb,
        total_gb,
    } = disk_usage()?;
    tracing::info!("Disk usage: {used_gb}GB / {total_gb}GB ({percent}%)");
    if percent >= DISK_USAGE_THRESHOLD {
        tracing::info!(
            "Disk usage {percent}% exceeds {DISK_USAGE_THRESHOLD}% threshold, sending alert"
        );
        notify(
            config,
            "OpenBirding Alert",
            format!("Disk usage is at {used_gb}GB / {total_gb}GB ({percent}%)"),
            Some("high"),
        )
        .await?;
    }
    tracing::info!("Done.");
    Ok(())
}
