import * as assert from "assert";
import * as vscode from "vscode";
import { PresenceManager } from "../services/PresenceManager";

suite("PresenceManager Test Suite", () => {
    test("keeps manual status independent from detected activity", async () => {
        const values = new Map<string, unknown>();
        const globalState: Pick<vscode.Memento, "get" | "update"> = {
            get<T>(key: string, defaultValue?: T): T | undefined {
                return values.has(key) ? values.get(key) as T : defaultValue;
            },
            async update(key: string, value: unknown): Promise<void> {
                if (value === undefined) {
                    values.delete(key);
                } else {
                    values.set(key, value);
                }
            },
        };
        const manager = new PresenceManager(globalState);

        try {
            await manager.initialize();
            manager.setActivity("active");
            assert.strictEqual(manager.getStatus(), "online");

            await manager.setManualStatus("focused");
            manager.setActivity("idle");
            assert.strictEqual(manager.getStatus(), "focused");
            assert.strictEqual(manager.getManualStatus(), "focused");

            manager.setActivity("offline");
            assert.strictEqual(manager.getStatus(), "offline");
            manager.setActivity("active");
            assert.strictEqual(manager.getStatus(), "focused");

            await manager.setManualStatus("online");
            manager.setActivity("idle");
            assert.strictEqual(manager.getStatus(), "idle");
            assert.strictEqual(manager.getManualStatus(), "online");
        } finally {
            manager.dispose();
        }
    });
});
