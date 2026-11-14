import * as assert from "assert";
import * as vscode from "vscode";
import { DiscodeService } from "../services/DiscodeService";

const session: vscode.AuthenticationSession = {
    id: "session-id",
    accessToken: "test-token",
    scopes: [],
    account: {
        id: "583231",
        label: "octocat",
    },
};

suite("DiscodeService Test Suite", () => {
    const originalFetch = globalThis.fetch;

    teardown(() => {
        globalThis.fetch = originalFetch;
    });

    test("loads a paginated followers connection list", async () => {
        let requestedUrl = "";
        globalThis.fetch = async (input, init) => {
            requestedUrl = String(input);
            assert.strictEqual(new Headers(init?.headers).get("authorization"), "Bearer test-token");
            return new Response(JSON.stringify({
                page: 1,
                hasMore: false,
                items: [{
                    githubId: "123456",
                    username: "octo-user",
                    avatarUrl: "https://avatars.githubusercontent.com/u/123456",
                    profileUrl: "https://github.com/octo-user",
                    onDiscode: true,
                    requestStatus: "none",
                }],
            }), { status: 200 });
        };
        const service = new DiscodeService({
            getSession: () => session,
            handleSessionExpired: async () => false,
        });

        const result = await service.getConnections("followers", 1);

        assert.ok(requestedUrl.endsWith("/api/social/followers?page=1"));
        assert.strictEqual(result.items[0].githubId, "123456");
    });

    test("rejects malformed connection list responses", async () => {
        globalThis.fetch = async () => new Response(JSON.stringify({
            page: 1,
            hasMore: false,
            items: [{
                githubId: 123456,
                username: "octo-user",
                avatarUrl: "https://avatars.githubusercontent.com/u/123456",
                profileUrl: "https://github.com/octo-user",
                onDiscode: true,
                requestStatus: "none",
            }],
        }), { status: 200 });
        const service = new DiscodeService({
            getSession: () => session,
            handleSessionExpired: async () => false,
        });

        await assert.rejects(
            service.getConnections("followers", 1),
            /invalid connections list/
        );
    });

    test("posts a GitHub ID when sending a friend request", async () => {
        let requestedUrl = "";
        let requestMethod = "";
        let requestBody: unknown;
        globalThis.fetch = async (input, init) => {
            requestedUrl = String(input);
            requestMethod = init?.method ?? "";
            requestBody = JSON.parse(String(init?.body));
            return new Response(JSON.stringify({ status: "sent" }), { status: 201 });
        };
        const service = new DiscodeService({
            getSession: () => session,
            handleSessionExpired: async () => false,
        });

        await service.sendFriendRequest("123456");

        assert.ok(requestedUrl.endsWith("/api/friend-requests"));
        assert.strictEqual(requestMethod, "POST");
        assert.deepStrictEqual(requestBody, { githubId: "123456" });
    });
});