# Multi-MySQL MCP Server

[![CI](https://github.com/VKirill/multi-mysql-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/VKirill/multi-mysql-mcp-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Model_Context_Protocol-purple)](https://modelcontextprotocol.io/)

A **MySQL MCP server** for AI coding assistants — [Claude Code](https://claude.ai), [Cursor](https://cursor.com), [Windsurf](https://codeium.com/windsurf), and any [Model Context Protocol](https://modelcontextprotocol.io/) compatible client.

**One server, many MySQL databases.** Connect multiple MySQL and MariaDB databases through a single MCP server with built-in SQL injection protection, read-only mode, connection pooling, and environment variable support.

## Why Use This?

- **AI-native database access** — let Claude, Cursor, or Windsurf query your MySQL databases directly
- **Multi-database** — manage all your MySQL connections from one MCP server
- **Secure by default** — SQL injection protection, read-only transactions, prepared statements
- **Zero config changes on reconnect** — hot-reload config without restarting the server
- **Per-project isolation** — use `--label` to expose only relevant databases

## Tools

| Tool | Description |
|---|---|
| `mysql_list_databases` | List all configured MySQL database connections with status |
| `mysql_query` | Execute SQL queries with read-only enforcement and SQL injection protection |
| `mysql_list_tables` | List tables with row counts, storage engine (InnoDB, MyISAM), and data size |
| `mysql_describe_table` | Show columns, types, indexes, primary keys, foreign keys, and constraints |
| `mysql_list_schemas` | List all databases/schemas available on the MySQL server |
| `mysql_health_check` | Test database connectivity, MySQL version, and response latency |
| `mysql_explain` | Run EXPLAIN ANALYZE on queries with automatic ROLLBACK for safety |

## Quick Start

### Install

```bash
git clone https://github.com/VKirill/multi-mysql-mcp-server.git
cd multi-mysql-mcp-server
npm install
npm run build
```

### Configure

Create `~/.mcp-mysql/config.json` (or use `--config` to specify a custom path):

```json
{
  "connections": [
    {
      "label": "local",
      "host": "localhost",
      "port": 3306,
      "user": "dev",
      "password": "devpass123",
      "database": "myapp"
    },
    {
      "label": "production",
      "url": "mysql://${PROD_USER}:${PROD_PASS}@db.example.com:3306/prod_db",
      "readOnly": true,
      "ssl": true
    }
  ]
}
```

### Add to Claude Code

```bash
claude mcp add mysql -- node /path/to/dist/index.js --config ~/.mcp-mysql/config.json
```

Or add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "mysql": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/dist/index.js", "--config", "/path/to/config.json"]
    }
  }
}
```

### Add to Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "mysql": {
      "command": "node",
      "args": ["/path/to/dist/index.js", "--config", "/path/to/config.json"]
    }
  }
}
```

### Docker

```bash
docker build -t mcp-mysql .
docker run -v /path/to/config.json:/app/config.json mcp-mysql --config /app/config.json
```

## Configuration

### Connection Fields

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `label` | string | Yes | — | Unique identifier for the database |
| `host` | string | * | — | MySQL server hostname |
| `port` | number | No | 3306 | MySQL server port |
| `user` | string | * | — | Database username |
| `password` | string | No | `""` | Database password |
| `database` | string | * | — | Default database/schema name |
| `url` | string | * | — | MySQL connection URL (alternative to host/user/database) |
| `ssl` | bool/object | No | — | Enable SSL/TLS (supports AWS RDS, Azure, GCP Cloud SQL) |
| `readOnly` | boolean | No | `true` | Enforce read-only transactions |
| `enabled` | boolean | No | `true` | Enable/disable this connection |
| `poolSize` | number | No | `5` | Maximum pool connections (1–100) |

\* Either `url` **or** `host` + `user` + `database` is required.

### Environment Variables in Config

Use `${VAR}` or `${VAR:-default}` syntax in any config string value:

```json
{
  "host": "${MYSQL_HOST:-localhost}",
  "user": "${MYSQL_USER}",
  "password": "${MYSQL_PASSWORD}"
}
```

### CLI Options

| Option | Description |
|---|---|
| `--config <path>` | Path to config file (default: `~/.mcp-mysql/config.json`) |
| `--label <name>` | Restrict server to a single database (per-project isolation) |

Environment variable: `MCP_MYSQL_CONFIG` — alternative config file path.

## Security

- **SQL injection protection** — state-machine parser detects multi-statement queries, handles MySQL-specific syntax (backtick identifiers, `#` comments, backslash escapes)
- **Prepared statements** — all user parameters go through `connection.execute()` with `?` placeholders
- **Read-only by default** — `SET SESSION TRANSACTION READ ONLY` wraps all queries in transactions
- **EXPLAIN safety** — EXPLAIN ANALYZE always wrapped in transaction with ROLLBACK
- **Config permissions** — warns if config file is world-readable on Unix
- **Zod validation** — config file validated with strict schemas

See [SECURITY.md](SECURITY.md) for the full security model and responsible disclosure policy.

## Compatibility

- **MySQL** 5.7, 8.0, 8.4, 9.x
- **MariaDB** 10.x, 11.x
- **Cloud**: AWS RDS, Azure Database for MySQL, Google Cloud SQL, PlanetScale, Aiven
- **Node.js** >= 18
- **MCP clients**: Claude Code, Cursor, Windsurf, any MCP-compatible AI tool

## Related Projects

- [multi-postgres-mcp-server](https://github.com/VKirill/multi-postgres-mcp-server) — Same architecture for PostgreSQL

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT — see [LICENSE](LICENSE) for details.
