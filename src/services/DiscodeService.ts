import type { AuthManager } from "../auth/AuthManager";
import { isPresenceStatus, PresenceStatusValue } from "../models/PresenceStatus";
import { ApiError, ApiService } from "./ApiService";
import type { Connection, ConnectionKind, ConnectionPage } from "../models/Connection";

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

export interface DiscodeFriend {
    githubId: string;
    username: string;
    name: string | null;
    avatarUrl: string;
    profileUrl: string;
    status: PresenceStatusValue;
}

export interface DiscodeFriendRequest {
    id: string;
    githubId: string;
    username: string;
    name: string | null;
    avatarUrl: string;
    profileUrl: string;
    createdAt: string;
}

function isDiscodeFriend(value: unknown): value is DiscodeFriend {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const friend = value as Record<string, unknown>;
    return typeof friend.githubId === "string"
        && /^\d+$/.test(friend.githubId)
        && typeof friend.username === "string"
        && (typeof friend.name === "string" || friend.name === null)
        && typeof friend.avatarUrl === "string"
        && typeof friend.profileUrl === "string"
        && isPresenceStatus(friend.status);
}

function isDiscodeFriendRequest(value: unknown): value is DiscodeFriendRequest {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const request = value as Record<string, unknown>;
    return typeof request.id === "string"
        && typeof request.githubId === "string"
        && /^\d+$/.test(request.githubId)
        && typeof request.username === "string"
        && (typeof request.name === "string" || request.name === null)
        && typeof request.avatarUrl === "string"
        && typeof request.profileUrl === "string"
        && typeof request.createdAt === "string";
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

function isSignInResponse(value: unknown): value is SignInResponse {
    return typeof value === "object"
        && value !== null
        && typeof (value as Record<string, unknown>).created === "boolean"
        && isDiscodeProfile((value as Record<string, unknown>).user);
}

export class DiscodeService {
    private readonly api: ApiService;

    constructor(
        private readonly authManager: Pick<AuthManager, "getSession" | "handleSessionExpired">
    ) {
        this.api = new ApiService(this.authManager);
    }

    public async signIn(): Promise<SignInResponse> {
        const result = await this.api.post("api/auth/github", {});
        if (!isSignInResponse(result)) {
            throw new Error("The Discode backend returned an invalid profile.");
        }

        const session = this.authManager.getSession();
        if (session && result.user.githubId !== session.account.id) {
            throw new ApiError(
                "The Discode profile does not match the authenticated GitHub account.",
                502,
                "github_identity_mismatch"
            );
        }

        return result;
    }

    public async getFriends(): Promise<DiscodeFriend[]> {
        const result = await this.api.get("api/friends");
        if (
            typeof result !== "object"
            || result === null
            || !Array.isArray((result as Record<string, unknown>).friends)
            || !(result as { friends: unknown[] }).friends.every(isDiscodeFriend)
        ) {
            throw new Error("The Discode backend returned an invalid friends list.");
        }

        return (result as { friends: DiscodeFriend[] }).friends;
    }

    public async getFriendRequests(): Promise<DiscodeFriendRequest[]> {
        const result = await this.api.get("api/friend-requests");
        if (
            typeof result !== "object"
            || result === null
            || !Array.isArray((result as Record<string, unknown>).requests)
            || !(result as { requests: unknown[] }).requests.every(isDiscodeFriendRequest)
        ) {
            throw new Error("The Discode backend returned an invalid friend requests list.");
        }

        return (result as { requests: DiscodeFriendRequest[] }).requests;
    }

    public async sendFriendRequest(githubId: string | number): Promise<void> {
        const result = await this.api.post("api/friend-requests", { githubId });
        if (
            typeof result !== "object"
            || result === null
            || (result as Record<string, unknown>).status !== "pending"
        ) {
            throw new Error("The Discode backend returned an invalid friend request result.");
        }
    }

    public async acceptFriendRequest(requestId: string): Promise<void> {
        const result = await this.api.post(
            `api/friend-requests/${encodeURIComponent(requestId)}/accept`,
            {}
        );
        if (
            typeof result !== "object"
            || result === null
            || (result as Record<string, unknown>).status !== "accepted"
        ) {
            throw new Error("The Discode backend returned an invalid friend request result.");
        }
    }

    public async declineFriendRequest(requestId: string): Promise<void> {
        const result = await this.api.post(
            `api/friend-requests/${encodeURIComponent(requestId)}/decline`,
            {}
        );
        if (
            typeof result !== "object"
            || result === null
            || (result as Record<string, unknown>).status !== "declined"
        ) {
            throw new Error("The Discode backend returned an invalid friend request result.");
        }
    }

    public async updatePresence(status: PresenceStatusValue): Promise<void> {
        const result = await this.api.request("api/presence", {
            method: "PUT",
            body: { status },
        });
        if (
            typeof result !== "object"
            || result === null
            || (result as Record<string, unknown>).status !== status
        ) {
            throw new Error("The Discode backend returned an invalid presence result.");
        }
    }
    public async getConnections(kind: ConnectionKind, page: number): Promise<ConnectionPage> {
        const result = await this.api.get(`api/social/${kind}?page=${page}`);
        if (!isConnectionPage(result)) {
            throw new Error("The Discode backend returned an invalid connections list.");
        }
        return result;
    }
}

function isConnection(value: unknown): value is Connection {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const c = value as Record<string, unknown>;
    return typeof c.githubId === "string" && /^\d+$/.test(c.githubId)
        && typeof c.username === "string"
        && typeof c.avatarUrl === "string"
        && typeof c.profileUrl === "string"
        && typeof c.onDiscode === "boolean"
        && (c.requestStatus === null
            || ["none", "sent", "received", "friends"].includes(c.requestStatus as string));
}

function isConnectionPage(value: unknown): value is ConnectionPage {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const p = value as Record<string, unknown>;
    return typeof p.page === "number"
        && typeof p.hasMore === "boolean"
        && Array.isArray(p.items)
        && p.items.every(isConnection);
}