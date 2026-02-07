# Security Policy

## Overview

`multi-mysql-mcp-server` is a Model Context Protocol (MCP) server that provides
AI coding assistants with access to multiple MySQL/MariaDB databases through a
single process. Security is a first-class design concern.

## Security Model

### 1. Read-Only by Default

All database sessions default to read-only mode via:
```sql
SET SESSION TRANSACTION READ ONLY;
```

### 2. SQL Injection Protection

#### Multi-Statement Detection
State-machine SQL parser strips comments, string literals, and backtick-quoted
identifiers before checking for semicolons. Multi-statement queries are rejected.

#### Parameterized Queries
The `mysql_query` tool supports parameterized queries with `?` placeholders.
Values are sent as bind parameters and never interpolated into SQL.

### 3. Connection Security
- SSL/TLS support for cloud databases
- 10s connection timeout, 30s query timeout
- Connection pooling with idle cleanup (60s)

### 4. Configuration Security
- Local filesystem only, Zod validation
- Environment variable substitution (no plaintext secrets required)
- Permission check on startup (warns if world-readable)

### 5. Database Isolation
`--label` flag restricts to a single connection.

## Recommended MySQL Role Setup

```sql
CREATE USER 'mcp_readonly'@'%' IDENTIFIED BY 'secure_password';
GRANT SELECT ON mydb.* TO 'mcp_readonly'@'%';
FLUSH PRIVILEGES;
```

## Reporting a Vulnerability

Use [GitHub Issues](https://github.com/VKirill/multi-mysql-mcp-server/issues)
with the `security` label.

## Security Design Principles

Defense-in-depth with independent layers:
```
Layer 1: MySQL user privileges (SELECT only)
    Layer 2: Read-only session (SET SESSION TRANSACTION READ ONLY)
        Layer 3: Multi-statement detection (reject semicolons)
            Layer 4: Parameterized queries (no string interpolation)
                Layer 5: Connection timeouts (10s connect, 30s query)
                    Layer 6: --label isolation (single-database exposure)
```

*Last updated: 2026-02-07*
