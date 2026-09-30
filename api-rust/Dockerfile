FROM rust:1-bookworm AS build
WORKDIR /app
COPY api-rust/Cargo.toml api-rust/Cargo.lock ./
COPY api-rust/.cargo ./.cargo
COPY api-rust/src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/target/release/openbirding-api /usr/local/bin/openbirding-api
ADD https://avicommons.org/latest-lite.json /app/data/avicommons-lite.json
ENV PORT=3000 \
    SQLITE_DIR=/data \
    SQLITE_FILENAME=openbirding.db \
    AVICOMMONS_JSON_PATH=/app/data/avicommons-lite.json
EXPOSE 3000
CMD ["openbirding-api", "serve"]
