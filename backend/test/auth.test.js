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

async function requestSignIn({ pool, fetchGitHubUser, token = "github-token" }) {
  const app = createApp(pool, { fetchGitHubUser });
  const server = app.listen(0);
  servers.add(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  return fetch(`http://127.0.0.1:${port}/api/auth/github`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: "{}",
  });
}

function createGitHubResponse(profile = githubProfile, status = 200) {
  return new Response(JSON.stringify(profile), { status });
}

test("verifies GitHub identity and creates a Discode account by numeric GitHub ID", async () => {
  let queryValues;
  const response = await requestSignIn({
    pool: {
      async query(sql, values) {
        assert.match(sql, /ON CONFLICT \(github_id\) DO UPDATE/);
        queryValues = values;
        return {
          rows: [{
            id: "discode-user-uuid",
            github_id: "583231",
            username: "octocat",
            name: "The Octocat",
            avatar_url: githubProfile.avatar_url,
            profile_url: githubProfile.html_url,
            bio: githubProfile.bio,
            company: null,
            location: null,
            blog: "",
            followers: 100,
            following: 5,
            registered_at: "2026-11-04T00:00:00.000Z",
            preferences: {},
            created: true,
          }],
        };
      },
    },
    async fetchGitHubUser(url, options) {
      assert.equal(url, "https://api.github.com/user");
      assert.equal(options.headers.Authorization, "Bearer github-token");
      return createGitHubResponse();
    },
  });

  assert.equal(response.status, 201);
  assert.equal(queryValues[0], "583231");
  assert.equal(queryValues[1], "octocat");
  assert.equal(queryValues[9], 100);
  assert.deepEqual(await response.json(), {
    user: {
      id: "discode-user-uuid",
      githubId: "583231",
      username: "octocat",
      name: "The Octocat",
      avatarUrl: githubProfile.avatar_url,
      profileUrl: githubProfile.html_url,
      bio: githubProfile.bio,
      company: null,
      location: null,
      blog: "",
      followers: 100,
      following: 5,
      registeredAt: "2026-11-04T00:00:00.000Z",
      preferences: {},
    },
    created: true,
  });
});

test("returns the existing account on subsequent sign-ins", async () => {
  const response = await requestSignIn({
    pool: {
      async query(_sql, values) {
        assert.equal(values[0], "583231");
        return {
          rows: [{
            id: "existing-disc-user",
            github_id: "583231",
            username: "octocat",
            name: "The Octocat",
            avatar_url: githubProfile.avatar_url,
            profile_url: githubProfile.html_url,
            bio: githubProfile.bio,
            company: null,
            location: null,
            blog: "",
            followers: 100,
            following: 5,
            registered_at: "2025-01-01T00:00:00.000Z",
            preferences: { shareActivity: false },
            created: false,
          }],
        };
      },
    },
    fetchGitHubUser: async () => createGitHubResponse(),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.created, false);
  assert.equal(body.user.id, "existing-disc-user");
  assert.equal(body.user.githubId, "583231");
  assert.deepEqual(body.user.preferences, { shareActivity: false });
  assert.equal(body.user.registeredAt, "2025-01-01T00:00:00.000Z");
});

test("rejects requests without a GitHub access token", async () => {
  let verified = false;
  const response = await requestSignIn({
    pool: { query: async () => assert.fail("must not query the database") },
    fetchGitHubUser: async () => {
      verified = true;
      return createGitHubResponse();
    },
    token: null,
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "github_auth_required" });
  assert.equal(verified, false);
});

test("rejects invalid GitHub tokens without creating an account", async () => {
  const response = await requestSignIn({
    pool: { query: async () => assert.fail("must not query the database") },
    fetchGitHubUser: async () => createGitHubResponse({}, 401),
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "invalid_github_token" });
});

test("rejects malformed GitHub identity responses", async () => {
  const response = await requestSignIn({
    pool: { query: async () => assert.fail("must not query the database") },
    fetchGitHubUser: async () => createGitHubResponse({ ...githubProfile, id: "583231" }),
  });

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "github_profile_invalid" });
});
