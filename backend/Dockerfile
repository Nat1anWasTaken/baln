FROM rust:1.91-bookworm AS builder

WORKDIR /app
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY migrations ./migrations
COPY assets ./assets
COPY src ./src
RUN cargo build --locked --release --bins

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/baln-admin /usr/local/bin/baln-admin
COPY --from=builder /app/target/release/baln-backend /usr/local/bin/baln-backend
COPY --from=builder /app/target/release/baln-migrate /usr/local/bin/baln-migrate

EXPOSE 8080
CMD ["baln-backend"]
