#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import mysql from "mysql2/promise";
import { readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { platform } from "os";

// ─── CLI args & env ───────────────────────────────────────────────

const HOME = process.env.USERPROFILE || process.env.HOME || "";

function getArg(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith("--")) return null;
  return next;
}

/** --config <path>  or  MCP_MYSQL_CONFIG env  or  default */
const CONFIG_PATH = resolve(
  getArg("--config") ||
    process.env.MCP_MYSQL_CONFIG ||
    join(HOME, ".mcp-mysql", "config.json")
);

/** --label <name>  — if set, only this database is visible */
const LABEL_FILTER = getArg("--label");

// ─── Zod Schemas ─────────────────────────────────────────────────

const SslConfigSchema = z.union([
  z.literal(true),
  z.object({
    rejectUnauthorized: z.boolean().optional(),
    ca: z.string().optional(),
    cert: z.string().optional(),
    key: z.string().optional(),
  }),
]);

const DbConnectionSchema = z
  .object({
    label: z.string().min(1, "Label is required"),
    host: z.string().optional(),
    port: z.coerce.number().int().positive().default(3306),
    user: z.string().optional(),
    password: z.string().default(""),
    database: z.string().optional(),
    url: z.string().optional(),
    enabled: z.boolean().default(true),
    ssl: SslConfigSchema.optional(),
    readOnly: z.boolean().default(true),
    poolSize: z.coerce.number().int().min(1).max(100).default(5),
  })
  .refine((c) => c.url || (c.host && c.user && c.database), {
    message: "Provide either 'url' or 'host' + 'user' + 'database'",
  });

type DbConnection = z.infer<typeof DbConnectionSchema>;

const DbConfigSchema = z.object({
  connections: z.union([
    z.array(DbConnectionSchema),
    z.record(z.string(), DbConnectionSchema),
  ]),
});

// ─── Connection Pool Management ──────────────────────────────────

interface PoolEntry {
  pool: mysql.Pool;
  hash: string;
}

const pools = new Map<string, PoolEntry>();

function connHash(c: DbConnection): string {
  return JSON.stringify({
    h: c.host,
    p: c.port,
    u: c.user,
    pw: c.password,
    d: c.database,
    url: c.url,
    ssl: c.ssl,
    ps: c.poolSize,
  });
}

function getOrCreatePool(conn: DbConnection): mysql.Pool {
  const hash = connHash(conn);
  const existing = pools.get(conn.label);
  if (existing && existing.hash === hash) return existing.pool;

  // Config changed — close old pool
  if (existing) {
    existing.pool.end().catch((e) =>
      console.error(`Pool close error (${conn.label}):`, e)
    );
  }

  const cfg: mysql.PoolOptions = {
    connectTimeout: 10_000,
    waitForConnections: true,
    connectionLimit: conn.poolSize,
    idleTimeout: 60_000,
    enableKeepAlive: true,
  };

  if (conn.url) {
    cfg.uri = conn.url;
  } else {
    cfg.host = conn.host;
    cfg.port = conn.port;
    cfg.user = conn.user;
    cfg.password = conn.password;
    cfg.database = conn.database;
  }

  if (conn.ssl) {
    cfg.ssl = conn.ssl === true ? {} : conn.ssl;
  }

  const pool = mysql.createPool(cfg);
  pool.on("connection", (connection) => {
    // Set query timeout per connection (30s)
    connection.query("SET SESSION max_execution_time = 30000").catch(() => {});
  });
  pools.set(conn.label, { pool, hash });
  return pool;
}

async function drainAllPools(): Promise<void> {
  const tasks = [...pools.values()].map((e) => e.pool.end().catch(() => {}));
  pools.clear();
  await Promise.all(tasks);
}

// ─── Environment Variable Substitution ───────────────────────────

/**
 * Replaces `${VAR}` patterns in string values with process.env values.
 * Supports `${VAR:-default}` syntax for defaults when env var is unset.
 */
export function resolveEnvVars(obj: unknown): unknown {
  if (typeof obj === "string") {
    return obj.replace(/\$\{([^}]+)\}/g, (_, expr: string) => {
      const [name, ...rest] = expr.split(":-");
      const fallback = rest.join(":-");
      return process.env[name.trim()] ?? fallback ?? "";
    });
  }
  if (Array.isArray(obj)) return obj.map(resolveEnvVars);
  if (obj !== null && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = resolveEnvVars(v);
    }
    return out;
  }
  return obj;
}

// ─── Config Caching ──────────────────────────────────────────────

interface ConfigCache {
  connections: DbConnection[];
  mtime: number;
  loadedAt: number;
}

const CONFIG_CACHE_TTL = 5_000; // 5 seconds
let configCache: ConfigCache | null = null;

// ─── Config Loading ──────────────────────────────────────────────

async function loadConfig(): Promise<DbConnection[]> {
  try {
    // Check cache: reuse if TTL not expired and file unchanged
    if (configCache) {
      const elapsed = Date.now() - configCache.loadedAt;
      if (elapsed < CONFIG_CACHE_TTL) return configCache.connections;

      // TTL expired — check mtime
      try {
        const s = await stat(CONFIG_PATH);
        if (s.mtimeMs === configCache.mtime) {
          configCache.loadedAt = Date.now(); // refresh TTL
          return configCache.connections;
        }
      } catch {
        // File deleted or inaccessible — fall through to full reload
      }
    }

    const raw = await readFile(CONFIG_PATH, "utf-8");
    const jsonWithEnv = resolveEnvVars(JSON.parse(raw));
    const parsed = DbConfigSchema.parse(jsonWithEnv);

    let connections: DbConnection[];
    if (Array.isArray(parsed.connections)) {
      connections = parsed.connections;
    } else {
      connections = Object.values(parsed.connections);
    }

    // Detect duplicate labels
    const seen = new Set<string>();
    for (const c of connections) {
      if (seen.has(c.label)) {
        console.error(
          `Warning: duplicate label "${c.label}" in config — using first occurrence`
        );
      }
      seen.add(c.label);
    }

    // Deduplicate (keep first)
    connections = connections.filter(
      (c, i, arr) => arr.findIndex((x) => x.label === c.label) === i
    );

    connections = connections.filter((c) => c.enabled !== false);

    if (LABEL_FILTER) {
      connections = connections.filter((c) => c.label === LABEL_FILTER);
    }

    // Update cache
    try {
      const s = await stat(CONFIG_PATH);
      configCache = { connections, mtime: s.mtimeMs, loadedAt: Date.now() };
    } catch {
      configCache = { connections, mtime: 0, loadedAt: Date.now() };
    }

    return connections;
  } catch (e) {
    if (!existsSync(CONFIG_PATH)) {
      console.error(`Config not found: ${CONFIG_PATH}`);
      console.error(
        "Create it with your database connections. See README for format."
      );
    } else if (e instanceof z.ZodError) {
      console.error(`Invalid config (${CONFIG_PATH}):`);
      for (const issue of e.issues) {
        console.error(`  ${issue.path.join(".")}: ${issue.message}`);
      }
    } else {
      console.error(`Failed to read config: ${CONFIG_PATH}`, e);
    }
    return [];
  }
}

async function getConnection(label: string): Promise<DbConnection> {
  const connections = await loadConfig();
  const conn = connections.find((c) => c.label === label);
  if (!conn) {
    const available = connections.map((c) => c.label).join(", ") || "(none)";
    throw new Error(`Database "${label}" not found. Available: ${available}`);
  }
  return conn;
}

// ─── SQL Safety ──────────────────────────────────────────────────

/**
 * Detects multi-statement SQL to prevent injection via statement stacking.
 * Strips comments, string literals, and backtick-quoted identifiers before
 * checking for semicolons. Returns true only if the SQL is a single statement.
 *
 * MySQL variant: handles backtick identifiers instead of dollar-quoting.
 */
export function isSingleStatement(sql: string): boolean {
  let i = 0;
  const len = sql.length;

  while (i < len) {
    const ch = sql[i];
    const next = i + 1 < len ? sql[i + 1] : "";

    // -- single-line comment → skip to EOL
    if (ch === "-" && next === "-") {
      i = sql.indexOf("\n", i);
      if (i === -1) return true;
      i++;
      continue;
    }

    // # single-line comment (MySQL-specific) → skip to EOL
    if (ch === "#") {
      i = sql.indexOf("\n", i);
      if (i === -1) return true;
      i++;
      continue;
    }

    // /* block comment */ → skip to closing
    if (ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) return true;
      i = end + 2;
      continue;
    }

    // 'single-quoted string' with '' and \' escape
    if (ch === "'") {
      i++;
      while (i < len) {
        if (sql[i] === "\\") {
          i += 2; // skip escaped character
          continue;
        }
        if (sql[i] === "'") {
          if (i + 1 < len && sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          break;
        }
        i++;
      }
      i++;
      continue;
    }

    // "double-quoted string" (MySQL with ANSI_QUOTES or string)
    if (ch === '"') {
      i++;
      while (i < len) {
        if (sql[i] === "\\") {
          i += 2;
          continue;
        }
        if (sql[i] === '"') {
          if (i + 1 < len && sql[i + 1] === '"') {
            i += 2;
            continue;
          }
          break;
        }
        i++;
      }
      i++;
      continue;
    }

    // `backtick-quoted identifier` (MySQL-specific)
    if (ch === "`") {
      i++;
      while (i < len) {
        if (sql[i] === "`") {
          if (i + 1 < len && sql[i + 1] === "`") {
            i += 2; // escaped backtick
            continue;
          }
          break;
        }
        i++;
      }
      i++;
      continue;
    }

    // Semicolon — reject if anything meaningful follows
    if (ch === ";") {
      const rest = sql.substring(i + 1).trim();
      if (rest.length > 0) return false;
    }

    i++;
  }

  return true;
}

// ─── Helpers ─────────────────────────────────────────────────────

function errorResult(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return {
    content: [{ type: "text" as const, text: `Error: ${msg}` }],
    isError: true,
  };
}

async function withPool<T>(
  label: string,
  fn: (conn: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const dbConn = await getConnection(label);
  const pool = getOrCreatePool(dbConn);
  const connection = await pool.getConnection();
  try {
    return await fn(connection);
  } finally {
    connection.release();
  }
}

// ─── MCP Server ──────────────────────────────────────────────────

const server = new McpServer({
  name: "mysql",
  version: "1.0.0",
});

// Tool 1: List databases
server.tool(
  "mysql_list_databases",
  "List all available MySQL databases",
  {},
  async () => {
    const connections = await loadConfig();
    if (connections.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No databases available.\nConfig: ${CONFIG_PATH}${LABEL_FILTER ? `\nFilter: --label ${LABEL_FILTER}` : ""}`,
          },
        ],
      };
    }

    const lines = connections.map((c) => {
      const addr = c.url
        ? "(connection string)"
        : `${c.user}@${c.host}:${c.port}/${c.database}`;
      const flags: string[] = [];
      if (c.ssl) flags.push("SSL");
      if (!c.readOnly) flags.push("RW");
      const suffix = flags.length ? ` [${flags.join(", ")}]` : "";
      return `- ${c.label}: ${addr}${suffix}`;
    });

    return {
      content: [
        {
          type: "text",
          text: `Available databases (${connections.length}):\n${lines.join("\n")}`,
        },
      ],
    };
  }
);

// Tool 2: Execute SQL query
server.tool(
  "mysql_query",
  "Execute a SQL query against a MySQL database. Read-only by default; write queries allowed only if the connection is configured with readOnly: false.",
  {
    database: z.string().describe("Database label from config"),
    query: z.string().describe("SQL query to execute"),
    params: z
      .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional()
      .describe("Optional query parameters for ? placeholders"),
    limit: z
      .coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe("Max rows to return (truncates results if exceeded)"),
  },
  async ({ database, query, params, limit }) => {
    try {
      // SQL injection protection: reject multi-statement queries
      if (!isSingleStatement(query)) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Multi-statement queries are not allowed. Send one statement at a time.",
            },
          ],
          isError: true,
        };
      }

      const conn = await getConnection(database);

      const result = await withPool(database, async (connection) => {
        if (conn.readOnly) {
          await connection.query("SET SESSION TRANSACTION READ ONLY");
        }
        await connection.beginTransaction();
        try {
          const [rows, fields] = params
            ? await connection.execute(query, params)
            : await connection.execute(query);
          await connection.commit();
          return { rows, fields };
        } catch (e) {
          await connection.rollback().catch(() => {});
          throw e;
        } finally {
          if (conn.readOnly) {
            // Reset transaction mode for pool reuse
            await connection
              .query("SET SESSION TRANSACTION READ WRITE")
              .catch(() => {});
          }
        }
      });

      const rows = result.rows as Record<string, unknown>[];
      const fields = result.fields;

      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        const affected =
          (result.rows as mysql.ResultSetHeader)?.affectedRows ?? 0;
        return {
          content: [
            {
              type: "text",
              text: `Query executed. ${affected} row(s) affected. No rows returned.`,
            },
          ],
        };
      }

      const columns = fields
        ? (fields as mysql.FieldPacket[]).map((f) => f.name)
        : Object.keys(rows[0]);
      const totalRows = rows.length;
      const displayRows =
        limit && totalRows > limit ? rows.slice(0, limit) : rows;
      const truncated = limit && totalRows > limit;

      const payload: Record<string, unknown> = {
        columns,
        rows: displayRows,
        rowCount: totalRows,
      };
      if (truncated) {
        payload.truncated = true;
        payload.totalRows = totalRows;
        payload.limit = limit;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    } catch (e) {
      return errorResult(e);
    }
  }
);

// Tool 3: List tables
server.tool(
  "mysql_list_tables",
  "List tables in a MySQL database with row counts and engine info",
  {
    database: z.string().describe("Database label from config"),
  },
  async ({ database }) => {
    try {
      const conn = await getConnection(database);
      const dbName = conn.database || conn.url?.split("/").pop()?.split("?")[0];

      const result = await withPool(database, (connection) =>
        connection.execute(
          `SELECT TABLE_NAME AS table_name,
                  TABLE_ROWS AS estimated_rows,
                  ENGINE AS engine,
                  ROUND(DATA_LENGTH / 1024 / 1024, 2) AS data_size_mb
           FROM INFORMATION_SCHEMA.TABLES
           WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
           ORDER BY TABLE_NAME`,
          [dbName]
        )
      );

      const rows = (result as [mysql.RowDataPacket[], mysql.FieldPacket[]])[0];

      if (rows.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No tables found in database "${dbName}".`,
            },
          ],
        };
      }

      const lines = rows.map(
        (r) =>
          `- ${r.table_name} (~${r.estimated_rows ?? 0} rows, ${r.engine}, ${r.data_size_mb}MB)`
      );
      return {
        content: [
          {
            type: "text",
            text: `Tables in "${dbName}" (${rows.length}):\n${lines.join("\n")}`,
          },
        ],
      };
    } catch (e) {
      return errorResult(e);
    }
  }
);

// Tool 4: Describe table (with indexes)
server.tool(
  "mysql_describe_table",
  "Describe columns, types, constraints, and indexes of a MySQL table",
  {
    database: z.string().describe("Database label from config"),
    table: z.string().describe("Table name"),
  },
  async ({ database, table }) => {
    try {
      const conn = await getConnection(database);
      const dbName = conn.database || conn.url?.split("/").pop()?.split("?")[0];

      const result = await withPool(database, async (connection) => {
        const [cols] = await connection.execute(
          `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT,
                  COLUMN_KEY, EXTRA
           FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
           ORDER BY ORDINAL_POSITION`,
          [dbName, table]
        );

        const [fks] = await connection.execute(
          `SELECT COLUMN_NAME, REFERENCED_TABLE_SCHEMA,
                  REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
           FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
             AND REFERENCED_TABLE_NAME IS NOT NULL`,
          [dbName, table]
        );

        const [idxs] = await connection.execute(
          `SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns,
                  NON_UNIQUE, INDEX_TYPE
           FROM INFORMATION_SCHEMA.STATISTICS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
           GROUP BY INDEX_NAME, NON_UNIQUE, INDEX_TYPE
           ORDER BY INDEX_NAME`,
          [dbName, table]
        );

        return {
          cols: cols as mysql.RowDataPacket[],
          fks: fks as mysql.RowDataPacket[],
          idxs: idxs as mysql.RowDataPacket[],
        };
      });

      if (result.cols.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `Table "${dbName}"."${table}" not found or has no columns.`,
            },
          ],
        };
      }

      const fkMap = new Map<string, string>();
      for (const fk of result.fks) {
        fkMap.set(
          fk.COLUMN_NAME,
          `-> ${fk.REFERENCED_TABLE_SCHEMA}.${fk.REFERENCED_TABLE_NAME}(${fk.REFERENCED_COLUMN_NAME})`
        );
      }

      const colLines = result.cols.map((col) => {
        const parts = [`  ${col.COLUMN_NAME}: ${col.COLUMN_TYPE}`];
        if (col.COLUMN_KEY === "PRI") parts.push("[PK]");
        if (col.COLUMN_KEY === "UNI") parts.push("[UNIQUE]");
        if (col.IS_NULLABLE === "NO") parts.push("NOT NULL");
        if (col.COLUMN_DEFAULT !== null)
          parts.push(`DEFAULT ${col.COLUMN_DEFAULT}`);
        if (col.EXTRA) parts.push(col.EXTRA);
        if (fkMap.has(col.COLUMN_NAME))
          parts.push(`[FK ${fkMap.get(col.COLUMN_NAME)}]`);
        return parts.join(" ");
      });

      let text = `Table "${dbName}"."${table}" (${result.cols.length} columns):\n${colLines.join("\n")}`;

      if (result.idxs.length > 0) {
        const idxLines = result.idxs.map((idx) => {
          const unique = idx.NON_UNIQUE === 0 ? "UNIQUE " : "";
          return `  ${idx.INDEX_NAME}: ${unique}${idx.INDEX_TYPE} (${idx.columns})`;
        });
        text += `\n\nIndexes (${result.idxs.length}):\n${idxLines.join("\n")}`;
      }

      return { content: [{ type: "text", text }] };
    } catch (e) {
      return errorResult(e);
    }
  }
);

// Tool 5: List schemas (databases)
server.tool(
  "mysql_list_schemas",
  "List all databases/schemas in a MySQL server",
  {
    database: z.string().describe("Database label from config (used for connection)"),
  },
  async ({ database }) => {
    try {
      const result = await withPool(database, (connection) =>
        connection.execute(
          `SELECT s.SCHEMA_NAME,
                  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES t
                   WHERE t.TABLE_SCHEMA = s.SCHEMA_NAME) AS table_count
           FROM INFORMATION_SCHEMA.SCHEMATA s
           ORDER BY s.SCHEMA_NAME`
        )
      );

      const rows = (result as [mysql.RowDataPacket[], mysql.FieldPacket[]])[0];
      const lines = rows.map(
        (r) => `- ${r.SCHEMA_NAME} (${r.table_count} tables)`
      );
      return {
        content: [
          {
            type: "text",
            text: `Schemas (${rows.length}):\n${lines.join("\n")}`,
          },
        ],
      };
    } catch (e) {
      return errorResult(e);
    }
  }
);

// Tool 6: Health check
server.tool(
  "mysql_health_check",
  "Test database connectivity and return MySQL version and response latency",
  {
    database: z.string().describe("Database label from config"),
  },
  async ({ database }) => {
    try {
      const start = Date.now();
      const result = await withPool(database, (connection) =>
        connection.execute("SELECT VERSION() AS version, NOW() AS server_time")
      );
      const latencyMs = Date.now() - start;

      const rows = (result as [mysql.RowDataPacket[], mysql.FieldPacket[]])[0];
      const row = rows[0];
      return {
        content: [
          {
            type: "text",
            text: [
              `Database: ${database}`,
              `Status: connected`,
              `Latency: ${latencyMs}ms`,
              `Version: ${row.version}`,
              `Server time: ${row.server_time}`,
            ].join("\n"),
          },
        ],
      };
    } catch (e) {
      return errorResult(e);
    }
  }
);

// Tool 7: Explain query
server.tool(
  "mysql_explain",
  "Run EXPLAIN on a query and return the execution plan. Uses EXPLAIN ANALYZE on MySQL 8.0.18+, falls back to EXPLAIN FORMAT=JSON on older versions.",
  {
    database: z.string().describe("Database label from config"),
    query: z.string().describe("SQL query to analyze"),
    params: z
      .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional()
      .describe("Optional query parameters for ? placeholders"),
  },
  async ({ database, query, params }) => {
    try {
      if (!isSingleStatement(query)) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Multi-statement queries are not allowed.",
            },
          ],
          isError: true,
        };
      }

      // EXPLAIN ANALYZE actually executes the query in MySQL, so we must
      // wrap in a transaction that always rolls back to prevent data changes.
      const conn = await getConnection(database);
      const result = await withPool(database, async (connection) => {
        if (conn.readOnly) {
          await connection.query("SET SESSION TRANSACTION READ ONLY");
        }
        await connection.beginTransaction();
        try {
          let rows: mysql.RowDataPacket[];
          try {
            const explainQuery = `EXPLAIN ANALYZE ${query}`;
            const [r] = params
              ? await connection.execute(explainQuery, params)
              : await connection.execute(explainQuery);
            rows = r as mysql.RowDataPacket[];
          } catch {
            // Fallback for older MySQL versions
            const explainQuery = `EXPLAIN FORMAT=JSON ${query}`;
            const [r] = params
              ? await connection.execute(explainQuery, params)
              : await connection.execute(explainQuery);
            rows = r as mysql.RowDataPacket[];
          }
          return rows;
        } finally {
          // Always rollback — EXPLAIN ANALYZE may have modified data
          await connection.rollback().catch(() => {});
          if (conn.readOnly) {
            await connection
              .query("SET SESSION TRANSACTION READ WRITE")
              .catch(() => {});
          }
        }
      });

      let plan: string;

      if (result.length === 1 && result[0].EXPLAIN) {
        // EXPLAIN FORMAT=JSON result
        plan = JSON.stringify(JSON.parse(result[0].EXPLAIN), null, 2);
      } else {
        // EXPLAIN ANALYZE result or regular EXPLAIN
        plan = result
          .map((r) => Object.values(r).join("\t"))
          .join("\n");
      }

      return {
        content: [{ type: "text", text: plan }],
      };
    } catch (e) {
      return errorResult(e);
    }
  }
);

// ─── Config Permission Check ─────────────────────────────────────

async function checkConfigPermissions(): Promise<void> {
  if (platform() === "win32") return;

  try {
    const s = await stat(CONFIG_PATH);
    const mode = s.mode & 0o777;
    if (mode & 0o077) {
      console.error(
        `Warning: Config file ${CONFIG_PATH} has permissions ${mode.toString(8)}. ` +
          `Consider restricting with: chmod 600 ${CONFIG_PATH}`
      );
    }
  } catch {
    // File doesn't exist yet or can't stat — skip
  }
}

// ─── Graceful Shutdown ───────────────────────────────────────────

async function shutdown() {
  console.error("Shutting down — draining connection pools...");
  await drainAllPools();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// ─── Start ───────────────────────────────────────────────────────

async function main() {
  await checkConfigPermissions();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const mode = LABEL_FILTER ? `label="${LABEL_FILTER}"` : "all databases";
  console.error(`mcp-mysql started (${mode}) | config: ${CONFIG_PATH}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
