import * as assert from "assert";
import * as vscode from "vscode";
import { GitHubService } from "../services/GitHubService";

const session: vscode.AuthenticationSession = {
    id: "session-id",
    accessToken: "test-token",
    scopes: [],
    account: {
        id: "account-id",
        label: "octocat",
    },
};

suite("GitHubService Test Suite", () => {
    const originalFetch = globalThis.fetch;

    teardown(() => {
        globalThis.fetch = originalFetch;
    });

    test("returns the numeric GitHub ID and profile fields", async () => {
        globalThis.fetch = async () => new Response(JSON.stringify({
            id: 583231,
            login: "octocat",
            name: "The Octocat",
            avatar_url: "https://avatars.githubusercontent.com/u/583231",
            html_url: "https://github.com/octocat",
            followers: 100,
            following: 5,
        }), { status: 200 });

        const service = new GitHubService({
            getSession: () => session,
            handleSessionExpired: async () => false,
        });

        const profile = await service.getCurrentUser();

        assert.strictEqual(profile.id, 583231);
        assert.strictEqual(profile.login, "octocat");
        assert.strictEqual(profile.avatar_url, "https://avatars.githubusercontent.com/u/583231");
        assert.strictEqual(profile.name, "The Octocat");
    });

    test("invalidates the active session after an unauthorized response", async () => {
        globalThis.fetch = async () => new Response(null, { status: 401 });
        let invalidatedSession: vscode.AuthenticationSession | undefined;

        const service = new GitHubService({
            getSession: () => session,
            handleSessionExpired: async (expiredSession) => {
                invalidatedSession = expiredSession;
                return true;
            },
        });

        await assert.rejects(
            service.getCurrentUser(),
            /GitHub session expired/
        );
        assert.strictEqual(invalidatedSession, session);
    });
});
