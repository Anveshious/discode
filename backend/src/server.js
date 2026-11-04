import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { migrate } from "./db/migrate.js";
import { pool } from "./db/pool.js";

await migrate(pool);
const server = createApp(pool).listen(config.port, () => {
  console.log(`Discode API listening on port ${config.port}.`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down.`);
  server.close(async (error) => {
    if (error) {
      console.error("Failed to close the HTTP server cleanly.", error);
      process.exitCode = 1;
    }

    try {
      await pool.end();
    } catch (poolError) {
      console.error("Failed to close the PostgreSQL pool cleanly.", poolError);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
