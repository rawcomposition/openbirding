mod avicommons;
mod config;
mod db;
mod ebird;
mod error;
mod http;
mod js;
mod occurrences;
mod routes;
mod scripts;
mod state;
mod validators;

use std::process::ExitCode;
use std::sync::Arc;

use clap::{Parser, Subcommand};
use tracing_subscriber::EnvFilter;

use crate::avicommons::Avicommons;
use crate::config::Config;
use crate::db::main::{MainDb, setup_database};
use crate::db::targets::TargetsStore;
use crate::occurrences::OccurrencesStore;
use crate::state::{AppState, LifeListCache, TtlCache};

#[derive(Parser)]
#[command(
    name = "openbirding-api",
    about = "OpenBirding API server and maintenance commands"
)]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand)]
enum Command {
    Serve,
    SyncRegions,
    GenerateRegionParents { prefix: Option<String> },
    HealthCheck,
}

fn open_main_db(config: &Config) -> Result<MainDb, String> {
    MainDb::open(&config.main_db_path())
}

async fn serve(config: Config) -> Result<(), String> {
    let main = open_main_db(&config)?;
    main.run_blocking(|conn| setup_database(conn))
        .map_err(|err| format!("Failed to initialize database: {err:?}"))?;

    let occurrences = OccurrencesStore::new(
        config.occurrences_db_path(),
        config.occurrences_max_zone_res,
    );
    occurrences.start_loading();

    let state = Arc::new(AppState {
        targets: Arc::new(TargetsStore::open(config.targets_db_path())),
        avicommons: Avicommons::load(&config.avicommons_json_path),
        http: reqwest::Client::new(),
        taxonomy: TtlCache::taxonomy(),
        region_names: tokio::sync::OnceCell::new(),
        life_lists: LifeListCache::default(),
        occurrences,
        main,
        config: Arc::new(config),
    });

    let address = std::net::SocketAddr::from(([0, 0, 0, 0], state.config.port));
    let listener = tokio::net::TcpListener::bind(address)
        .await
        .map_err(|err| err.to_string())?;
    tracing::info!(
        "Server is running on http://localhost:{}",
        state.config.port
    );
    axum::serve(listener, routes::router(state))
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(|err| err.to_string())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut signal) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            signal.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }
}

#[tokio::main]
async fn main() -> ExitCode {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let config = Config::from_env();
    let result = match Cli::parse().command.unwrap_or(Command::Serve) {
        Command::Serve => serve(config).await,
        Command::SyncRegions => match open_main_db(&config) {
            Ok(db) => scripts::sync_regions::run(&config, &db).await,
            Err(err) => Err(err),
        },
        Command::GenerateRegionParents { prefix } => match open_main_db(&config) {
            Ok(db) => scripts::generate_region_parents::run(&db, prefix)
                .await
                .map_err(|err| format!("{err:?}")),
            Err(err) => Err(err),
        },
        Command::HealthCheck => scripts::health_check::run(&config).await,
    };

    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            tracing::error!("{err}");
            ExitCode::FAILURE
        }
    }
}
