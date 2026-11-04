import type { AuthManager } from "../auth/AuthManager";
import type { GitHubUser } from "../models/GitHubUser";

interface GitHubUserResponse {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string;
    html_url: string;
    followers: number;
    following: number;
}

function isGitHubUserResponse(value: unknown): value is GitHubUserResponse {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const user = value as Record<string, unknown>;
    return typeof user.id === "number"
        && Number.isSafeInteger(user.id)
        && user.id > 0
        && typeof user.login === "string"
        && user.login.length > 0
        && (typeof user.name === "string" || user.name === null)
        && typeof user.avatar_url === "string"
        && typeof user.html_url === "string"
        && typeof user.followers === "number"
        && typeof user.following === "number";
}

export class GitHubService {
    constructor(
        private readonly authManager: Pick<AuthManager, "getSession" | "handleSessionExpired">
    ) {}

    public async getCurrentUser(): Promise<GitHubUser> {
        const session = this.authManager.getSession();
        if (!session) {
            throw new Error("GitHub authentication is required to fetch the current user.");
        }

        let response: Response;
        try {
            response = await fetch("https://api.github.com/user", {
                headers: {
                    Accept: "application/vnd.github+json",
                    Authorization: `Bearer ${session.accessToken}`,
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            });
        } catch {
            throw new Error("Unable to reach the GitHub API.");
        }

        if (!response.ok) {
            if (response.status === 401) {
                let sessionExpired: boolean;
                try {
                    sessionExpired = await this.authManager.handleSessionExpired(session);
                } catch {
                    throw new Error(
                        "Your GitHub session expired. Please sign in again; the sign-out state could not be saved."
                    );
                }
                if (sessionExpired) {
                    throw new Error("Your GitHub session expired. Please sign in again.");
                }
            }
            throw new Error(`GitHub API request failed with status ${response.status}.`);
        }

        let user: unknown;
        try {
            user = await response.json();
        } catch {
            throw new Error("GitHub API returned an invalid response.");
        }

        if (!isGitHubUserResponse(user)) {
            throw new Error("GitHub API returned an invalid user profile.");
        }

        return {
            id: user.id,
            login: user.login,
            name: user.name,
            avatar_url: user.avatar_url,
            html_url: user.html_url,
            followers: user.followers,
            following: user.following,
        };
    }
}
