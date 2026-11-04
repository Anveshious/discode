import type { AuthManager } from "../auth/AuthManager";
import { ApiError, ApiService } from "./ApiService";

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
}
