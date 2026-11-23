import * as vscode from "vscode";
import type { AuthManager } from "../auth/AuthManager";
import type { PresenceManager } from "./PresenceManager";
import { DiscodeService } from "./DiscodeService";
import { FriendRequestNotifier } from "./FriendRequestNotifier";

const PRESENCE_HEARTBEAT_MS = 30_000;

function getHeartbeatIntervalMs(): number {
    const seconds = vscode.workspace.getConfiguration("discode").get<number>(
        "heartbeatIntervalSeconds",
        30
    );
    if (typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 5) {
        return Math.floor(seconds * 1000);
    }
    return PRESENCE_HEARTBEAT_MS;
}

export class PresenceSync implements vscode.Disposable {
    private readonly subscriptions: vscode.Disposable[];
    private heartbeat?: NodeJS.Timeout;
    private sessionKey?: string;
    private readySessionKey?: string;
    private hasReportedSyncError = false;

    constructor(
        private readonly authManager: AuthManager,
        private readonly presenceManager: PresenceManager,
        private readonly friendRequestNotifier: FriendRequestNotifier = new FriendRequestNotifier(),
        private readonly discodeService: DiscodeService = new DiscodeService(authManager),
        private readonly heartbeatIntervalMs: number = getHeartbeatIntervalMs()
    ) {
        this.subscriptions = [
            authManager.onDidChangeAuthentication(() => this.synchronizeSession()),
            presenceManager.onDidChangeStatus(() => this.publishPresence()),
        ];
        this.synchronizeSession();
    }

    private synchronizeSession(): void {
        const session = this.authManager.getSession();
        if (!session) {
            this.stopHeartbeat();
            this.sessionKey = undefined;
            this.readySessionKey = undefined;
            this.friendRequestNotifier.reset();
            return;
        }

        const key = `${session.id}:${session.accessToken}`;
        if (key === this.sessionKey) {
            return;
        }

        this.stopHeartbeat();
        this.sessionKey = key;
        this.readySessionKey = undefined;
        void this.initializeSession(key);
    }

    private async initializeSession(sessionKey: string): Promise<void> {
        try {
            await this.discodeService.signIn();
            if (sessionKey !== this.sessionKey) {
                return;
            }

            this.readySessionKey = sessionKey;
            await this.publishPresence(sessionKey);
            if (sessionKey !== this.sessionKey) {
                return;
            }
            this.heartbeat = setInterval(() => {
                void this.publishPresence(sessionKey);
            }, this.heartbeatIntervalMs);
        } catch (error) {
            if (sessionKey !== this.sessionKey) {
                return;
            }
            this.readySessionKey = undefined;
            this.reportSyncError(error);
            this.heartbeat = setInterval(() => {
                this.stopHeartbeat();
                void this.initializeSession(sessionKey);
            }, this.heartbeatIntervalMs);
        }
    }

    private async publishPresence(expectedSessionKey = this.sessionKey): Promise<void> {
        if (
            !expectedSessionKey
            || expectedSessionKey !== this.sessionKey
            || expectedSessionKey !== this.readySessionKey
        ) {
            return;
        }

        try {
            await this.discodeService.updatePresence(this.presenceManager.getStatus());
            this.hasReportedSyncError = false;
        } catch (error) {
            if (expectedSessionKey === this.sessionKey) {
                this.reportSyncError(error);
            }
        }

        try {
            const requests = await this.discodeService.getFriendRequests();
            if (expectedSessionKey === this.sessionKey) {
                this.friendRequestNotifier.processRequests(requests);
            }
        } catch {
            // Ignore social fetch errors during background presence heartbeat
        }
    }

    private reportSyncError(error: unknown): void {
        if (this.hasReportedSyncError) {
            return;
        }
        this.hasReportedSyncError = true;
        console.error("Failed to synchronize Discode presence.", error);
    }

    private stopHeartbeat(): void {
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = undefined;
        }
    }

    public dispose(): void {
        this.stopHeartbeat();
        this.subscriptions.forEach((subscription) => subscription.dispose());
    }
}
