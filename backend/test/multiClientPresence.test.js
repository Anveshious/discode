import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createApp } from "../src/app.js";

const servers = new Set();

const GITHUB_USERS = {
  "alice-token": {
    id: 1001,
    login: "alice",
    name: "Alice Developer",
    avatar_url: "https://avatars.githubusercontent.com/u/1001",
    html_url: "https://github.com/alice",
  },
  "bob-token": {
    id: 2002,
    login: "bob",
    name: "Bob Coder",
    avatar_url: "https://avatars.githubusercontent.com/u/2002",
    html_url: "https://github.com/bob",
  },
};

afterEach(async () => {
  await Promise.all([...servers].map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    servers.delete(server);
  })));
});

function createMultiClientApp() {
  const users = [
    { id: "user-alice", github_id: "1001", username: "alice", name: "Alice Developer", avatar_url: "https://avatars.githubusercontent.com/u/1001", profile_url: "https://github.com/alice" },
    { id: "user-bob", github_id: "2002", username: "bob", name: "Bob Coder", avatar_url: "https://avatars.githubusercontent.com/u/2002", profile_url: "https://github.com/bob" },
  ];

  const presenceStore = new Map(); // userId -> { status, updatedAt: Date }

  const pool = {
    async query(sql, values) {
      if (/SELECT id FROM users WHERE github_id = \$1/.test(sql)) {
        const found = users.find((u) => u.github_id === values[0]);
        return { rows: found ? [{ id: found.id }] : [] };
      }

      if (/INSERT INTO user_presence/i.test(sql)) {
        const [userId, status] = values;
        presenceStore.set(userId, { status, updatedAt: new Date() });
        return { rows: [] };
      }

      if (/SELECT.*FROM user_presence/i.test(sql)) {
        const userId = values[0];
        const record = presenceStore.get(userId);
        if (!record) {
          return { rows: [] };
        }
        const isFresh = (Date.now() - record.updatedAt.getTime()) <= 90_000;
        const effectiveStatus = isFresh && record.status !== "offline" ? record.status : "offline";
        return {
          rows: [{
            status: effectiveStatus,
            updated_at: record.updatedAt.toISOString(),
          }],
        };
      }

      if (/FROM friendships friendship/i.test(sql)) {
        const userId = values[0];
        const friend = userId === "user-alice" ? users[1] : users[0];
        const record = presenceStore.get(friend.id);
        const isFresh = record && (Date.now() - record.updatedAt.getTime()) <= 90_000;
        const effectiveStatus = isFresh && record.status !== "offline" ? record.status : "offline";
        return {
          rows: [{
            github_id: friend.github_id,
            username: friend.username,
            name: friend.name,
            avatar_url: friend.avatar_url,
            profile_url: friend.profile_url,
            status: effectiveStatus,
          }],
        };
      }

      return { rows: [] };
    },
  };

  const app = createApp(pool, {
    fetchGitHubUser: async (_url, options) => {
      const auth = options?.headers?.Authorization;
      const token = auth?.replace("Bearer ", "");
      const profile = GITHUB_USERS[token];
      if (!profile) {
        return new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 });
      }
      return new Response(JSON.stringify(profile));
    },
  });

  const server = app.listen(0);
  servers.add(server);

  return {
    server,
    presenceStore,
    async request(path, { method = "GET", token, body } = {}) {
      const { port } = server.address();
      return fetch(`http://127.0.0.1:${port}/api${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    },
  };
}

test("synchronizes presence across multiple computers between friends", async () => {
  const { request } = createMultiClientApp();

  // 1. Computer 1 (Alice) checks friends before Bob connects: Bob is offline
  const initialAliceView = await (await request("/friends", { token: "alice-token" })).json();
  assert.equal(initialAliceView.friends.length, 1);
  assert.equal(initialAliceView.friends[0].username, "bob");
  assert.equal(initialAliceView.friends[0].status, "offline");

  // 2. Computer 2 (Bob) connects and publishes online heartbeat
  const bobOnlineRes = await request("/presence", {
    method: "PUT",
    token: "bob-token",
    body: { status: "online" },
  });
  assert.equal(bobOnlineRes.status, 200);

  // 3. Computer 1 (Alice) polls friends: Bob is now online
  const aliceSeesBobOnline = await (await request("/friends", { token: "alice-token" })).json();
  assert.equal(aliceSeesBobOnline.friends[0].status, "online");

  // 4. Computer 2 (Bob) sets manual status to "focused"
  const bobFocusedRes = await request("/presence", {
    method: "PUT",
    token: "bob-token",
    body: { status: "focused" },
  });
  assert.equal(bobFocusedRes.status, 200);

  // 5. Computer 1 (Alice) polls friends: Bob is now focused
  const aliceSeesBobFocused = await (await request("/friends", { token: "alice-token" })).json();
  assert.equal(aliceSeesBobFocused.friends[0].status, "focused");

  // 6. Computer 2 (Bob) sets manual status to "open-to-contribute"
  await request("/presence", {
    method: "PUT",
    token: "bob-token",
    body: { status: "open-to-contribute" },
  });

  // 7. Computer 1 (Alice) polls friends: Bob is open-to-contribute
  const aliceSeesBobCollab = await (await request("/friends", { token: "alice-token" })).json();
  assert.equal(aliceSeesBobCollab.friends[0].status, "open-to-contribute");

  // 8. Computer 2 (Bob) goes idle
  await request("/presence", {
    method: "PUT",
    token: "bob-token",
    body: { status: "idle" },
  });

  // 9. Computer 1 (Alice) polls friends: Bob is idle
  const aliceSeesBobIdle = await (await request("/friends", { token: "alice-token" })).json();
  assert.equal(aliceSeesBobIdle.friends[0].status, "idle");

  // 10. Computer 2 (Bob) closes VS Code (graceful disconnect -> offline)
  await request("/presence", {
    method: "PUT",
    token: "bob-token",
    body: { status: "offline" },
  });

  // 11. Computer 1 (Alice) polls friends: Bob is immediately offline
  const aliceSeesBobOffline = await (await request("/friends", { token: "alice-token" })).json();
  assert.equal(aliceSeesBobOffline.friends[0].status, "offline");
});

test("marks presence offline when remote computer disconnects ungracefully and heartbeat becomes stale", async () => {
  const { request, presenceStore } = createMultiClientApp();

  // Bob comes online from Computer 2
  await request("/presence", {
    method: "PUT",
    token: "bob-token",
    body: { status: "online" },
  });

  // Alice sees Bob online
  let aliceView = await (await request("/friends", { token: "alice-token" })).json();
  assert.equal(aliceView.friends[0].status, "online");

  // Simulate remote computer disconnecting without sending offline (stale heartbeat > 90s)
  const bobRecord = presenceStore.get("user-bob");
  bobRecord.updatedAt = new Date(Date.now() - 100_000); // 100 seconds ago

  // Alice polls friends: Bob's stale presence degrades to offline
  aliceView = await (await request("/friends", { token: "alice-token" })).json();
  assert.equal(aliceView.friends[0].status, "offline");
});

test("synchronizes presence when the same user switches between multiple devices (Laptop and Desktop)", async () => {
  const { request } = createMultiClientApp();

  // 1. User Alice starts work on Computer 1 (Desktop) as "focused"
  await request("/presence", {
    method: "PUT",
    token: "alice-token",
    body: { status: "focused" },
  });

  // Bob on Computer 2 sees Alice is focused
  let bobView = await (await request("/friends", { token: "bob-token" })).json();
  assert.equal(bobView.friends[0].status, "focused");

  // 2. Alice switches to Computer 2 (Laptop) and updates status to "open-to-contribute"
  await request("/presence", {
    method: "PUT",
    token: "alice-token",
    body: { status: "open-to-contribute" },
  });

  // Bob on Computer 2 sees updated status from Alice's second device
  bobView = await (await request("/friends", { token: "bob-token" })).json();
  assert.equal(bobView.friends[0].status, "open-to-contribute");

  // 3. Alice disconnects from Laptop
  await request("/presence", {
    method: "PUT",
    token: "alice-token",
    body: { status: "offline" },
  });

  // Bob sees Alice is offline
  bobView = await (await request("/friends", { token: "bob-token" })).json();
  assert.equal(bobView.friends[0].status, "offline");
});
