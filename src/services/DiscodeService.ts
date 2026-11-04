import * as vscode from "vscode";
import type { AuthManager } from "../auth/AuthManager";

export interface DiscodeProfile {
    id: string;
    githubId: string;
    username: string;
    name: string | null;
    avatarUrl: string;
    profileUrl: string;
    bio: string | null;
    company: string | null;
    location: string | null;
    blog: string;
    followers: number;
    following: number;
    registeredAt: string;
    preferences: Record<string, unknown>;
}

interface SignInResponse {
    user: DiscodeProfile;
    created: boolean;
}

function isDiscodeProfile(value: unknown): value is DiscodeProfile {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const profile = value as Record<string, unknown>;
    return typeof profile.id === "string"
        && typeof profile.githubId === "string"
        && /^\d+$/.test(profile.githubId)
        && typeof profile.username === "string"
        && (typeof profile.name === "string" || profile.name === null)
        && typeof profile.avatarUrl === "string"
        && typeof profile.profileUrl === "string"
        && (typeof profile.bio === "string" || profile.bio === null)
        && (typeof profile.company === "string" || profile.company === null)
        && (typeof profile.location === "string" || profile.location === null)
        && typeof profile.blog === "string"
        && typeof profile.followers === "number"
        && typeof profile.following === "number"
        && typeof profile.registeredAt === "string"
        && typeof profile.preferences === "object"
        && profile.preferences !== null
        && !Array.isArray(profile.preferences);
}

function getBackendUrl(): URL {
    const configuredUrl = vscode.workspace.getConfiguration("discode").get<string>(
        "backendUrl",
        "http://localhost:3000"
    );
    let url: URL;
    try {
        url = new URL(configuredUrl);
    } catch {
        throw new Error("The Discode backend URL is invalid.");
    }

    const isLocalHttp = url.protocol === "http:"
        && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !isLocalHttp) {
        throw new Error("The Discode backend must use HTTPS except on localhost.");
    }
    if (url.username || url.password) {
        throw new Error("The Discode backend URL must not contain credentials.");
    }

    return new URL("/api/auth/github", url);
}

export class DiscodeService {
    constructor(
        private readonly authManager: Pick<AuthManager, "getSession" | "handleSessionExpired">
    ) {}

    public async signIn(): Promise<SignInResponse> {
        const session = this.authManager.getSession();
        if (!session) {
            throw new Error("GitHub authentication is required to sign in to Discode.");
        }

        let response: Response;
        try {
            response = await fetch(getBackendUrl(), {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.accessToken}`,
                },
                body: "{}",
            });
        } catch {
            throw new Error("Unable to reach the Discode backend.");
        }

        let result: unknown;
        try {
            result = await response.json();
        } catch {
            throw new Error("The Discode backend returned an invalid response.");
        }

        if (response.status === 401) {
            const error = typeof result === "object" && result !== null
                ? (result as Record<string, unknown>).error
                : undefined;
            if (error === "invalid_github_token") {
                await this.authManager.handleSessionExpired(session);
                throw new Error("Your GitHub session expired. Please sign in again.");
            }
            throw new Error("GitHub authentication is required to sign in to Discode.");
        }
        if (!response.ok) {
            throw new Error("The Discode backend could not sign you in.");
        }

        if (
            typeof result !== "object"
            || result === null
            || typeof (result as Record<string, unknown>).created !== "boolean"
            || !isDiscodeProfile((result as Record<string, unknown>).user)
        ) {
            throw new Error("The Discode backend returned an invalid profile.");
        }

        return result as SignInResponse;
    }
}
