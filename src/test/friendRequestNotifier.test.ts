import * as assert from "assert";
import { FriendRequestNotifier } from "../services/FriendRequestNotifier";
import type { DiscodeFriendRequest } from "../services/DiscodeService";

suite("FriendRequestNotifier Test Suite", () => {
    function makeRequest(id: string, username: string): DiscodeFriendRequest {
        return {
            id,
            githubId: id,
            username,
            name: `${username} Name`,
            avatarUrl: `https://avatars.githubusercontent.com/u/${id}`,
            profileUrl: `https://github.com/${username}`,
            createdAt: new Date().toISOString(),
        };
    }

    test("does not notify on initial batch of friend requests", () => {
        const notifications: string[] = [];
        const notifier = new FriendRequestNotifier((msg) => {
            notifications.push(msg);
            return Promise.resolve(undefined);
        });

        notifier.processRequests([
            makeRequest("req-1", "alice"),
            makeRequest("req-2", "bob"),
        ]);

        assert.strictEqual(notifications.length, 0);
    });

    test("notifies when a new friend request arrives", async () => {
        const notifications: { message: string; options: string[] }[] = [];
        let dashboardOpened = false;

        const notifier = new FriendRequestNotifier(
            (msg, ...options) => {
                notifications.push({ message: msg, options });
                return Promise.resolve("Open Dashboard");
            },
            () => {
                dashboardOpened = true;
            }
        );

        // Initial batch
        notifier.processRequests([makeRequest("req-1", "alice")]);
        assert.strictEqual(notifications.length, 0);

        // Second batch with a new request
        notifier.processRequests([
            makeRequest("req-1", "alice"),
            makeRequest("req-2", "bob"),
        ]);

        assert.strictEqual(notifications.length, 1);
        assert.strictEqual(notifications[0].message, "@bob sent you a friend request on Discode!");
        assert.deepStrictEqual(notifications[0].options, ["Open Dashboard"]);
        assert.strictEqual(dashboardOpened, true);
    });

    test("does not duplicate notifications for existing requests", () => {
        const notifications: string[] = [];
        const notifier = new FriendRequestNotifier((msg) => {
            notifications.push(msg);
            return Promise.resolve(undefined);
        });

        notifier.processRequests([]);
        notifier.processRequests([makeRequest("req-1", "alice")]);
        assert.strictEqual(notifications.length, 1);

        // Subsequent poll with same request
        notifier.processRequests([makeRequest("req-1", "alice")]);
        assert.strictEqual(notifications.length, 1);
    });

    test("reset clears known requests so next batch is treated as initial", () => {
        const notifications: string[] = [];
        const notifier = new FriendRequestNotifier((msg) => {
            notifications.push(msg);
            return Promise.resolve(undefined);
        });

        notifier.processRequests([makeRequest("req-1", "alice")]);
        assert.strictEqual(notifications.length, 0);

        notifier.reset();

        notifier.processRequests([makeRequest("req-2", "bob")]);
        assert.strictEqual(notifications.length, 0);
    });
});
