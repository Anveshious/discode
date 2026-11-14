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

    test("finds a GitHub user by username with the authenticated request", async () => {
        let requestedUrl = "";
        let requestHeaders: Headers | undefined;
        globalThis.fetch = async (input, init) => {
            requestedUrl = String(input);
            requestHeaders = new Headers(init?.headers);
            return new Response(JSON.stringify({
                id: 583231,
                login: "octocat",
                name: "The Octocat",
                avatar_url: "https://avatars.githubusercontent.com/u/583231",
                html_url: "https://github.com/octocat",
                followers: 100,
                following: 5,
            }), { status: 200 });
        };

        const service = new GitHubService({
            getSession: () => session,
            handleSessionExpired: async () => false,
        });

        const profile = await service.findUserByUsername(" octocat ");

        assert.strictEqual(requestedUrl, "https://api.github.com/users/octocat");
        assert.strictEqual(requestHeaders?.get("authorization"), "Bearer test-token");
        assert.strictEqual(profile?.login, "octocat");
    });

    test("returns undefined when a GitHub username does not exist", async () => {
        globalThis.fetch = async () => new Response(null, { status: 404 });
        const service = new GitHubService({
            getSession: () => session,
            handleSessionExpired: async () => false,
        });

        assert.strictEqual(await service.findUserByUsername("unknown-user"), undefined);
    });

    test("searches usernames and returns multiple GitHub profiles", async () => {
        let requestedUrl = "";
        let requestHeaders: Headers | undefined;
        globalThis.fetch = async (input, init) => {
            requestedUrl = String(input);
            requestHeaders = new Headers(init?.headers);
            return new Response(JSON.stringify({
                total_count: 2,
                incomplete_results: false,
                items: [
                    {
                        id: 583231,
                        login: "octocat",
                        avatar_url: "https://avatars.githubusercontent.com/u/583231",
                        html_url: "https://github.com/octocat",
                    },
                    {
                        id: 583232,
                        login: "octo-user",
                        avatar_url: "https://avatars.githubusercontent.com/u/583232",
                        html_url: "https://github.com/octo-user",
                    },
                ],
            }), { status: 200 });
        };
        const service = new GitHubService({
            getSession: () => session,
            handleSessionExpired: async () => false,
        });

        const users = await service.searchUsers(" octo ");
        const searchUrl = new URL(requestedUrl);

        assert.strictEqual(searchUrl.origin, "https://api.github.com");
        assert.strictEqual(searchUrl.pathname, "/search/users");
        assert.strictEqual(searchUrl.searchParams.get("q"), "octo in:login");
        assert.strictEqual(searchUrl.searchParams.get("per_page"), "5");
        assert.strictEqual(requestHeaders?.get("authorization"), "Bearer test-token");
        assert.deepStrictEqual(users.map((user) => user.login), ["octocat", "octo-user"]);
    });

    test("returns an empty list when username search has no matches", async () => {
        globalThis.fetch = async () => new Response(JSON.stringify({
            total_count: 0,
            incomplete_results: false,
            items: [],
        }), { status: 200 });
        const service = new GitHubService({
            getSession: () => session,
            handleSessionExpired: async () => false,
        });

        assert.deepStrictEqual(await service.searchUsers("unknown"), []);
    });

    test("rejects invalid usernames without making a GitHub request", async () => {
        let requestMade = false;
        globalThis.fetch = async () => {
            requestMade = true;
            return new Response(null, { status: 200 });
        };
        const service = new GitHubService({
            getSession: () => session,
            handleSessionExpired: async () => false,
        });

        await assert.rejects(service.findUserByUsername("not a username"), /valid GitHub username/);
        await assert.rejects(service.searchUsers("not a username"), /valid GitHub username/);
        assert.strictEqual(requestMade, false);
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
