import { Router } from "express";
import { createRequireGitHubUser } from "../middleware/githubAuth.js";

export function createAuthRouter({ pool, fetchGitHubUser = fetch }) {
  const router = Router();
  const requireGitHubUser = createRequireGitHubUser({ fetchGitHubUser });

  router.post("/auth/github", requireGitHubUser, async (request, response) => {
    const githubProfile = request.githubProfile;
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
