import { Router } from "express";

const GITHUB_USER_URL = "https://api.github.com/user";
const ACTIVE_PAIR_CONSTRAINT = "friend_requests_active_pair_idx";

function getBearerToken(header) {
  const match = /^Bearer ([^\s]+)$/i.exec(header ?? "");
  return match?.[1];
}

export function createFriendRequestsRouter({ pool, fetchGitHubUser = fetch }) {
  const router = Router();

  router.post("/friend-requests", async (request, response) => {
    const recipientGithubId = request.body?.recipientGithubId;
    if (!Number.isSafeInteger(recipientGithubId) || recipientGithubId <= 0) {
      response.status(400).json({ error: "invalid_recipient_github_id" });
      return;
    }

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
    } catch {
      console.error("Unable to verify the GitHub identity for a friend request.");
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

    let githubProfile;
    try {
      githubProfile = await githubResponse.json();
    } catch {
      response.status(502).json({ error: "github_profile_unavailable" });
      return;
    }

    if (
      typeof githubProfile !== "object"
      || githubProfile === null
      || !Number.isSafeInteger(githubProfile.id)
      || githubProfile.id <= 0
    ) {
      response.status(502).json({ error: "github_profile_invalid" });
      return;
    }

    try {
      const usersResult = await pool.query(
        "SELECT id, github_id FROM users WHERE github_id = ANY($1::bigint[])",
        [[String(githubProfile.id), String(recipientGithubId)]]
      );
      const usersByGithubId = new Map(
        usersResult.rows.map((row) => [String(row.github_id), row.id])
      );
      const requesterId = usersByGithubId.get(String(githubProfile.id));
      if (!requesterId) {
        response.status(403).json({ error: "discode_account_required" });
        return;
      }

      const recipientId = usersByGithubId.get(String(recipientGithubId));
      if (!recipientId) {
        response.status(404).json({ error: "recipient_not_registered" });
        return;
      }
      if (requesterId === recipientId) {
        response.status(400).json({ error: "cannot_friend_self" });
        return;
      }

      const result = await pool.query(
        `INSERT INTO friend_requests (requester_id, recipient_id)
         VALUES ($1, $2)
         RETURNING id, requester_id, recipient_id, status, created_at`,
        [requesterId, recipientId]
      );
      const row = result.rows[0];
      response.status(201).json({
        friendRequest: {
          id: row.id,
          requesterId: row.requester_id,
          recipientId: row.recipient_id,
          status: row.status,
          createdAt: row.created_at,
        },
      });
    } catch (error) {
      if (error.code === "23505" && error.constraint === ACTIVE_PAIR_CONSTRAINT) {
        response.status(409).json({ error: "friend_request_or_friendship_exists" });
        return;
      }
      console.error("Failed to create a friend request.", error);
      response.status(500).json({ error: "friend_request_creation_failed" });
    }
  });

  return router;
}
