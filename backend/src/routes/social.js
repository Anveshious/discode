import { Router } from "express";
import { createRequireGitHubUser, githubHeaders } from "../middleware/githubAuth.js";

const GITHUB_USER_URL = "https://api.github.com/user";
const PRESENCE_STATUSES = new Set([
  "online",
  "idle",
  "focused",
  "open-to-contribute",
  "offline",
]);
const GITHUB_ID_MAX = 9223372036854775807n;
const PAGE_SIZE = 30;

function getBearerToken(header) {
  const match = /^Bearer ([^\s]+)$/i.exec(header ?? "");
  return match?.[1];
}

function isGitHubId(value) {
  if (
    !(typeof value === "string" && /^\d{1,19}$/.test(value))
    && !(Number.isSafeInteger(value) && value > 0)
  ) {
    return false;
  }

  try {
    const id = BigInt(value);
    return id > 0n && id <= GITHUB_ID_MAX;
  } catch {
    return false;
  }
}

function isUuid(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parsePage(value) {
  const page = Number(value ?? 1);
  return Number.isInteger(page) && page >= 1 && page <= 100 ? page : null;
}

function isGitHubListUser(value) {
  return typeof value === "object" && value !== null
    && Number.isSafeInteger(value.id) && value.id > 0
    && typeof value.login === "string"
    && typeof value.avatar_url === "string"
    && typeof value.html_url === "string";
}

export function createSocialRouter({ pool, fetchGitHubUser = fetch }) {
  const router = Router();
  const requireGitHubUser = createRequireGitHubUser({ fetchGitHubUser });

  async function getCurrentDiscodeUserId(githubId) {
    const result = await pool.query("SELECT id FROM users WHERE github_id = $1", [String(githubId)]);
    return result.rows[0]?.id;
  }

  async function listConnections(kind, request, response) {
    const page = parsePage(request.query.page);
    if (!page) {
      response.status(400).json({ error: "invalid_page" });
      return;
    }

    let githubResponse;
    try {
      githubResponse = await fetchGitHubUser(
        `https://api.github.com/user/${kind}?per_page=${PAGE_SIZE}&page=${page}`,
        { headers: githubHeaders(request.githubToken), signal: AbortSignal.timeout(5000) }
      );
    } catch {
      response.status(502).json({ error: "github_unavailable" });
      return;
    }
    if (githubResponse.status === 401) {
      response.status(401).json({ error: "invalid_github_token" });
      return;
    }
    if (!githubResponse.ok) {
      response.status(502).json({ error: "github_request_failed" });
      return;
    }

    let users;
    try {
      users = await githubResponse.json();
    } catch {
      response.status(502).json({ error: "github_response_invalid" });
      return;
    }
    if (!Array.isArray(users) || !users.every(isGitHubListUser)) {
      response.status(502).json({ error: "github_response_invalid" });
      return;
    }

    try {
      const myId = await getCurrentDiscodeUserId(request.githubProfile.id);
      if (!myId) {
        response.status(403).json({ error: "account_not_registered" });
        return;
      }

      const ids = users.map((user) => String(user.id));
      const result = await pool.query(
        `SELECT u.github_id,
                CASE
                  WHEN f.id IS NULL THEN 'none'
                  WHEN f.status = 'accepted' THEN 'friends'
                  WHEN f.sender_id = $2 THEN 'sent'
                  ELSE 'received'
                END AS request_status
           FROM users u
           LEFT JOIN friend_requests f
             ON (f.sender_id = $2 AND f.receiver_id = u.id)
             OR (f.receiver_id = $2 AND f.sender_id = u.id)
          WHERE u.github_id = ANY($1::bigint[])`,
        [ids, myId]
      );
      const registered = new Map(result.rows.map((row) => [String(row.github_id), row.request_status]));

      response.json({
        page,
        hasMore: users.length === PAGE_SIZE,
        items: users.map((user) => ({
          githubId: String(user.id),
          username: user.login,
          avatarUrl: user.avatar_url,
          profileUrl: user.html_url,
          onDiscode: registered.has(String(user.id)),
          requestStatus: registered.get(String(user.id)) ?? null,
        })),
      });
    } catch (error) {
      console.error("Failed to list GitHub connections.", error);
      response.status(500).json({ error: "connections_lookup_failed" });
    }
  }

  router.get("/social/followers", requireGitHubUser, (req, res) => listConnections("followers", req, res));
  router.get("/social/following", requireGitHubUser, (req, res) => listConnections("following", req, res));

  const authenticate = async (request, response, next) => {
    const token = getBearerToken(request.get("authorization"));
    if (!token || token.length > 8192) {
      response.status(401).json({ error: "github_auth_required" });
      return;
    }

    let githubResponse;
    try {
      githubResponse = await fetchGitHubUser(GITHUB_USER_URL, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      console.error("Unable to verify the GitHub identity for a social request.", error);
      response.status(502).json({ error: "github_verification_unavailable" });
      return;
    }

    if (githubResponse.status === 401) {
      response.status(401).json({ error: "invalid_github_token" });
      return;
    }
    if (!githubResponse.ok) {
      console.error("GitHub identity verification returned status", githubResponse.status);
      response.status(502).json({ error: "github_verification_failed" });
      return;
    }

    let githubUser;
    try {
      githubUser = await githubResponse.json();
    } catch {
      response.status(502).json({ error: "github_profile_unavailable" });
      return;
    }

    if (!githubUser || !Number.isSafeInteger(githubUser.id) || githubUser.id <= 0) {
      response.status(502).json({ error: "github_profile_invalid" });
      return;
    }

    try {
      const result = await pool.query(
        "SELECT id FROM users WHERE github_id = $1",
        [String(githubUser.id)]
      );
      if (result.rows.length === 0) {
        response.status(403).json({ error: "discode_account_required" });
        return;
      }

      request.discodeUserId = result.rows[0].id;
      request.githubId = String(githubUser.id);
      next();
    } catch (error) {
      console.error("Failed to resolve the authenticated Discode user.", error);
      response.status(500).json({ error: "social_authentication_failed" });
    }
  };

  router.get("/friends", authenticate, async (request, response) => {
    try {
      const result = await pool.query(
        `SELECT
           friend.github_id,
           friend.username,
           friend.name,
           friend.avatar_url,
           friend.profile_url,
           CASE
             WHEN presence.status IS NOT NULL
               AND presence.status <> 'offline'
               AND presence.updated_at >= now() - interval '90 seconds'
             THEN presence.status
             ELSE 'offline'
           END AS status
         FROM friendships friendship
         JOIN users friend
           ON friend.id = CASE
             WHEN friendship.user_a_id = $1 THEN friendship.user_b_id
             ELSE friendship.user_a_id
           END
         LEFT JOIN user_presence presence ON presence.user_id = friend.id
         WHERE $1 IN (friendship.user_a_id, friendship.user_b_id)
           AND friendship.status = 'accepted'
         ORDER BY
           CASE
             WHEN presence.status IS NOT NULL
               AND presence.status <> 'offline'
               AND presence.updated_at >= now() - interval '90 seconds'
             THEN CASE presence.status
               WHEN 'online' THEN 1
               WHEN 'focused' THEN 2
               WHEN 'open-to-contribute' THEN 3
               WHEN 'idle' THEN 4
               ELSE 5
             END
             ELSE 6
           END,
           lower(friend.username)`,
        [request.discodeUserId]
      );

      response.json({
        friends: result.rows.map((row) => ({
          githubId: String(row.github_id),
          username: row.username,
          name: row.name,
          avatarUrl: row.avatar_url,
          profileUrl: row.profile_url,
          status: row.status,
        })),
      });
    } catch (error) {
      console.error("Failed to list Discode friends.", error);
      response.status(500).json({ error: "friend_list_failed" });
    }
  });

  router.get("/friend-requests", authenticate, async (request, response) => {
    try {
      const result = await pool.query(
        `SELECT friendship.id, sender.github_id, sender.username, sender.name,
                sender.avatar_url, sender.profile_url, friendship.created_at
         FROM friendships friendship
         JOIN users sender ON sender.id = friendship.requested_by_id
         WHERE friendship.status = 'pending'
           AND $1 IN (friendship.user_a_id, friendship.user_b_id)
           AND friendship.requested_by_id <> $1
         ORDER BY friendship.created_at`,
        [request.discodeUserId]
      );
      response.json({
        requests: result.rows.map((row) => ({
          id: row.id,
          githubId: String(row.github_id),
          username: row.username,
          name: row.name,
          avatarUrl: row.avatar_url,
          profileUrl: row.profile_url,
          createdAt: row.created_at,
        })),
      });
    } catch (error) {
      console.error("Failed to list incoming friend requests.", error);
      response.status(500).json({ error: "friend_request_list_failed" });
    }
  });

  router.post("/friend-requests", authenticate, async (request, response) => {
    const githubId = request.body?.githubId;
    if (!isGitHubId(githubId)) {
      response.status(400).json({ error: "invalid_github_id" });
      return;
    }

    const normalizedGithubId = BigInt(githubId).toString();
    if (normalizedGithubId === request.githubId) {
      response.status(400).json({ error: "self_friend_request" });
      return;
    }

    let recipientId;
    try {
      const recipient = await pool.query(
        "SELECT id FROM users WHERE github_id = $1",
        [normalizedGithubId]
      );
      if (recipient.rows.length === 0) {
        response.status(404).json({ error: "discode_user_not_found" });
        return;
      }

      recipientId = recipient.rows[0].id;
      if (recipientId === request.discodeUserId) {
        response.status(400).json({ error: "self_friend_request" });
        return;
      }

      await pool.query(
        `INSERT INTO friendships (
           user_a_id, user_b_id, requested_by_id
         )
         VALUES (
           LEAST($1::uuid, $2::uuid),
           GREATEST($1::uuid, $2::uuid),
           $1
         )`,
        [request.discodeUserId, recipientId]
      );
      response.status(201).json({ status: "pending" });
    } catch (error) {
      if (error.code === "23505") {
        try {
          if (recipientId) {
            const existing = await pool.query(
              `SELECT status FROM friendships
               WHERE user_a_id = LEAST($1::uuid, $2::uuid)
                 AND user_b_id = GREATEST($1::uuid, $2::uuid)`,
              [request.discodeUserId, recipientId]
            );
            if (existing.rows[0]?.status === "accepted") {
              response.status(409).json({ error: "already_friends" });
              return;
            }
          }
        } catch {
          // Fall back to friend_request_exists on duplicate constraint error
        }
        response.status(409).json({ error: "friend_request_exists" });
        return;
      }
      console.error("Failed to create a friend request.", error);
      response.status(500).json({ error: "friend_request_failed" });
    }
  });

  router.post("/friend-requests/:id/accept", authenticate, async (request, response) => {
    if (!isUuid(request.params.id)) {
      response.status(400).json({ error: "invalid_friend_request_id" });
      return;
    }

    try {
      const result = await pool.query(
        `UPDATE friendships
         SET status = 'accepted', accepted_at = now()
         WHERE id = $1
           AND status = 'pending'
           AND requested_by_id <> $2
           AND $2 IN (user_a_id, user_b_id)
         RETURNING id`,
        [request.params.id, request.discodeUserId]
      );
      if (result.rows.length === 0) {
        response.status(404).json({ error: "friend_request_not_found" });
        return;
      }
      response.json({ status: "accepted" });
    } catch (error) {
      console.error("Failed to accept a friend request.", error);
      response.status(500).json({ error: "friend_request_accept_failed" });
    }
  });

  router.post("/friend-requests/:id/decline", authenticate, async (request, response) => {
    if (!isUuid(request.params.id)) {
      response.status(400).json({ error: "invalid_friend_request_id" });
      return;
    }

    try {
      const result = await pool.query(
        `DELETE FROM friendships
         WHERE id = $1
           AND status = 'pending'
           AND requested_by_id <> $2
           AND $2 IN (user_a_id, user_b_id)
         RETURNING id`,
        [request.params.id, request.discodeUserId]
      );
      if (result.rows.length === 0) {
        response.status(404).json({ error: "friend_request_not_found" });
        return;
      }
      response.json({ status: "declined" });
    } catch (error) {
      console.error("Failed to decline a friend request.", error);
      response.status(500).json({ error: "friend_request_decline_failed" });
    }
  });

  router.delete("/friend-requests/outgoing/:githubId", authenticate, async (request, response) => {
    const githubId = request.params.githubId;
    if (!isGitHubId(githubId)) {
      response.status(400).json({ error: "invalid_github_id" });
      return;
    }
    const normalizedGithubId = BigInt(githubId).toString();
    try {
      const recipient = await pool.query(
        "SELECT id FROM users WHERE github_id = $1",
        [normalizedGithubId]
      );
      if (recipient.rows.length === 0) {
        response.status(404).json({ error: "discode_user_not_found" });
        return;
      }
      const recipientId = recipient.rows[0].id;
      const result = await pool.query(
        `DELETE FROM friendships
         WHERE status = 'pending'
           AND requested_by_id = $1
           AND $2 IN (user_a_id, user_b_id)
         RETURNING id`,
        [request.discodeUserId, recipientId]
      );
      if (result.rows.length === 0) {
        response.status(404).json({ error: "friend_request_not_found" });
        return;
      }
      response.json({ status: "cancelled" });
    } catch (error) {
      console.error("Failed to cancel outgoing friend request.", error);
      response.status(500).json({ error: "cancel_friend_request_failed" });
    }
  });

  router.delete("/friend-requests/:id", authenticate, async (request, response) => {
    if (!isUuid(request.params.id)) {
      response.status(400).json({ error: "invalid_friend_request_id" });
      return;
    }
    try {
      const result = await pool.query(
        `DELETE FROM friendships
         WHERE id = $1
           AND status = 'pending'
           AND requested_by_id = $2
         RETURNING id`,
        [request.params.id, request.discodeUserId]
      );
      if (result.rows.length === 0) {
        response.status(404).json({ error: "friend_request_not_found" });
        return;
      }
      response.json({ status: "cancelled" });
    } catch (error) {
      console.error("Failed to cancel outgoing friend request.", error);
      response.status(500).json({ error: "cancel_friend_request_failed" });
    }
  });

  router.delete("/friends/:githubId", authenticate, async (request, response) => {
    const githubId = request.params.githubId;
    if (!isGitHubId(githubId)) {
      response.status(400).json({ error: "invalid_github_id" });
      return;
    }
    const normalizedGithubId = BigInt(githubId).toString();
    try {
      const friend = await pool.query(
        "SELECT id FROM users WHERE github_id = $1",
        [normalizedGithubId]
      );
      if (friend.rows.length === 0) {
        response.status(404).json({ error: "discode_user_not_found" });
        return;
      }
      const friendId = friend.rows[0].id;
      const result = await pool.query(
        `DELETE FROM friendships
         WHERE status = 'accepted'
           AND user_a_id = LEAST($1::uuid, $2::uuid)
           AND user_b_id = GREATEST($1::uuid, $2::uuid)
         RETURNING id`,
        [request.discodeUserId, friendId]
      );
      if (result.rows.length === 0) {
        response.status(404).json({ error: "friend_not_found" });
        return;
      }
      response.json({ status: "removed" });
    } catch (error) {
      console.error("Failed to remove friend.", error);
      response.status(500).json({ error: "remove_friend_failed" });
    }
  });

  router.put("/presence", authenticate, async (request, response) => {
    const { status } = request.body ?? {};
    if (!PRESENCE_STATUSES.has(status)) {
      response.status(400).json({ error: "invalid_presence_status" });
      return;
    }

    try {
      await pool.query(
        `INSERT INTO user_presence (user_id, status, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (user_id) DO UPDATE
         SET status = EXCLUDED.status, updated_at = now()`,
        [request.discodeUserId, status]
      );
      response.json({ status });
    } catch (error) {
      console.error("Failed to update Discode presence.", error);
      response.status(500).json({ error: "presence_update_failed" });
    }
  });

  return router;
}
