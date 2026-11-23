import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { translateQuery, normalizeRow, wrapSqliteAsPool } from "../src/db/sqlite-pool.js";
import { migrateSqlite } from "../src/db/sqlite-migrate.js";

test("translateQuery transforms queries properly", () => {
  // Test placeholders and ANY
  const q1 = translateQuery(
    "SELECT id FROM users WHERE github_id = ANY($1::bigint[]) AND username = $2",
    [[123, 456], "octocat"]
  );
  assert.equal(
    q1.sql,
    "SELECT id FROM users WHERE github_id IN (?, ?) AND username = ?"
  );
  assert.deepEqual(q1.params, [123, 456, "octocat"]);

  // Test empty ANY array
  const qEmpty = translateQuery(
    "SELECT id FROM users WHERE github_id = ANY($1::bigint[])",
    [[]]
  );
  assert.equal(qEmpty.sql, "SELECT id FROM users WHERE github_id IN (NULL)");
  assert.deepEqual(qEmpty.params, []);

  // Test LEAST / GREATEST and uuid casting
  const q2 = translateQuery(
    "SELECT LEAST($1::uuid, $2::uuid) AS min_id, GREATEST($1::uuid, $2::uuid) AS max_id",
    ["u1", "u2"]
  );
  assert.equal(
    q2.sql,
    "SELECT MIN(?, ?) AS min_id, MAX(?, ?) AS max_id"
  );
  assert.deepEqual(q2.params, ["u1", "u2", "u1", "u2"]);

  // Test now() and intervals
  const q3 = translateQuery(
    "SELECT * FROM user_presence WHERE updated_at >= now() - interval '90 seconds' AND now() = now()"
  );
  assert.ok(q3.sql.includes("strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-90 seconds')"));
  assert.ok(q3.sql.includes("strftime('%Y-%m-%dT%H:%M:%SZ', 'now')"));

  // Test (xmax = 0) AS created
  const q4 = translateQuery(
    "INSERT INTO users (name) VALUES ($1) RETURNING id, (xmax = 0) AS created",
    ["alice"]
  );
  assert.equal(q4.createdCheck, true);
  assert.ok(!q4.sql.includes("xmax"));
});

test("normalizeRow formats github_id, preferences, and timestamps", () => {
  const row = normalizeRow({
    id: "uuid-1",
    github_id: 12345,
    preferences: '{"theme":"dark"}',
    created_at: "2026-11-23 12:00:00",
  });
  assert.equal(row.github_id, "12345");
  assert.deepEqual(row.preferences, { theme: "dark" });
  assert.equal(row.created_at, "2026-11-23T12:00:00.000Z");
});

test("SQLite pool executes full workflow against in-memory database", async () => {
  const db = new Database(":memory:");
  migrateSqlite(db);
  const pool = wrapSqliteAsPool(db);

  // 1. Insert user (created = true)
  const insertUserSql = `
    INSERT INTO users (
      github_id, username, name, avatar_url, profile_url,
      bio, company, location, blog, followers, following
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (github_id) DO UPDATE
      SET username = EXCLUDED.username
    RETURNING id, github_id, username, name, avatar_url, profile_url,
              bio, company, location, blog, followers, following,
              registered_at, preferences,
              (xmax = 0) AS created
  `;
  const user1Result = await pool.query(insertUserSql, [
    "583231",
    "octocat",
    "The Octocat",
    "https://avatars.githubusercontent.com/u/583231",
    "https://github.com/octocat",
    null,
    null,
    null,
    "",
    10,
    5,
  ]);

  assert.equal(user1Result.rows.length, 1);
  const user1 = user1Result.rows[0];
  assert.equal(user1.created, true);
  assert.equal(user1.github_id, "583231");
  assert.equal(user1.username, "octocat");
  assert.deepEqual(user1.preferences, {});
  assert.ok(user1.id);

  // 2. Upsert same user (created = false)
  const user1Again = await pool.query(insertUserSql, [
    "583231",
    "octocat",
    "The Octocat",
    "https://avatars.githubusercontent.com/u/583231",
    "https://github.com/octocat",
    null,
    null,
    null,
    "",
    10,
    5,
  ]);
  assert.equal(user1Again.rows[0].created, false);
  assert.equal(user1Again.rows[0].id, user1.id);

  // 3. Insert second user
  const user2Result = await pool.query(insertUserSql, [
    "999999",
    "hubot",
    "Hubot Robot",
    "https://avatars.githubusercontent.com/u/999999",
    "https://github.com/hubot",
    null,
    null,
    null,
    "",
    0,
    0,
  ]);
  const user2 = user2Result.rows[0];

  // 4. Query with ANY($1::bigint[])
  const anyResult = await pool.query(
    "SELECT id, github_id FROM users WHERE github_id = ANY($1::bigint[])",
    [[583231, 999999]]
  );
  assert.equal(anyResult.rows.length, 2);

  // 5. Create friend request
  const reqResult = await pool.query(
    `INSERT INTO friend_requests (requester_id, recipient_id)
     VALUES ($1, $2)
     RETURNING id, requester_id, recipient_id, status, created_at`,
    [user1.id, user2.id]
  );
  assert.equal(reqResult.rows.length, 1);
  assert.equal(reqResult.rows[0].status, "pending");

  // Duplicate friend request should trigger code 23505 and constraint friend_requests_active_pair_idx
  await assert.rejects(
    async () => {
      await pool.query(
        `INSERT INTO friend_requests (requester_id, recipient_id)
         VALUES ($1, $2)
         RETURNING id`,
        [user2.id, user1.id]
      );
    },
    (err) => {
      assert.equal(err.code, "23505");
      assert.equal(err.constraint, "friend_requests_active_pair_idx");
      return true;
    }
  );

  // 6. Update user presence & query freshness
  await pool.query(
    `INSERT INTO user_presence (user_id, status, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE
     SET status = EXCLUDED.status, updated_at = now()`,
    [user1.id, "online"]
  );

  const presenceResult = await pool.query(
    `SELECT user_id, status, updated_at
     FROM user_presence
     WHERE user_id = $1 AND updated_at >= now() - interval '90 seconds'`,
    [user1.id]
  );
  assert.equal(presenceResult.rows.length, 1);
  assert.equal(presenceResult.rows[0].status, "online");

  // 7. Friendship with LEAST / GREATEST
  await pool.query(
    `INSERT INTO friendships (user_a_id, user_b_id, requested_by_id, status, accepted_at)
     VALUES (LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid), $1, 'accepted', now())`,
    [user1.id, user2.id]
  );

  const friendshipCheck = await pool.query(
    `SELECT id FROM friendships WHERE user_a_id = LEAST($1::uuid, $2::uuid) AND user_b_id = GREATEST($1::uuid, $2::uuid)`,
    [user1.id, user2.id]
  );
  assert.equal(friendshipCheck.rows.length, 1);

  await pool.end();
});
