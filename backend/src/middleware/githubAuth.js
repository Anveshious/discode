const GITHUB_USER_URL = "https://api.github.com/user";

export function isGitHubProfile(value) {
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
    && Number.isSafeInteger(value.followers) && value.followers >= 0
    && Number.isSafeInteger(value.following) && value.following >= 0;
}

export function getBearerToken(header) {
  return /^Bearer ([^\s]+)$/i.exec(header ?? "")?.[1];
}

export function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export function createRequireGitHubUser({ fetchGitHubUser = fetch }) {
  return async function requireGitHubUser(request, response, next) {
    const token = getBearerToken(request.get("authorization"));
    if (!token || token.length > 8192) {
      response.status(401).json({ error: "github_auth_required" });
      return;
    }

    let githubResponse;
    try {
      githubResponse = await fetchGitHubUser(GITHUB_USER_URL, {
        headers: githubHeaders(token),
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

    let profile;
    try {
      profile = await githubResponse.json();
    } catch {
      response.status(502).json({ error: "github_profile_unavailable" });
      return;
    }
    if (!isGitHubProfile(profile)) {
      response.status(502).json({ error: "github_profile_invalid" });
      return;
    }

    request.githubToken = token;
    request.githubProfile = profile;
    next();
  };
}