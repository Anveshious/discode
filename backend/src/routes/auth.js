import { Router } from "express";
import { createRequireGitHubUser } from "../middleware/githubAuth.js";

export function createAuthRouter({ pool, fetchGitHubUser = fetch }) {
  const router = Router();
  const requireGitHubUser = createRequireGitHubUser({ fetchGitHubUser });

  router.post("/auth/github", requireGitHubUser, async (request, response) => {
    const githubProfile = request.githubProfile;
    try {
      /* ...the existing INSERT ... ON CONFLICT query and response, unchanged... */
    } catch (error) { /* unchanged */ }
  });

  return router;
}