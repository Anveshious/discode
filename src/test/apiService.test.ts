import * as assert from "assert";
import * as vscode from "vscode";
import { ApiService } from "../services/ApiService";

const session: vscode.AuthenticationSession = {
    id: "session-id",
    accessToken: "test-token",
    scopes: [],
    account: {
        id: "583231",
        label: "octocat",
    },
};

suite("ApiService Test Suite", () => {
    test("sends authenticated JSON requests to the configured backend", async () => {
        let requestHeaders: Headers | undefined;
        let requestBody: string | undefined;
        const api = new ApiService(
            {
                getSession: () => session,
                handleSessionExpired: async () => false,
            },
            async (input, init) => {
                assert.ok(String(input).endsWith("/api/auth/github"));
                requestHeaders = new Headers(init?.headers);
                requestBody = init?.body as string;
                return new Response(JSON.stringify({ user: "saved" }), { status: 201 });
            }
        );

        const result = await api.post("api/auth/github", {});

        assert.deepStrictEqual(result, { user: "saved" });
        assert.strictEqual(requestHeaders?.get("authorization"), "Bearer test-token");
        assert.strictEqual(requestHeaders?.get("content-type"), "application/json");
        assert.strictEqual(requestBody, "{}");
    });

    test("reports server errors and network disconnections", async () => {
        const authManager = {
            getSession: () => session,
            handleSessionExpired: async () => false,
        };
        const serverErrorApi = new ApiService(
            authManager,
            async () => new Response(JSON.stringify({ error: "unavailable" }), { status: 503 })
        );
        await assert.rejects(serverErrorApi.get("api/health"), /temporarily unavailable/);

        const networkErrorApi = new ApiService(authManager, async () => {
            throw new TypeError("fetch failed");
        });
        await assert.rejects(networkErrorApi.get("api/health"), /Check your connection/);
    });

    test("expires the GitHub session when the backend rejects its token", async () => {
        let expiredSession: vscode.AuthenticationSession | undefined;
        const api = new ApiService(
            {
                getSession: () => session,
                handleSessionExpired: async (value) => {
                    expiredSession = value;
                    return true;
                },
            },
            async () => new Response(
                JSON.stringify({ error: "invalid_github_token" }),
                { status: 401 }
            )
        );

        await assert.rejects(api.post("api/auth/github", {}), /session expired/);
        assert.strictEqual(expiredSession, session);
    });

    test("rejects authenticated requests when no GitHub session exists", async () => {
        const api = new ApiService(
            {
                getSession: () => undefined,
                handleSessionExpired: async () => false,
            },
            async () => assert.fail("must not make a request")
        );

        await assert.rejects(api.get("api/health"), /authentication is required/);
    });

    test("rejects endpoint paths that escape the configured backend", async () => {
        const api = new ApiService(
            {
                getSession: () => session,
                handleSessionExpired: async () => false,
            },
            async () => assert.fail("must not send the token to another origin")
        );

        await assert.rejects(api.get("https://attacker.example/collect"), /endpoint is invalid/);
        await assert.rejects(api.get("../collect"), /endpoint is invalid/);
    });
});
