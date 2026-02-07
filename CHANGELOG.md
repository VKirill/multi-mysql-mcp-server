# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-07

### Added

- **Multi-database support**: Manage multiple MySQL/MariaDB connections from a single MCP server
- **Connection pooling**: `mysql2` pool with lazy initialization and hot-reload awareness via config hash comparison
- **SQL injection protection**: State-machine SQL parser rejects multi-statement queries (statement stacking prevention)
- **Parameterized queries**: `params` array support for `?` placeholders
- **SSL/TLS support**: `ssl` field per connection (boolean or detailed config)
- **Connection string support**: `url` field as alternative to `host`/`port`/`user`/`database`
- **Write mode**: Optional `readOnly: false` per connection (default: read-only with `SET SESSION TRANSACTION READ ONLY`)
- **Zod validation**: Full config validation with descriptive error messages
- **Duplicate label detection**: Warning on duplicate labels, keeps first occurrence
- **`--label` filtering**: Restrict server to a single database for per-project isolation
- **`--config` flag and `MCP_MYSQL_CONFIG` env**: Flexible config file location
- **Environment variable substitution**: `${VAR}` and `${VAR:-default}` syntax in config values
- **Config caching**: 5s TTL with mtime check for reduced I/O
- **Result pagination**: Optional `limit` parameter for `mysql_query`
- **Config permission check**: Warning if config file is world-readable on Unix
- **Graceful shutdown**: Drains all connection pools on SIGTERM/SIGINT

#### MCP Tools
- `mysql_list_databases` — List all configured and enabled databases
- `mysql_query` — Execute SQL with read-only session, parameterized queries
- `mysql_list_tables` — List tables with row counts and engine info
- `mysql_describe_table` — Show columns, types, constraints, foreign keys, and indexes
- `mysql_list_schemas` — List all databases/schemas with table counts
- `mysql_health_check` — Test connection, show MySQL version and latency
- `mysql_explain` — EXPLAIN ANALYZE wrapper (always rolled back)

#### Documentation & DevOps
- README.md, SECURITY.md, CONTRIBUTING.md, CHANGELOG.md
- GitHub Actions CI/CD (Node 18/20/22)
- Dockerfile, ESLint + Prettier, vitest tests, TypeScript source maps

### Security
- Read-only sessions by default
- Multi-statement SQL detection and rejection
- Connection timeouts (10s connect, 30s query)
- Idle connection cleanup (60s)
