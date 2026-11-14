import type { AuthenticationSession } from "vscode";
import type { AuthManager } from "../auth/AuthManager";
import type { GitHubUser, GitHubUserSearchResult } from "../models/GitHubUser";

interface GitHubUserResponse {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string;
    html_url: string;
    followers: number;
    following: number;
}

interface GitHubUserSearchResponse {
    total_count: number;
    incomplete_results: boolean;
    items: unknown[];
}

interface GitHubUserSearchItem {
    id: number;
    login: string;
    avatar_url: string;
    html_url: string;
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

function isValidGitHubUsername(username: string): boolean {
    return username.length <= 39
        && /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(username)
        && !username.includes("--");
}

function isGitHubUserSearchResponse(value: unknown): value is GitHubUserSearchResponse {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const response = value as Record<string, unknown>;
    return typeof response.total_count === "number"
        && Number.isSafeInteger(response.total_count)
        && response.total_count >= 0
        && typeof response.incomplete_results === "boolean"
        && Array.isArray(response.items);
}

function isGitHubUserSearchItem(value: unknown): value is GitHubUserSearchItem {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const user = value as Record<string, unknown>;
    return typeof user.id === "number"
        && Number.isSafeInteger(user.id)
        && user.id > 0
        && typeof user.login === "string"
        && isValidGitHubUsername(user.login)
        && typeof user.avatar_url === "string"
        && typeof user.html_url === "string";
}

async function parseGitHubUserResponse(response: Response): Promise<GitHubUser> {
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

async function parseGitHubUserSearchResponse(response: Response): Promise<GitHubUserSearchResult[]> {
    let searchResponse: unknown;
    try {
        searchResponse = await response.json();
    } catch {
        throw new Error("GitHub API returned an invalid search response.");
    }

    if (
        !isGitHubUserSearchResponse(searchResponse)
        || !searchResponse.items.every(isGitHubUserSearchItem)
    ) {
        throw new Error("GitHub API returned invalid search results.");
    }

    return searchResponse.items.map((user) => ({
        id: user.id,
        login: user.login,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
    }));
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
                await this.handleUnauthorizedResponse(session);
            }
            throw new Error(`GitHub API request failed with status ${response.status}.`);
        }

        return parseGitHubUserResponse(response);
    }

    public async findUserByUsername(username: string): Promise<GitHubUser | undefined> {
        const session = this.authManager.getSession();
        if (!session) {
            throw new Error("GitHub authentication is required to search users.");
        }

        const normalizedUsername = username.trim();
        if (!isValidGitHubUsername(normalizedUsername)) {
            throw new Error("Enter a valid GitHub username.");
        }

        let response: Response;
        try {
            response = await fetch(
                `https://api.github.com/users/${encodeURIComponent(normalizedUsername)}`,
                {
                    headers: {
                        Accept: "application/vnd.github+json",
                        Authorization: `Bearer ${session.accessToken}`,
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                }
            );
        } catch {
            throw new Error("Unable to reach the GitHub API.");
        }

        if (response.status === 404) {
            return undefined;
        }

        if (response.status === 401) {
            await this.handleUnauthorizedResponse(session);
        }
        if (!response.ok) {
            throw new Error(`GitHub API request failed with status ${response.status}.`);
        }

        return parseGitHubUserResponse(response);
    }

    public async searchUsers(query: string): Promise<GitHubUserSearchResult[]> {
        const session = this.authManager.getSession();
        if (!session) {
            throw new Error("GitHub authentication is required to search users.");
        }

        const normalizedQuery = query.trim();
        if (!isValidGitHubUsername(normalizedQuery)) {
            throw new Error("Enter a valid GitHub username.");
        }

        const searchUrl = new URL("https://api.github.com/search/users");
        searchUrl.searchParams.set("q", `${normalizedQuery} in:login`);
        searchUrl.searchParams.set("per_page", "5");

        let response: Response;
        try {
            response = await fetch(searchUrl, {
                headers: {
                    Accept: "application/vnd.github+json",
                    Authorization: `Bearer ${session.accessToken}`,
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            });
        } catch {
            throw new Error("Unable to reach the GitHub API.");
        }

        if (response.status === 401) {
            await this.handleUnauthorizedResponse(session);
        }
        if (!response.ok) {
            throw new Error(`GitHub API request failed with status ${response.status}.`);
        }

        return parseGitHubUserSearchResponse(response);
    }

    private async handleUnauthorizedResponse(session: AuthenticationSession): Promise<void> {
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
}
