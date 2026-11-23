import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import Database from "better-sqlite3";
import { createApp } from "./app.js";
import { wrapSqliteAsPool } from "./db/sqlite-pool.js";
import { migrateSqlite } from "./db/sqlite-migrate.js";

const { values } = parseArgs({
  options: {
    "db-path": {
      type: "string",
      default: ":memory:",
    },
    port: {
      type: "string",
      default: "0",
    },
  },
  strict: false,
});

const dbPath = values["db-path"] || ":memory:";
const port = parseInt(values.port || "0", 10);

if (dbPath !== ":memory:") {
  const dir = path.dirname(path.resolve(dbPath));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const db = new Database(dbPath);
const pool = wrapSqliteAsPool(db);
migrateSqlite(db);

const app = createApp(pool);
const server = app.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const assignedPort = typeof address === "object" && address !== null ? address.port : port;
  console.log(JSON.stringify({ port: assignedPort }));
});

function shutdown(signal) {
  server.close(async () => {
    try {
      await pool.end();
    } catch {
      // ignore
    }
    process.exit(0);
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
