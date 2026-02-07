# multi-mysql-mcp-server

Multi-database MySQL MCP server for AI coding assistants (Claude Code, Cursor, Windsurf).

One server, many MySQL databases. Supports per-project isolation via `--label` filter.

## Features

- **7 MCP tools**: `mysql_list_databases`, `mysql_query`, `mysql_list_tables`, `mysql_describe_table`, `mysql_list_schemas`, `mysql_health_check`, `mysql_explain`
- **Multi-database**: Manage many MySQL connections from a single MCP server
- **SQL injection protection**: Multi-statement detection + parameterized queries
- **Read-only by default**: `SET SESSION TRANSACTION READ ONLY`
- **Connection pooling**: `mysql2` pool with lazy init and hot-reload
- **SSL/TLS support**: For cloud databases (AWS RDS, Azure, GCP)
- **Config flexibility**: JSON file with env var substitution (`${VAR}`)
- **Config caching**: 5s TTL with mtime check
- **Per-project isolation**: `--label` flag
- **Graceful shutdown**: Drains pools on SIGTERM/SIGINT

## Quick Start

### Claude Code (global)

```bash
claude mcp add mysql -- node /path/to/dist/index.js --config /path/to/config.json
```

### Claude Code (claude.json)

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

### Cursor (.cursor/mcp.json)

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

## Configuration

Create a JSON config file:

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
    }
  ]
}
```

### Connection Fields

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `label` | string | Yes | — | Unique identifier |
| `host` | string | * | — | MySQL host |
| `port` | number | No | 3306 | MySQL port |
| `user` | string | * | — | Username |
| `password` | string | No | "" | Password |
| `database` | string | * | — | Database name |
| `url` | string | * | — | Connection string (alternative) |
| `ssl` | bool/object | No | — | SSL configuration |
| `readOnly` | boolean | No | true | Read-only mode |
| `enabled` | boolean | No | true | Enable/disable |
| `poolSize` | number | No | 5 | Max pool connections |

*Either `url` or `host` + `user` + `database` is required.

### Environment Variables

Use `${VAR}` or `${VAR:-default}` in config values:

```json
{
  "password": "${MYSQL_PASSWORD}",
  "user": "${MYSQL_USER:-readonly}"
}
```

## CLI Options

| Option | Description |
|---|---|
| `--config <path>` | Config file path |
| `--label <name>` | Restrict to single database |

Environment: `MCP_MYSQL_CONFIG` — config file path (fallback)

## Security

See [SECURITY.md](SECURITY.md) for the full security model.

## License

MIT
