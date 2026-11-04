import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createApp } from "../src/app.js";

const servers = new Set();

afterEach(async () => {
  await Promise.all([...servers].map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    servers.delete(server);
  })));
});

async function requestHealth(query) {
  const app = createApp({ query });
  const server = app.listen(0);
  servers.add(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  return fetch(`http://127.0.0.1:${port}/api/health`);
}

test("health endpoint reports when PostgreSQL is reachable", async () => {
  const response = await requestHealth(async (sql) => {
    assert.equal(sql, "SELECT 1");
    return { rows: [{ "?column?": 1 }] };
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", database: "connected" });
});

test("health endpoint reports PostgreSQL failures as unavailable", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await requestHealth(async () => {
      throw new Error("database unavailable");
    });

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      status: "unavailable",
      database: "disconnected",
    });
  } finally {
    console.error = originalError;
  }
});
