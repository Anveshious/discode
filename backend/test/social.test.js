import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createApp } from "../src/app.js";

const servers = new Set();
const githubProfile = {
  id: 583231,
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
};

afterEach(async () => {
  await Promise.all([...servers].map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    servers.delete(server);
  })));
});

async function requestSocial({
  pool,
  fetchGitHubUser,
  method = "GET",
  path,
  token = "github-token",
  body,
}) {
  const app = createApp(pool, { fetchGitHubUser });
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
    body: { githubId: "123456" },
  });

  assert.equal(response.status, 201);
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
    body: { githubId: "123456" },
  });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "friend_request_exists" });
});

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