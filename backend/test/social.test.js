import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createApp } from "../src/app.js";

const servers = new Set();
const githubProfile = {
  id: 583231,
<<<<<<< HEAD
=======
  login: "octocat",
  name: "The Octocat",
  avatar_url: "https://avatars.githubusercontent.com/u/583231",
  html_url: "https://github.com/octocat",
  bio: "GitHub mascot",
  company: null,
  location: null,
  blog: "",
  followers: 100,
  following: 5,
>>>>>>> auth
};

afterEach(async () => {
  await Promise.all([...servers].map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    servers.delete(server);
  })));
});

async function requestSocial({
  pool,
<<<<<<< HEAD
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
=======
  fetchGitHubUser,
  method = "GET",
  path,
  token = "github-token",
  body,
}) {
  const app = createApp(pool, { fetchGitHubUser });
>>>>>>> auth
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

<<<<<<< HEAD
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
=======
function createGitHubResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function createGitHubFetcher(followers = []) {
  return async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer github-token");
    if (url === "https://api.github.com/user") {
      return createGitHubResponse(githubProfile);
    }
    if (url.startsWith("https://api.github.com/user/followers?")) {
      return createGitHubResponse(followers);
    }
    assert.fail(`Unexpected GitHub URL: ${url}`);
  };
}

test("marks follower Discode membership and request status", async () => {
  const followers = [
    {
      id: 123456,
      login: "registered-sender",
      avatar_url: "https://avatars.githubusercontent.com/u/123456",
      html_url: "https://github.com/registered-sender",
    },
    {
      id: 123457,
      login: "registered-friend",
      avatar_url: "https://avatars.githubusercontent.com/u/123457",
      html_url: "https://github.com/registered-friend",
    },
    {
      id: 123458,
      login: "registered-recipient",
      avatar_url: "https://avatars.githubusercontent.com/u/123458",
      html_url: "https://github.com/registered-recipient",
    },
    {
      id: 123459,
      login: "registered-no-request",
      avatar_url: "https://avatars.githubusercontent.com/u/123459",
      html_url: "https://github.com/registered-no-request",
    },
    {
      id: 123460,
      login: "not-registered",
      avatar_url: "https://avatars.githubusercontent.com/u/123460",
      html_url: "https://github.com/not-registered",
    },
  ];
  const response = await requestSocial({
    pool: {
      async query(sql) {
        if (sql === "SELECT id FROM users WHERE github_id = $1") {
          return { rows: [{ id: "current-user-id" }] };
        }
        assert.match(sql, /request_status/);
        return {
          rows: [
            { github_id: "123456", request_status: "sent" },
            { github_id: "123457", request_status: "received" },
            { github_id: "123458", request_status: "friends" },
            { github_id: "123459", request_status: "none" },
          ],
        };
      },
    },
    fetchGitHubUser: createGitHubFetcher(followers),
    path: "/social/followers",
  });

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).items.map((user) => ({
    githubId: user.githubId,
    onDiscode: user.onDiscode,
    requestStatus: user.requestStatus,
  })), [
    { githubId: "123456", onDiscode: true, requestStatus: "sent" },
    { githubId: "123457", onDiscode: true, requestStatus: "received" },
    { githubId: "123458", onDiscode: true, requestStatus: "friends" },
    { githubId: "123459", onDiscode: true, requestStatus: "none" },
    { githubId: "123460", onDiscode: false, requestStatus: null },
  ]);
});

test("returns 400 for an invalid followers page", async () => {
  let githubCalls = 0;
  const response = await requestSocial({
    pool: { query: async () => assert.fail("must not query an invalid page") },
    fetchGitHubUser: async (url) => {
      githubCalls += 1;
      assert.equal(url, "https://api.github.com/user");
      return createGitHubResponse(githubProfile);
    },
    path: "/social/followers?page=0",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_page" });
  assert.equal(githubCalls, 1);
});

test("returns 201 when creating a friend request", async () => {
  let queryCount = 0;
  const queryCalls = [];
  const response = await requestSocial({
    pool: {
      async query(sql, values) {
        queryCount += 1;
        queryCalls.push({ sql, values });
        if (queryCount === 1 || queryCount === 2) {
          assert.equal(sql, "SELECT id FROM users WHERE github_id = $1");
          return queryCount === 1
            ? { rows: [{ id: "sender-user-id" }], rowCount: 1 }
            : { rows: [{ id: "recipient-user-id" }], rowCount: 1 };
        }
        assert.match(sql, /INSERT INTO friend_requests/);
        return { rows: [{ id: "friend-request-id" }], rowCount: 1 };
      },
    },
    fetchGitHubUser: createGitHubFetcher(),
    method: "POST",
    path: "/friend-requests",
>>>>>>> auth
    body: { githubId: "123456" },
  });

  assert.equal(response.status, 201);
<<<<<<< HEAD
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
=======
  assert.deepEqual(await response.json(), { status: "sent" });
  assert.deepEqual(queryCalls.map((call) => call.values), [
    ["583231"],
    ["123456"],
    ["sender-user-id", "recipient-user-id"],
  ]);
});

test("returns 409 when a friend request already exists", async () => {
  let queryCount = 0;
  const response = await requestSocial({
    pool: {
      async query(sql) {
        queryCount += 1;
        if (queryCount <= 2) {
          assert.equal(sql, "SELECT id FROM users WHERE github_id = $1");
          return { rows: [{ id: queryCount === 1 ? "sender-id" : "recipient-id" }], rowCount: 1 };
        }
        assert.match(sql, /INSERT INTO friend_requests/);
        return { rows: [], rowCount: 0 };
      },
    },
    fetchGitHubUser: createGitHubFetcher(),
    method: "POST",
    path: "/friend-requests",
>>>>>>> auth
    body: { githubId: "123456" },
  });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "friend_request_exists" });
});

<<<<<<< HEAD
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
=======
test("returns 404 when the requested user is not on Discode", async () => {
  let queryCount = 0;
  const response = await requestSocial({
    pool: {
      async query(sql) {
        queryCount += 1;
        assert.equal(sql, "SELECT id FROM users WHERE github_id = $1");
        return queryCount === 1
          ? { rows: [{ id: "sender-user-id" }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      },
    },
    fetchGitHubUser: createGitHubFetcher(),
    method: "POST",
    path: "/friend-requests",
    body: { githubId: "123456" },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "user_not_on_discode" });
});

test("returns 400 when a user sends a friend request to themselves", async () => {
  let queryCalled = false;
  const response = await requestSocial({
    pool: {
      query: async () => {
        queryCalled = true;
        return { rows: [] };
      },
    },
    fetchGitHubUser: createGitHubFetcher(),
    method: "POST",
    path: "/friend-requests",
    body: { githubId: String(githubProfile.id) },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "cannot_friend_self" });
  assert.equal(queryCalled, false);
});

test("returns 401 when the GitHub token is missing", async () => {
  let fetchCalled = false;
  const response = await requestSocial({
    pool: { query: async () => assert.fail("must not query without authentication") },
    fetchGitHubUser: async () => {
      fetchCalled = true;
      return createGitHubResponse(githubProfile);
    },
    method: "POST",
    path: "/friend-requests",
    token: null,
    body: { githubId: "123456" },
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "github_auth_required" });
  assert.equal(fetchCalled, false);
});
>>>>>>> auth
