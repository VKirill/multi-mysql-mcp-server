import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isSingleStatement, isDdlStatement, resolveEnvVars } from "../index.js";

// ─── resolveEnvVars ──────────────────────────────────────────────

describe("resolveEnvVars", () => {
  const ORIG_ENV = { ...process.env };

  beforeEach(() => {
    process.env.TEST_HOST = "localhost";
    process.env.TEST_PORT = "3306";
    process.env.TEST_PASS = "s3cret";
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  it("replaces ${VAR} in a string", () => {
    expect(resolveEnvVars("host=${TEST_HOST}")).toBe("host=localhost");
  });

  it("replaces multiple vars in one string", () => {
    expect(resolveEnvVars("${TEST_HOST}:${TEST_PORT}")).toBe("localhost:3306");
  });

  it("returns empty string for unset var without default", () => {
    expect(resolveEnvVars("${NONEXISTENT_VAR_XYZ}")).toBe("");
  });

  it("uses default value with ${VAR:-default} syntax", () => {
    expect(resolveEnvVars("${NONEXISTENT_VAR_XYZ:-fallback}")).toBe("fallback");
  });

  it("prefers env var over default when var is set", () => {
    expect(resolveEnvVars("${TEST_HOST:-other}")).toBe("localhost");
  });

  it("processes strings in objects recursively", () => {
    const input = { host: "${TEST_HOST}", port: 3306, nested: { pass: "${TEST_PASS}" } };
    const result = resolveEnvVars(input) as Record<string, unknown>;
    expect(result.host).toBe("localhost");
    expect(result.port).toBe(3306);
    expect((result.nested as Record<string, unknown>).pass).toBe("s3cret");
  });

  it("processes strings in arrays", () => {
    const input = ["${TEST_HOST}", "${TEST_PORT}"];
    expect(resolveEnvVars(input)).toEqual(["localhost", "3306"]);
  });

  it("passes through non-string primitives unchanged", () => {
    expect(resolveEnvVars(42)).toBe(42);
    expect(resolveEnvVars(true)).toBe(true);
    expect(resolveEnvVars(null)).toBe(null);
  });

  it("handles string with no vars unchanged", () => {
    expect(resolveEnvVars("plain text")).toBe("plain text");
  });
});

// ─── isSingleStatement (MySQL variant) ──────────────────────────

describe("isSingleStatement", () => {
  // ─── Single statements (should return TRUE = safe) ──────────────

  describe("returns true for safe single statements", () => {
    it("simple SELECT", () => {
      expect(isSingleStatement("SELECT * FROM users")).toBe(true);
    });

    it("SELECT with WHERE clause", () => {
      expect(isSingleStatement("SELECT id FROM users WHERE name = 'test'")).toBe(true);
    });

    it("trailing semicolon (no content after it)", () => {
      expect(isSingleStatement("SELECT 1;")).toBe(true);
    });

    it("trailing semicolon with whitespace after", () => {
      expect(isSingleStatement("SELECT 1;   ")).toBe(true);
    });

    it("empty string", () => {
      expect(isSingleStatement("")).toBe(true);
    });

    it("complex query with JOIN", () => {
      expect(
        isSingleStatement(
          "SELECT u.id, p.title FROM users u JOIN posts p ON u.id = p.user_id WHERE u.active = true"
        )
      ).toBe(true);
    });

    it("INSERT statement", () => {
      expect(
        isSingleStatement("INSERT INTO users (name, email) VALUES ('John', 'john@example.com')")
      ).toBe(true);
    });

    it("UPDATE statement", () => {
      expect(
        isSingleStatement("UPDATE users SET name = 'Jane' WHERE id = 1")
      ).toBe(true);
    });

    it("DELETE statement", () => {
      expect(isSingleStatement("DELETE FROM users WHERE id = 1")).toBe(true);
    });
  });

  // ─── Semicolons inside string literals ────────────────────────────

  describe("ignores semicolons inside single-quoted strings", () => {
    it("semicolon in single-quoted value", () => {
      expect(isSingleStatement("SELECT * FROM users WHERE name = 'foo;bar'")).toBe(true);
    });

    it("multiple semicolons inside single-quoted string", () => {
      expect(isSingleStatement("SELECT * FROM t WHERE x = 'a;b;c;d'")).toBe(true);
    });

    it("escaped single quotes (SQL double-quote escape)", () => {
      expect(isSingleStatement("SELECT * FROM users WHERE name = 'O''Brien'")).toBe(true);
    });

    it("backslash-escaped quote in string", () => {
      expect(isSingleStatement("SELECT * FROM t WHERE x = 'it\\'s;here'")).toBe(true);
    });
  });

  // ─── Semicolons inside double-quoted strings ───────────────────

  describe("ignores semicolons inside double-quoted strings", () => {
    it("semicolon in double-quoted string", () => {
      expect(isSingleStatement('SELECT "col;name" FROM users')).toBe(true);
    });

    it("backslash-escaped double quote", () => {
      expect(isSingleStatement('SELECT "escaped\\"quote;here" FROM users')).toBe(true);
    });
  });

  // ─── Semicolons inside backtick identifiers (MySQL-specific) ────

  describe("ignores semicolons inside backtick-quoted identifiers", () => {
    it("semicolon in backtick-quoted column name", () => {
      expect(isSingleStatement("SELECT `col;name` FROM users")).toBe(true);
    });

    it("semicolon in backtick-quoted table name", () => {
      expect(isSingleStatement("SELECT * FROM `my;table`")).toBe(true);
    });

    it("escaped backtick inside identifier", () => {
      expect(isSingleStatement("SELECT `col``with;semi` FROM t")).toBe(true);
    });
  });

  // ─── Semicolons inside comments ───────────────────────────────────

  describe("ignores semicolons inside comments", () => {
    it("semicolon in single-line comment (--)", () => {
      expect(isSingleStatement("SELECT 1 -- ; DROP TABLE users")).toBe(true);
    });

    it("semicolon in hash comment (#) — MySQL-specific", () => {
      expect(isSingleStatement("SELECT 1 # ; DROP TABLE users")).toBe(true);
    });

    it("semicolon in block comment (/* */)", () => {
      expect(isSingleStatement("SELECT /* ; */ 1")).toBe(true);
    });

    it("block comment with multiple semicolons", () => {
      expect(isSingleStatement("SELECT /* ;; ;; */ 1")).toBe(true);
    });

    it("unclosed block comment (treated as single statement)", () => {
      expect(isSingleStatement("SELECT 1 /* ; unclosed")).toBe(true);
    });

    it("unclosed single-line comment at end of input", () => {
      expect(isSingleStatement("SELECT 1 -- this is fine")).toBe(true);
    });

    it("hash comment at end of input", () => {
      expect(isSingleStatement("SELECT 1 # this is fine")).toBe(true);
    });
  });

  // ─── Multi-statement SQL (should return FALSE = dangerous) ────────

  describe("returns false for multi-statement SQL (injection attempts)", () => {
    it("classic SQL injection: SELECT then DROP", () => {
      expect(isSingleStatement("SELECT 1; DROP TABLE users")).toBe(false);
    });

    it("two SELECT statements", () => {
      expect(isSingleStatement("SELECT 1; SELECT 2")).toBe(false);
    });

    it("injection after comment trick (newline after --)", () => {
      expect(isSingleStatement("SELECT 1; -- comment\nDROP TABLE users")).toBe(false);
    });

    it("injection after hash comment (newline after #)", () => {
      expect(isSingleStatement("SELECT 1; # comment\nDROP TABLE users")).toBe(false);
    });

    it("whitespace between statements", () => {
      expect(isSingleStatement("SELECT 1;   SELECT 2")).toBe(false);
    });

    it("semicolon with tab then next statement", () => {
      expect(isSingleStatement("SELECT 1;\tSELECT 2")).toBe(false);
    });

    it("semicolon with newline then next statement", () => {
      expect(isSingleStatement("SELECT 1;\nSELECT 2")).toBe(false);
    });

    it("three statements chained", () => {
      expect(isSingleStatement("SELECT 1; SELECT 2; SELECT 3")).toBe(false);
    });

    it("INSERT then DELETE", () => {
      expect(
        isSingleStatement("INSERT INTO t VALUES (1); DELETE FROM t WHERE id = 1")
      ).toBe(false);
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────

  describe("edge cases", () => {
    it("only whitespace", () => {
      expect(isSingleStatement("   ")).toBe(true);
    });

    it("only a semicolon", () => {
      expect(isSingleStatement(";")).toBe(true);
    });

    it("semicolon followed by only whitespace and newline", () => {
      expect(isSingleStatement(";\n  \t  ")).toBe(true);
    });

    it("multiple trailing semicolons", () => {
      expect(isSingleStatement(";;")).toBe(false);
    });

    it("question mark placeholder is safe", () => {
      expect(isSingleStatement("SELECT * FROM t WHERE id = ?")).toBe(true);
    });

    it("multiple question mark placeholders", () => {
      expect(isSingleStatement("SELECT * FROM t WHERE id = ? AND name = ?")).toBe(true);
    });

    it("mixed: safe content with all quote types", () => {
      expect(
        isSingleStatement(
          "SELECT 'semi;colon', `col;name` FROM t -- trailing; comment"
        )
      ).toBe(true);
    });

    it("semicolon after closing all quoted contexts is still detected", () => {
      expect(isSingleStatement("SELECT 'safe;string'; DROP TABLE users")).toBe(false);
    });

    it("semicolon after backtick-quoted identifier is still detected", () => {
      expect(isSingleStatement("SELECT `safe;col`; DROP TABLE users")).toBe(false);
    });

    it("semicolon after block comment is still detected", () => {
      expect(isSingleStatement("SELECT /* comment */ 1; DROP TABLE users")).toBe(false);
    });
  });

  // ─── MySQL conditional comments /*!...*/ ────────────────────────

  describe("handles MySQL conditional comments /*!...*/", () => {
    it("injection inside conditional comment is detected", () => {
      expect(isSingleStatement("SELECT 1 /*!; DROP TABLE users */")).toBe(false);
    });

    it("injection inside versioned conditional comment", () => {
      expect(isSingleStatement("SELECT 1 /*!50000; DROP TABLE users */")).toBe(false);
    });

    it("safe conditional comment (optimizer hint)", () => {
      expect(isSingleStatement("SELECT /*!50000 SQL_NO_CACHE */ 1")).toBe(true);
    });

    it("conditional comment with no semicolon inside", () => {
      expect(isSingleStatement("SELECT /*!40100 HIGH_PRIORITY */ * FROM t")).toBe(true);
    });

    it("regular block comment still skipped", () => {
      expect(isSingleStatement("SELECT /* ; */ 1")).toBe(true);
    });

    it("conditional comment with semicolon after closing", () => {
      expect(isSingleStatement("SELECT /*!50000 SQL_NO_CACHE */ 1; DROP TABLE t")).toBe(false);
    });
  });
});

// ─── isDdlStatement ─────────────────────────────────────────────

describe("isDdlStatement", () => {
  describe("detects DDL/admin statements", () => {
    it("DROP TABLE", () => {
      expect(isDdlStatement("DROP TABLE users")).toBe(true);
    });

    it("CREATE TABLE", () => {
      expect(isDdlStatement("CREATE TABLE t (id INT)")).toBe(true);
    });

    it("ALTER TABLE", () => {
      expect(isDdlStatement("ALTER TABLE users ADD COLUMN age INT")).toBe(true);
    });

    it("TRUNCATE TABLE", () => {
      expect(isDdlStatement("TRUNCATE TABLE users")).toBe(true);
    });

    it("RENAME TABLE", () => {
      expect(isDdlStatement("RENAME TABLE old_t TO new_t")).toBe(true);
    });

    it("GRANT privilege", () => {
      expect(isDdlStatement("GRANT SELECT ON *.* TO user@host")).toBe(true);
    });

    it("LOAD DATA", () => {
      expect(isDdlStatement("LOAD DATA INFILE '/tmp/data.csv' INTO TABLE t")).toBe(true);
    });

    it("case insensitive", () => {
      expect(isDdlStatement("drop table users")).toBe(true);
    });

    it("with leading whitespace", () => {
      expect(isDdlStatement("   DROP TABLE users")).toBe(true);
    });

    it("with leading comment", () => {
      expect(isDdlStatement("-- header\nDROP TABLE users")).toBe(true);
    });

    it("with leading block comment", () => {
      expect(isDdlStatement("/* admin */ DROP TABLE users")).toBe(true);
    });

    it("with leading hash comment", () => {
      expect(isDdlStatement("# admin\nDROP TABLE users")).toBe(true);
    });
  });

  describe("allows non-DDL statements", () => {
    it("SELECT", () => {
      expect(isDdlStatement("SELECT * FROM users")).toBe(false);
    });

    it("INSERT", () => {
      expect(isDdlStatement("INSERT INTO t VALUES (1)")).toBe(false);
    });

    it("UPDATE", () => {
      expect(isDdlStatement("UPDATE t SET x = 1")).toBe(false);
    });

    it("DELETE", () => {
      expect(isDdlStatement("DELETE FROM t WHERE id = 1")).toBe(false);
    });

    it("SHOW", () => {
      expect(isDdlStatement("SHOW TABLES")).toBe(false);
    });

    it("EXPLAIN", () => {
      expect(isDdlStatement("EXPLAIN SELECT 1")).toBe(false);
    });

    it("SET variable", () => {
      expect(isDdlStatement("SET @x = 1")).toBe(false);
    });

    it("empty string", () => {
      expect(isDdlStatement("")).toBe(false);
    });

    it("only comments", () => {
      expect(isDdlStatement("-- just a comment")).toBe(false);
    });
  });
});
