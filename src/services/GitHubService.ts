import type { AuthenticationSession } from "vscode";
import type { AuthManager } from "../auth/AuthManager";
import { ApiService } from "./ApiService";
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

interface RegisteredUsersResponse {
    registeredGithubIds: string[];
}

interface FriendRequestResponse {
    friendRequest: {
        id: string;
        requesterId: string;
        recipientId: string;
        status: "pending";
        createdAt: string;
    };
}

function isFriendRequestResponse(value: unknown): value is FriendRequestResponse {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const friendRequest = (value as Record<string, unknown>).friendRequest;
    if (typeof friendRequest !== "object" || friendRequest === null) {
        return false;
    }

    const request = friendRequest as Record<string, unknown>;
    return typeof request.id === "string"
        && typeof request.requesterId === "string"
        && typeof request.recipientId === "string"
        && request.status === "pending"
        && typeof request.createdAt === "string";
}

function isRegisteredUsersResponse(value: unknown): value is RegisteredUsersResponse {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const response = value as Record<string, unknown>;
    return Array.isArray(response.registeredGithubIds)
        && response.registeredGithubIds.every(
            (id) => typeof id === "string" && /^\d+$/.test(id)
        );
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

async function parseGitHubUserSearchResponse(response: Response): Promise<GitHubUserSearchItem[]> {
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

function getRetryDelaySeconds(response: Response, allowRateLimitReset: boolean): number | undefined {
    const retryAfter = response.headers.get("retry-after")?.trim();
    if (retryAfter) {
        const retryAfterSeconds = Number(retryAfter);
        if (Number.isFinite(retryAfterSeconds)) {
            return Math.max(0, Math.ceil(retryAfterSeconds));
        }

        const retryAt = Date.parse(retryAfter);
        if (Number.isFinite(retryAt)) {
            return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
        }
    }

    if (!allowRateLimitReset) {
        return undefined;
    }

    const resetAtSeconds = Number(response.headers.get("x-ratelimit-reset"));
    if (Number.isFinite(resetAtSeconds) && resetAtSeconds > 0) {
        return Math.max(0, Math.ceil(resetAtSeconds - Date.now() / 1000));
    }
}

async function getRateLimitMessage(response: Response): Promise<string | undefined> {
    if (response.status !== 403 && response.status !== 429) {
        return undefined;
    }

    const primaryLimitReached = response.headers.get("x-ratelimit-remaining") === "0";
    let secondaryLimitReached = false;
    if (response.status === 403 && !primaryLimitReached && !response.headers.has("retry-after")) {
        try {
            const body: unknown = await response.clone().json();
            if (typeof body === "object" && body !== null) {
                const message = (body as Record<string, unknown>).message;
                secondaryLimitReached = typeof message === "string"
                    && /rate limit|abuse detection/i.test(message);
            }
        } catch {
            secondaryLimitReached = false;
        }
    }

    if (
        response.status !== 429
        && !primaryLimitReached
        && !response.headers.has("retry-after")
        && !secondaryLimitReached
    ) {
        return undefined;
    }

    const retryDelaySeconds = getRetryDelaySeconds(response, primaryLimitReached);
    if (retryDelaySeconds !== undefined && retryDelaySeconds === 0) {
        return "GitHub API rate limit reached. You can retry now.";
    }
    if (retryDelaySeconds !== undefined) {
        const minutes = Math.ceil(retryDelaySeconds / 60);
        const retryDelay = retryDelaySeconds < 60
            ? `${retryDelaySeconds} second${retryDelaySeconds === 1 ? "" : "s"}`
            : `${minutes} minute${minutes === 1 ? "" : "s"}`;
        return `GitHub API rate limit reached. Try again in about ${retryDelay}.`;
    }
    if (secondaryLimitReached) {
        return "GitHub API secondary rate limit reached. Wait at least one minute before retrying.";
    }
    return "GitHub API rate limit reached. Try again later.";
}

export class GitHubService {
    private readonly api: Pick<ApiService, "post">;

    constructor(
        private readonly authManager: Pick<AuthManager, "getSession" | "handleSessionExpired">,
        api?: Pick<ApiService, "post">
    ) {
        this.api = api ?? new ApiService(authManager);
    }

    public async getCurrentUser(): Promise<GitHubUser> {
        const session = this.authManager.getSession();
        if (!session) {
            throw new Error("GitHub authentication is required to fetch the current user.");
        }

        const response = await this.request("https://api.github.com/user", session);
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

        const response = await this.request(
            `https://api.github.com/users/${encodeURIComponent(normalizedUsername)}`,
            session,
            true
        );

        if (response.status === 404) {
            return undefined;
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

        const response = await this.request(searchUrl, session);
        const users = await parseGitHubUserSearchResponse(response);
        if (users.length === 0) {
            return [];
        }

        const requestedIds = new Set(users.map((user) => String(user.id)));
        const membershipResponse = await this.api.post("api/users/registered", {
            githubIds: users.map((user) => user.id),
        });
        if (
            !isRegisteredUsersResponse(membershipResponse)
            || membershipResponse.registeredGithubIds.some((id) => !requestedIds.has(id))
        ) {
            throw new Error("The Discode backend returned invalid membership information.");
        }

        const registeredIds = new Set(membershipResponse.registeredGithubIds);
        return users.map((user) => ({
            ...user,
            isRegistered: registeredIds.has(String(user.id)),
        }));
    }

    public async sendFriendRequest(recipientGithubId: number): Promise<void> {
        if (!Number.isSafeInteger(recipientGithubId) || recipientGithubId <= 0) {
            throw new Error("The recipient GitHub ID is invalid.");
        }

        const result = await this.api.post("api/friend-requests", { recipientGithubId });
        if (!isFriendRequestResponse(result)) {
            throw new Error("The Discode backend returned an invalid friend request.");
        }
    }

    private async request(
        url: string | URL,
        session: AuthenticationSession,
        allowNotFound = false
    ): Promise<Response> {
        let response: Response;
        try {
            response = await fetch(url, {
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

        const rateLimitMessage = await getRateLimitMessage(response);
        if (rateLimitMessage) {
            throw new Error(rateLimitMessage);
        }
        if (!response.ok && !(allowNotFound && response.status === 404)) {
            throw new Error(`GitHub API request failed with status ${response.status}.`);
        }
        return response;
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
