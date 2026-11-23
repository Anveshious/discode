import * as assert from "assert";
import * as vscode from "vscode";
import { PresenceSync } from "../services/PresenceSync";
import { PresenceManager } from "../services/PresenceManager";
import { FriendRequestNotifier } from "../services/FriendRequestNotifier";
import type { DiscodeService } from "../services/DiscodeService";
import type { AuthManager } from "../auth/AuthManager";
import type { PresenceStatusValue } from "../models/PresenceStatus";

suite("PresenceSync Test Suite", () => {
    function createMockSession(): vscode.AuthenticationSession {
        return {
            id: "session-1",
            accessToken: "token-1",
            account: { id: "12345", label: "testuser" },
            scopes: ["read:user"],
        };
    }

    test("starts heartbeat and publishes presence upon authentication", async () => {
        let session: vscode.AuthenticationSession | undefined = createMockSession();
        const authEmitter = new vscode.EventEmitter<boolean>();

        const mockAuthManager = {
            getSession: () => session,
            onDidChangeAuthentication: authEmitter.event,
        } as unknown as AuthManager;

        const globalStateValues = new Map<string, unknown>();
        const mockGlobalState: Pick<vscode.Memento, "get" | "update"> = {
            get: <T>(key: string, defaultValue?: T) => (globalStateValues.has(key) ? (globalStateValues.get(key) as T) : defaultValue),
            update: async (key: string, value: unknown) => {
                if (value === undefined) { globalStateValues.delete(key); } else { globalStateValues.set(key, value); }
            },
        };
        const presenceManager = new PresenceManager(mockGlobalState);
        await presenceManager.initialize();

        const publishedStatuses: PresenceStatusValue[] = [];
        let signInCalls = 0;
        let friendRequestCalls = 0;

        const mockDiscodeService = {
            signIn: async () => {
                signInCalls++;
                return { user: { id: "u-1", githubId: "12345", username: "testuser", name: "Test", avatarUrl: "", profileUrl: "" }, created: false };
            },
            updatePresence: async (status: PresenceStatusValue) => {
                publishedStatuses.push(status);
            },
            getFriendRequests: async () => {
                friendRequestCalls++;
                return [];
            },
        } as unknown as DiscodeService;

        const notifier = new FriendRequestNotifier();
        const sync = new PresenceSync(
            mockAuthManager,
            presenceManager,
            notifier,
            mockDiscodeService,
            20 // 20ms heartbeat interval for testing
        );

        try {
            // Wait for initial signIn and presence publish
            await new Promise((resolve) => setTimeout(resolve, 35));

            assert.strictEqual(signInCalls, 1);
            assert.ok(publishedStatuses.length >= 1);
            assert.strictEqual(publishedStatuses[0], "offline"); // default initial before activity

            // Wait for at least one heartbeat tick
            const previousCount = publishedStatuses.length;
            await new Promise((resolve) => setTimeout(resolve, 50));
            assert.ok(publishedStatuses.length > previousCount);
            assert.ok(friendRequestCalls >= 1);

            // Test stopping heartbeat on sign-out
            session = undefined;
            authEmitter.fire(false);

            const countAfterSignOut = publishedStatuses.length;
            await new Promise((resolve) => setTimeout(resolve, 50));
            assert.strictEqual(publishedStatuses.length, countAfterSignOut);
        } finally {
            sync.dispose();
            presenceManager.dispose();
            authEmitter.dispose();
        }
    });

    test("stops heartbeat when disposed", async () => {
        const session = createMockSession();
        const authEmitter = new vscode.EventEmitter<boolean>();

        const mockAuthManager = {
            getSession: () => session,
            onDidChangeAuthentication: authEmitter.event,
        } as unknown as AuthManager;

        const globalStateValues = new Map<string, unknown>();
        const mockGlobalState: Pick<vscode.Memento, "get" | "update"> = {
            get: <T>(key: string, defaultValue?: T) => (globalStateValues.has(key) ? (globalStateValues.get(key) as T) : defaultValue),
            update: async (key: string, value: unknown) => {
                if (value === undefined) { globalStateValues.delete(key); } else { globalStateValues.set(key, value); }
            },
        };
        const presenceManager = new PresenceManager(mockGlobalState);
        await presenceManager.initialize();

        let presencePublishCount = 0;
        const mockDiscodeService = {
            signIn: async () => ({ user: { id: "u-1", githubId: "12345", username: "testuser", name: "Test", avatarUrl: "", profileUrl: "" }, created: false }),
            updatePresence: async () => { presencePublishCount++; },
            getFriendRequests: async () => [],
        } as unknown as DiscodeService;

        const sync = new PresenceSync(
            mockAuthManager,
            presenceManager,
            new FriendRequestNotifier(),
            mockDiscodeService,
            20
        );

        await new Promise((resolve) => setTimeout(resolve, 30));
        sync.dispose();

        const countAtDispose = presencePublishCount;
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.strictEqual(presencePublishCount, countAtDispose);

        presenceManager.dispose();
        authEmitter.dispose();
    });

    test("immediately synchronizes manual presence state changes to the backend", async () => {
        const session = createMockSession();
        const authEmitter = new vscode.EventEmitter<boolean>();

        const mockAuthManager = {
            getSession: () => session,
            onDidChangeAuthentication: authEmitter.event,
        } as unknown as AuthManager;

        const globalStateValues = new Map<string, unknown>();
        const mockGlobalState: Pick<vscode.Memento, "get" | "update"> = {
            get: <T>(key: string, defaultValue?: T) => (globalStateValues.has(key) ? (globalStateValues.get(key) as T) : defaultValue),
            update: async (key: string, value: unknown) => {
                if (value === undefined) { globalStateValues.delete(key); } else { globalStateValues.set(key, value); }
            },
        };
        const presenceManager = new PresenceManager(mockGlobalState);
        await presenceManager.initialize();

        const publishedStatuses: PresenceStatusValue[] = [];
        const mockDiscodeService = {
            signIn: async () => ({ user: { id: "u-1", githubId: "12345", username: "testuser", name: "Test", avatarUrl: "", profileUrl: "" }, created: false }),
            updatePresence: async (status: PresenceStatusValue) => {
                publishedStatuses.push(status);
            },
            getFriendRequests: async () => [],
        } as unknown as DiscodeService;

        // Long heartbeat so only manual changes trigger publishes
        const sync = new PresenceSync(
            mockAuthManager,
            presenceManager,
            new FriendRequestNotifier(),
            mockDiscodeService,
            60_000
        );

        try {
            await new Promise((resolve) => setTimeout(resolve, 30));
            assert.strictEqual(publishedStatuses[0], "offline");

            // Change to focused
            await presenceManager.setManualStatus("focused");
            await new Promise((resolve) => setTimeout(resolve, 30));
            assert.strictEqual(publishedStatuses[publishedStatuses.length - 1], "focused");

            // Change to open-to-contribute
            await presenceManager.setManualStatus("open-to-contribute");
            await new Promise((resolve) => setTimeout(resolve, 30));
            assert.strictEqual(publishedStatuses[publishedStatuses.length - 1], "open-to-contribute");
        } finally {
            sync.dispose();
            presenceManager.dispose();
            authEmitter.dispose();
        }
    });
});
