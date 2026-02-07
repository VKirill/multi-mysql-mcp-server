# Multi-MySQL MCP Server

[![CI](https://github.com/VKirill/multi-mysql-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/VKirill/multi-mysql-mcp-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Model_Context_Protocol-purple)](https://modelcontextprotocol.io/)

[English](#english) | [Русский](#русский) | [中文](#中文)

---

## English

A **Model Context Protocol (MCP) server** for MySQL and MariaDB — designed for AI coding assistants like [Claude Code](https://claude.ai), [Cursor](https://cursor.com), [Windsurf](https://codeium.com/windsurf), [GitHub Copilot](https://github.com/features/copilot), and any [MCP-compatible client](https://modelcontextprotocol.io/).

**One server, many databases.** Connect multiple MySQL and MariaDB databases through a single MCP server with built-in SQL injection protection, read-only mode, connection pooling, and hot-reload configuration.

### Why Use This?

- **AI-native database access** — let Claude, Cursor, or Copilot query your MySQL databases directly
- **Multi-database** — manage all your MySQL connections from one MCP server
- **Secure by default** — state-machine SQL injection parser, read-only transactions, prepared statements
- **Hot-reload config** — change connections without restarting the server
- **Per-project isolation** — use `--label` to expose only relevant databases
- **7 powerful tools** — query, describe, explain, health check and more
- **Broad compatibility** — MySQL 5.7–9.x, MariaDB 10.x–11.x, AWS RDS, Azure, GCP, PlanetScale

### Tools

| Tool | Description |
|---|---|
| `mysql_list_databases` | List all configured database connections with status |
| `mysql_query` | Execute SQL queries with read-only enforcement and SQL injection protection |
| `mysql_list_tables` | List tables with row counts, storage engine (InnoDB, MyISAM), and data size |
| `mysql_describe_table` | Show columns, types, indexes, primary keys, foreign keys, and constraints |
| `mysql_list_schemas` | List all databases/schemas available on the MySQL server |
| `mysql_health_check` | Test connectivity, MySQL version, and response latency |
| `mysql_explain` | Run EXPLAIN ANALYZE with automatic ROLLBACK for safety |

### Quick Start

#### Install

```bash
git clone https://github.com/VKirill/multi-mysql-mcp-server.git
cd multi-mysql-mcp-server
npm install
npm run build
```

#### Configure

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

#### Add to Claude Code

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

#### Add to Cursor

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

#### Docker

```bash
docker build -t mcp-mysql .
docker run -v /path/to/config.json:/app/config.json mcp-mysql --config /app/config.json
```

### Configuration

#### Connection Fields

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

#### Environment Variables in Config

Use `${VAR}` or `${VAR:-default}` syntax in any config string value:

```json
{
  "host": "${MYSQL_HOST:-localhost}",
  "user": "${MYSQL_USER}",
  "password": "${MYSQL_PASSWORD}"
}
```

#### CLI Options

| Option | Description |
|---|---|
| `--config <path>` | Path to config file (default: `~/.mcp-mysql/config.json`) |
| `--label <name>` | Restrict server to a single database (per-project isolation) |

Environment variable: `MCP_MYSQL_CONFIG` — alternative config file path.

### Security

- **SQL injection protection** — state-machine parser detects multi-statement queries, handles MySQL-specific syntax (backtick identifiers, `#` comments, backslash escapes)
- **DDL protection** — blocks CREATE, DROP, ALTER, TRUNCATE statements
- **Prepared statements** — all user parameters go through `connection.execute()` with `?` placeholders
- **Read-only by default** — `SET SESSION TRANSACTION READ ONLY` wraps all queries in transactions
- **EXPLAIN safety** — EXPLAIN ANALYZE always wrapped in transaction with ROLLBACK
- **Config permissions** — warns if config file is world-readable on Unix
- **Zod validation** — config file validated with strict schemas

See [SECURITY.md](SECURITY.md) for the full security model and responsible disclosure policy.

### Compatibility

- **MySQL** 5.7, 8.0, 8.4, 9.x
- **MariaDB** 10.x, 11.x
- **Cloud**: AWS RDS, Azure Database for MySQL, Google Cloud SQL, PlanetScale, Aiven
- **Node.js** >= 18
- **MCP clients**: Claude Code, Cursor, Windsurf, GitHub Copilot, VS Code, any MCP-compatible tool

### Related Projects

- [multi-postgres-mcp-server](https://github.com/VKirill/multi-postgres-mcp-server) — Same architecture for PostgreSQL

---

## Русский

**MCP-сервер для MySQL и MariaDB** — предназначен для AI-ассистентов: [Claude Code](https://claude.ai), [Cursor](https://cursor.com), [Windsurf](https://codeium.com/windsurf), [GitHub Copilot](https://github.com/features/copilot) и любых [MCP-совместимых клиентов](https://modelcontextprotocol.io/).

**Один сервер — много баз данных.** Подключайте несколько MySQL и MariaDB баз через один MCP-сервер со встроенной защитой от SQL-инъекций, режимом read-only, пулом соединений и горячей перезагрузкой конфигурации.

### Преимущества

- **AI-нативный доступ к БД** — Claude, Cursor или Copilot напрямую запрашивают ваши MySQL базы
- **Мульти-база** — все MySQL-подключения в одном MCP-сервере
- **Безопасность по умолчанию** — state-machine парсер SQL-инъекций, read-only транзакции, prepared statements
- **Горячая перезагрузка** — меняйте подключения без перезапуска сервера
- **Изоляция по проектам** — `--label` показывает только нужные базы
- **7 инструментов** — запросы, описание таблиц, EXPLAIN, health check и др.
- **Широкая совместимость** — MySQL 5.7–9.x, MariaDB 10.x–11.x, AWS RDS, Azure, GCP, PlanetScale

### Инструменты

| Инструмент | Описание |
|---|---|
| `mysql_list_databases` | Список всех настроенных подключений к БД |
| `mysql_query` | Выполнение SQL-запросов с read-only и защитой от инъекций |
| `mysql_list_tables` | Список таблиц: кол-во строк, движок (InnoDB, MyISAM), размер |
| `mysql_describe_table` | Колонки, типы, индексы, первичные и внешние ключи, ограничения |
| `mysql_list_schemas` | Список всех баз данных/схем на сервере MySQL |
| `mysql_health_check` | Проверка соединения, версия MySQL, задержка |
| `mysql_explain` | EXPLAIN ANALYZE с автоматическим ROLLBACK |

### Быстрый старт

```bash
git clone https://github.com/VKirill/multi-mysql-mcp-server.git
cd multi-mysql-mcp-server
npm install
npm run build
```

Создайте `~/.mcp-mysql/config.json`:

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

Добавьте в Claude Code (`~/.claude.json`):

```json
{
  "mcpServers": {
    "mysql": {
      "type": "stdio",
      "command": "node",
      "args": ["путь/до/dist/index.js", "--config", "путь/до/config.json"]
    }
  }
}
```

### Безопасность

- **Защита от SQL-инъекций** — state-machine парсер обрабатывает backtick-идентификаторы, `#` комментарии, `\` экранирование
- **Защита от DDL** — блокирует CREATE, DROP, ALTER, TRUNCATE
- **Prepared statements** — параметры через `connection.execute()` с `?` плейсхолдерами
- **Read-only по умолчанию** — `SET SESSION TRANSACTION READ ONLY`
- **EXPLAIN** — всегда в транзакции с ROLLBACK
- **Валидация конфига** — Zod-схемы

### Совместимость

- MySQL 5.7, 8.0, 8.4, 9.x | MariaDB 10.x, 11.x
- AWS RDS, Azure Database for MySQL, Google Cloud SQL, PlanetScale, Aiven
- Node.js >= 18
- Claude Code, Cursor, Windsurf, GitHub Copilot, VS Code

---

## 中文

**MySQL 和 MariaDB 的 MCP 服务器** — 专为 AI 编码助手设计：[Claude Code](https://claude.ai)、[Cursor](https://cursor.com)、[Windsurf](https://codeium.com/windsurf)、[GitHub Copilot](https://github.com/features/copilot) 以及任何 [MCP 兼容客户端](https://modelcontextprotocol.io/)。

**一个服务器，多个数据库。** 通过单个 MCP 服务器连接多个 MySQL 和 MariaDB 数据库，内置 SQL 注入防护、只读模式、连接池和热重载配置。

### 优势

- **AI 原生数据库访问** — 让 Claude、Cursor 或 Copilot 直接查询你的 MySQL 数据库
- **多数据库** — 在一个 MCP 服务器中管理所有 MySQL 连接
- **默认安全** — 状态机 SQL 注入解析器、只读事务、预处理语句
- **热重载配置** — 更改连接无需重启服务器
- **项目隔离** — 使用 `--label` 仅暴露相关数据库
- **7 个工具** — 查询、表描述、EXPLAIN、健康检查等
- **广泛兼容** — MySQL 5.7–9.x、MariaDB 10.x–11.x、AWS RDS、Azure、GCP、PlanetScale

### 工具列表

| 工具 | 说明 |
|---|---|
| `mysql_list_databases` | 列出所有已配置的数据库连接及状态 |
| `mysql_query` | 执行 SQL 查询，强制只读模式并防止 SQL 注入 |
| `mysql_list_tables` | 列出表：行数、存储引擎（InnoDB、MyISAM）、数据大小 |
| `mysql_describe_table` | 显示列、类型、索引、主键、外键和约束 |
| `mysql_list_schemas` | 列出 MySQL 服务器上所有数据库/模式 |
| `mysql_health_check` | 测试连接、MySQL 版本和响应延迟 |
| `mysql_explain` | 执行 EXPLAIN ANALYZE 并自动 ROLLBACK |

### 快速开始

```bash
git clone https://github.com/VKirill/multi-mysql-mcp-server.git
cd multi-mysql-mcp-server
npm install
npm run build
```

创建 `~/.mcp-mysql/config.json`：

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

添加到 Claude Code 配置（`~/.claude.json`）：

```json
{
  "mcpServers": {
    "mysql": {
      "type": "stdio",
      "command": "node",
      "args": ["dist/index.js的路径", "--config", "config.json的路径"]
    }
  }
}
```

### 安全性

- **SQL 注入防护** — 状态机解析器处理反引号标识符、`#` 注释、`\` 转义
- **DDL 防护** — 阻止 CREATE、DROP、ALTER、TRUNCATE 语句
- **预处理语句** — 通过 `connection.execute()` 使用 `?` 占位符
- **默认只读** — `SET SESSION TRANSACTION READ ONLY`
- **EXPLAIN 安全** — 始终在事务中执行并 ROLLBACK
- **配置验证** — Zod 模式验证

### 兼容性

- MySQL 5.7、8.0、8.4、9.x | MariaDB 10.x、11.x
- AWS RDS、Azure Database for MySQL、Google Cloud SQL、PlanetScale、Aiven
- Node.js >= 18
- Claude Code、Cursor、Windsurf、GitHub Copilot、VS Code

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT — see [LICENSE](LICENSE) for details.
