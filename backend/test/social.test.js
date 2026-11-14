import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createApp } from "../src/app.js";

const servers = new Set();
const githubProfile = {
  id: 583231,
};

afterEach(async () => {
  await Promise.all([...servers].map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    servers.delete(server);
  })));
});

async function requestSocial({
  pool,
  path,
  method = "GET",
  body,
  token = "github-token",
}) {
  const app = createApp(pool, {
    async fetchGitHubUser(url, options) {
      assert.equal(url, "https://api.github.com/user");
      assert.equal(options.headers.Authorization, "Bearer github-token");
      return new Response(JSON.stringify(githubProfile));
    },
  });
  const server = app.listen(0);
  servers.add(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  return fetch(`http://127.0.0.1:${port}/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function createPool(query) {
  return {
    async query(sql, values) {
      if (/SELECT id FROM users WHERE github_id/.test(sql) && values[0] === "583231") {
        assert.deepEqual(values, ["583231"]);
        return { rows: [{ id: "self-user-id" }] };
      }
      return query(sql, values);
    },
  };
}

test("requires a GitHub access token for social endpoints", async () => {
  const response = await requestSocial({
    pool: { query: async () => assert.fail("must not query without authentication") },
    path: "/friends",
    token: null,
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "github_auth_required" });
});

test("creates a friend request for another registered Discode user", async () => {
  let insertedValues;
  const response = await requestSocial({
    pool: createPool(async (sql, values) => {
      if (/SELECT id FROM users WHERE github_id/.test(sql)) {
        assert.deepEqual(values, ["123456"]);
        return { rows: [{ id: "friend-user-id" }] };
      }
      assert.match(sql, /INSERT INTO friendships/);
      insertedValues = values;
      return { rows: [] };
    }),
    path: "/friend-requests",
    method: "POST",
    body: { githubId: "123456" },
  });

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { status: "pending" });
  assert.deepEqual(insertedValues, ["self-user-id", "friend-user-id"]);
});

test("rejects friend requests to the same user", async () => {
  let lookupCount = 0;
  const response = await requestSocial({
    pool: {
      async query() {
        lookupCount++;
        return { rows: [{ id: "self-user-id" }] };
      },
    },
    path: "/friend-requests",
    method: "POST",
    body: { githubId: "000583231" },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "self_friend_request" });
  assert.equal(lookupCount, 1);
});

test("returns not found when the requested GitHub ID is not registered", async () => {
  const response = await requestSocial({
    pool: createPool(async (_sql, values) => {
      assert.deepEqual(values, ["123456"]);
      return { rows: [] };
    }),
    path: "/friend-requests",
    method: "POST",
    body: { githubId: "123456" },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "discode_user_not_found" });
});

test("rejects duplicate friend requests", async () => {
  const response = await requestSocial({
    pool: createPool(async (sql) => {
      if (/SELECT id FROM users WHERE github_id/.test(sql)) {
        return { rows: [{ id: "friend-user-id" }] };
      }
      const error = new Error("duplicate friendship");
      error.code = "23505";
      throw error;
    }),
    path: "/friend-requests",
    method: "POST",
    body: { githubId: "123456" },
  });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "friend_request_exists" });
});

test("accepts an incoming request and lists accepted friends with their presence", async () => {
  const requestId = "18af41e0-f890-4f4e-9e90-d5de16dfdf67";
  const response = await requestSocial({
    pool: createPool(async (sql, values) => {
      assert.match(sql, /UPDATE friendships/);
      assert.deepEqual(values, [requestId, "self-user-id"]);
      return { rows: [{ id: requestId }] };
    }),
    path: `/friend-requests/${requestId}/accept`,
    method: "POST",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "accepted" });

  const friendsResponse = await requestSocial({
    pool: createPool(async (sql) => {
      assert.match(sql, /FROM friendships friendship/);
      assert.match(sql, /interval '90 seconds'/);
      return {
        rows: [{
          github_id: "123456",
          username: "friend",
          name: "Friend",
          avatar_url: "https://avatars.githubusercontent.com/u/123456",
          profile_url: "https://github.com/friend",
          status: "offline",
        }],
      };
    }),
    path: "/friends",
  });

  assert.equal(friendsResponse.status, 200);
  assert.deepEqual(await friendsResponse.json(), {
    friends: [{
      githubId: "123456",
      username: "friend",
      name: "Friend",
      avatarUrl: "https://avatars.githubusercontent.com/u/123456",
      profileUrl: "https://github.com/friend",
      status: "offline",
    }],
  });
});

test("lists incoming friend requests for the authenticated user", async () => {
  const response = await requestSocial({
    pool: createPool(async (sql, values) => {
      assert.match(sql, /requested_by_id <> \$1/);
      assert.deepEqual(values, ["self-user-id"]);
      return {
        rows: [{
          id: "18af41e0-f890-4f4e-9e90-d5de16dfdf67",
          github_id: "123456",
          username: "friend",
          name: null,
          avatar_url: "https://avatars.githubusercontent.com/u/123456",
          profile_url: "https://github.com/friend",
          created_at: "2026-11-14T00:00:00.000Z",
        }],
      };
    }),
    path: "/friend-requests",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    requests: [{
      id: "18af41e0-f890-4f4e-9e90-d5de16dfdf67",
      githubId: "123456",
      username: "friend",
      name: null,
      avatarUrl: "https://avatars.githubusercontent.com/u/123456",
      profileUrl: "https://github.com/friend",
      createdAt: "2026-11-14T00:00:00.000Z",
    }],
  });
});

test("updates the authenticated user's presence and rejects invalid statuses", async () => {
  let updatedValues;
  const pool = createPool(async (sql, values) => {
    assert.match(sql, /INSERT INTO user_presence/);
    updatedValues = values;
    return { rows: [] };
  });
  const response = await requestSocial({
    pool,
    path: "/presence",
    method: "PUT",
    body: { status: "online" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "online" });
  assert.deepEqual(updatedValues, ["self-user-id", "online"]);

  const invalidResponse = await requestSocial({
    pool: createPool(async () => assert.fail("must not update invalid status")),
    path: "/presence",
    method: "PUT",
    body: { status: "unknown" },
  });
  assert.equal(invalidResponse.status, 400);
  assert.deepEqual(await invalidResponse.json(), { error: "invalid_presence_status" });
});
