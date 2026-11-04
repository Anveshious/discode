import { Router } from "express";

const GITHUB_USER_URL = "https://api.github.com/user";

function isGitHubProfile(value) {
  return typeof value === "object"
    && value !== null
    && Number.isSafeInteger(value.id)
    && value.id > 0
    && typeof value.login === "string"
    && value.login.length > 0
    && (typeof value.name === "string" || value.name === null)
    && typeof value.avatar_url === "string"
    && typeof value.html_url === "string"
    && (typeof value.bio === "string" || value.bio === null)
    && (typeof value.company === "string" || value.company === null)
    && (typeof value.location === "string" || value.location === null)
    && typeof value.blog === "string"
    && Number.isSafeInteger(value.followers)
    && value.followers >= 0
    && Number.isSafeInteger(value.following)
    && value.following >= 0;
}

function getBearerToken(header) {
  const match = /^Bearer ([^\s]+)$/i.exec(header ?? "");
  return match?.[1];
}

export function createAuthRouter({ pool, fetchGitHubUser = fetch }) {
  const router = Router();

  router.post("/auth/github", async (request, response) => {
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
      console.error("Unable to verify the GitHub identity.");
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
      console.error("GitHub identity verification returned invalid JSON.");
      response.status(502).json({ error: "github_profile_unavailable" });
      return;
    }

    if (!isGitHubProfile(githubProfile)) {
      response.status(502).json({ error: "github_profile_invalid" });
      return;
    }

    try {
      const result = await pool.query(
        `INSERT INTO users (
           github_id, username, name, avatar_url, profile_url, bio,
           company, location, blog, followers, following
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (github_id) DO UPDATE SET
           username = EXCLUDED.username,
           name = EXCLUDED.name,
           avatar_url = EXCLUDED.avatar_url,
           profile_url = EXCLUDED.profile_url,
           bio = EXCLUDED.bio,
           company = EXCLUDED.company,
           location = EXCLUDED.location,
           blog = EXCLUDED.blog,
           followers = EXCLUDED.followers,
           following = EXCLUDED.following
         RETURNING id, github_id, username, name, avatar_url, profile_url,
                   bio, company, location, blog, followers, following,
                   registered_at, preferences,
                   (xmax = 0) AS created`,
        [
          String(githubProfile.id),
          githubProfile.login,
          githubProfile.name,
          githubProfile.avatar_url,
          githubProfile.html_url,
          githubProfile.bio,
          githubProfile.company,
          githubProfile.location,
          githubProfile.blog,
          githubProfile.followers,
          githubProfile.following,
        ]
      );
      const row = result.rows[0];
      response.status(row.created ? 201 : 200).json({
        user: {
          id: row.id,
          githubId: row.github_id,
          username: row.username,
          name: row.name,
          avatarUrl: row.avatar_url,
          profileUrl: row.profile_url,
          bio: row.bio,
          company: row.company,
          location: row.location,
          blog: row.blog,
          followers: row.followers,
          following: row.following,
          registeredAt: row.registered_at,
          preferences: row.preferences,
        },
        created: row.created,
      });
    } catch (error) {
      console.error("Failed to create or update the Discode account.", error);
      response.status(500).json({ error: "account_persistence_failed" });
    }
  });

  return router;
}
