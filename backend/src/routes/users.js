import { Router } from "express";

const MAX_GITHUB_IDS = 100;

function isValidGitHubIds(value) {
  return Array.isArray(value)
    && value.length <= MAX_GITHUB_IDS
    && value.every((id) => Number.isSafeInteger(id) && id > 0);
}

export function createUsersRouter(pool) {
  const router = Router();

  router.post("/users/registered", async (request, response) => {
    const githubIds = request.body?.githubIds;
    if (!isValidGitHubIds(githubIds)) {
      response.status(400).json({ error: "invalid_github_ids" });
      return;
    }

    const uniqueGithubIds = [...new Set(githubIds.map(String))];
    if (uniqueGithubIds.length === 0) {
      response.json({ registeredGithubIds: [] });
      return;
    }

    try {
      const result = await pool.query(
        "SELECT github_id FROM users WHERE github_id = ANY($1::bigint[])",
        [uniqueGithubIds]
      );
      response.json({
        registeredGithubIds: result.rows.map((row) => String(row.github_id)),
      });
    } catch (error) {
      console.error("Failed to check registered GitHub users.", error);
      response.status(500).json({ error: "registered_user_lookup_failed" });
    }
  });

  return router;
}
