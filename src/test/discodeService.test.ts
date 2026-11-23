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

function createService(fetchImplementation: typeof fetch): DiscodeService {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImplementation;
    const service = new DiscodeService({
        getSession: () => session,
        handleSessionExpired: async () => false,
    });
    globalThis.fetch = originalFetch;
    return service;
}

suite("DiscodeService Test Suite", () => {
    test("loads authenticated friends with their presence", async () => {
        const service = createService(async (input, init) => {
            assert.ok(String(input).endsWith("/api/friends"));
            assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-token");
            return new Response(JSON.stringify({
                friends: [{
                    githubId: "123456",
                    username: "friend",
                    name: "Friend",
                    avatarUrl: "https://avatars.githubusercontent.com/u/123456",
                    profileUrl: "https://github.com/friend",
                    status: "offline",
                }],
            }));
        });

        assert.deepEqual(await service.getFriends(), [{
            githubId: "123456",
            username: "friend",
            name: "Friend",
            avatarUrl: "https://avatars.githubusercontent.com/u/123456",
            profileUrl: "https://github.com/friend",
            status: "offline",
        }]);
    });

    test("rejects malformed friend lists", async () => {
        const service = createService(async () => new Response(JSON.stringify({
            friends: [{ username: "friend" }],
        })));

        await assert.rejects(service.getFriends(), /invalid friends list/);
    });

    test("loads incoming friend requests", async () => {
        const service = createService(async input => {
            assert.ok(String(input).endsWith("/api/friend-requests"));
            return new Response(JSON.stringify({
                requests: [{
                    id: "request-id",
                    githubId: "123456",
                    username: "friend",
                    name: null,
                    avatarUrl: "https://avatars.githubusercontent.com/u/123456",
                    profileUrl: "https://github.com/friend",
                    createdAt: "2026-11-14T00:00:00.000Z",
                }],
            }));
        });

        assert.deepEqual(await service.getFriendRequests(), [{
            id: "request-id",
            githubId: "123456",
            username: "friend",
            name: null,
            avatarUrl: "https://avatars.githubusercontent.com/u/123456",
            profileUrl: "https://github.com/friend",
            createdAt: "2026-11-14T00:00:00.000Z",
        }]);
    });

    test("sends a friend request and accepts incoming requests", async () => {
        const requests: Array<{ url: string; method: string; body: string | null }> = [];
        const service = createService(async (input, init) => {
            const url = String(input);
            requests.push({
                url,
                method: init?.method ?? "GET",
                body: init?.body as string | null,
            });
            return new Response(JSON.stringify({
                status: url.endsWith("/accept") ? "accepted" : "pending",
            }));
        });

        await service.sendFriendRequest("123456");
        await service.acceptFriendRequest("request-id");

        assert.equal(requests[0].url.endsWith("/api/friend-requests"), true);
        assert.equal(requests[0].method, "POST");
        assert.deepEqual(JSON.parse(requests[0].body ?? ""), { githubId: "123456" });
        assert.equal(requests[1].url.endsWith("/api/friend-requests/request-id/accept"), true);
        assert.equal(requests[1].method, "POST");
    });

    test("publishes presence using an authenticated PUT request", async () => {
        const service = createService(async (input, init) => {
            assert.ok(String(input).endsWith("/api/presence"));
            assert.equal(init?.method, "PUT");
            assert.deepEqual(JSON.parse(String(init?.body)), { status: "online" });
            return new Response(JSON.stringify({ status: "online" }));
        });

        await service.updatePresence("online");
    });

    test("removes a friend using an authenticated DELETE request", async () => {
        const service = createService(async (input, init) => {
            assert.ok(String(input).endsWith("/api/friends/123456"));
            assert.equal(init?.method, "DELETE");
            return new Response(JSON.stringify({ status: "removed" }));
        });

        await service.removeFriend("123456");
    });
});
