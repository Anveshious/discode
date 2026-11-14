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

async function requestRegisteredUsers({ pool, body }) {
  const app = createApp(pool);
  const server = app.listen(0);
  servers.add(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  return fetch(`http://127.0.0.1:${port}/api/users/registered`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("returns only registered GitHub IDs from the requested batch", async () => {
  let queryValues;
  const response = await requestRegisteredUsers({
    pool: {
      async query(sql, values) {
        assert.match(sql, /github_id = ANY\(\$1::bigint\[\]\)/);
        queryValues = values;
        return { rows: [{ github_id: "583231" }, { github_id: "123456" }] };
      },
    },
    body: { githubIds: [583231, 123456, 583231] },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(queryValues, [["583231", "123456"]]);
  assert.deepEqual(await response.json(), {
    registeredGithubIds: ["583231", "123456"],
  });
});

test("returns an empty result without querying for an empty batch", async () => {
  const response = await requestRegisteredUsers({
    pool: { query: async () => assert.fail("must not query for an empty batch") },
    body: { githubIds: [] },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { registeredGithubIds: [] });
});

test("rejects invalid or oversized GitHub ID batches", async () => {
  const response = await requestRegisteredUsers({
    pool: { query: async () => assert.fail("must not query invalid IDs") },
    body: { githubIds: [583231, -1] },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_github_ids" });
});

test("reports database failures when checking registered GitHub IDs", async () => {
  const response = await requestRegisteredUsers({
    pool: { query: async () => { throw new Error("database unavailable"); } },
    body: { githubIds: [583231] },
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: "registered_user_lookup_failed",
  });
});
