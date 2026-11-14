import { Router } from "express";
import { createRequireGitHubUser, githubHeaders } from "../middleware/githubAuth.js";

const PAGE_SIZE = 30;

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

  router.post("/friend-requests", requireGitHubUser, async (request, response) => {
    const targetGitHubId = request.body?.githubId;
    if (typeof targetGitHubId !== "string" || !/^[1-9]\d{0,17}$/.test(targetGitHubId)) {
      response.status(400).json({ error: "invalid_github_id" });
      return;
    }
    if (targetGitHubId === String(request.githubProfile.id)) {
      response.status(400).json({ error: "cannot_friend_self" });
      return;
    }

    try {
      const myId = await getCurrentDiscodeUserId(request.githubProfile.id);
      if (!myId) {
        response.status(403).json({ error: "account_not_registered" });
        return;
      }
      const target = await pool.query("SELECT id FROM users WHERE github_id = $1", [targetGitHubId]);
      if (target.rowCount === 0) {
        response.status(404).json({ error: "user_not_on_discode" });
        return;
      }

      const inserted = await pool.query(
        `INSERT INTO friend_requests (sender_id, receiver_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id`,
        [myId, target.rows[0].id]
      );
      if (inserted.rowCount === 0) {
        response.status(409).json({ error: "friend_request_exists" });
        return;
      }
      response.status(201).json({ status: "sent" });
    } catch (error) {
      console.error("Failed to create the friend request.", error);
      response.status(500).json({ error: "friend_request_failed" });
    }
  });

  return router;
}