import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createApp } from "../src/app.js";

const servers = new Set();
const githubProfile = { id: 583231 };

afterEach(async () => {
  await Promise.all([...servers].map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    servers.delete(server);
  })));
});

async function requestFriend({ pool, body, fetchGitHubUser, token = "github-token" }) {
  const app = createApp(pool, { fetchGitHubUser });
  const server = app.listen(0);
  servers.add(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  return fetch(`http://127.0.0.1:${port}/api/friend-requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("creates a friend request for the authenticated registered user", async () => {
  const queryCalls = [];
  const response = await requestFriend({
    pool: {
      async query(sql, values) {
        queryCalls.push({ sql, values });
        if (sql.includes("SELECT id, github_id")) {
          return {
            rows: [
              { id: "requester-uuid", github_id: "583231" },
              { id: "recipient-uuid", github_id: "123456" },
            ],
          };
        }
        assert.match(sql, /INSERT INTO friend_requests/);
        return {
          rows: [{
            id: "request-uuid",
            requester_id: "requester-uuid",
            recipient_id: "recipient-uuid",
            status: "pending",
            created_at: "2026-11-14T00:00:00.000Z",
          }],
        };
      },
    },
    async fetchGitHubUser(url, options) {
      assert.equal(url, "https://api.github.com/user");
      assert.equal(options.headers.Authorization, "Bearer github-token");
      return new Response(JSON.stringify(githubProfile), { status: 200 });
    },
    body: { recipientGithubId: 123456 },
  });

  assert.equal(response.status, 201);
  assert.deepEqual(queryCalls[0].values, [["583231", "123456"]]);
  assert.deepEqual(queryCalls[1].values, ["requester-uuid", "recipient-uuid"]);
  assert.deepEqual(await response.json(), {
    friendRequest: {
      id: "request-uuid",
      requesterId: "requester-uuid",
      recipientId: "recipient-uuid",
      status: "pending",
      createdAt: "2026-11-14T00:00:00.000Z",
    },
  });
});

test("rejects friend requests without a GitHub access token", async () => {
  const response = await requestFriend({
    pool: { query: async () => assert.fail("must not query without authentication") },
    fetchGitHubUser: async () => assert.fail("must not verify without a token"),
    token: null,
    body: { recipientGithubId: 123456 },
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "github_auth_required" });
});

test("rejects invalid recipient GitHub IDs before verifying the requester", async () => {
  const response = await requestFriend({
    pool: { query: async () => assert.fail("must not query invalid IDs") },
    fetchGitHubUser: async () => assert.fail("must not verify invalid IDs"),
    body: { recipientGithubId: "123456" },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_recipient_github_id" });
});

test("rejects requests when the recipient is not registered", async () => {
  const response = await requestFriend({
    pool: {
      query: async () => ({
        rows: [{ id: "requester-uuid", github_id: "583231" }],
      }),
    },
    fetchGitHubUser: async () => new Response(JSON.stringify(githubProfile), { status: 200 }),
    body: { recipientGithubId: 123456 },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "recipient_not_registered" });
});

test("returns a conflict when an active request or friendship already exists", async () => {
  const response = await requestFriend({
    pool: {
      async query(sql) {
        if (sql.includes("SELECT id, github_id")) {
          return {
            rows: [
              { id: "requester-uuid", github_id: "583231" },
              { id: "recipient-uuid", github_id: "123456" },
            ],
          };
        }
        throw Object.assign(new Error("duplicate active pair"), {
          code: "23505",
          constraint: "friend_requests_active_pair_idx",
        });
      },
    },
    fetchGitHubUser: async () => new Response(JSON.stringify(githubProfile), { status: 200 }),
    body: { recipientGithubId: 123456 },
  });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "friend_request_or_friendship_exists",
  });
});
