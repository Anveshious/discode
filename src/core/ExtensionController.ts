import * as vscode from "vscode";
import { StatusBarManager } from "../ui/StatusBarManager";
import { CommandManager } from "../commands/CommandManager";
import { AuthManager } from "../auth/AuthManager";
import { PresenceManager } from "../services/PresenceManager";
import { PresenceSync } from "../services/PresenceSync";
import { FriendRequestNotifier } from "../services/FriendRequestNotifier";
import { PresenceTracker } from "../presence/presenceTracker";

function getIdleThresholdMs(): number {
    const minutes = vscode.workspace.getConfiguration("discode").get<number>(
        "idleTimeoutMinutes",
        5
    );
    if (typeof minutes === "number" && Number.isFinite(minutes) && minutes >= 1) {
        return Math.floor(minutes * 60 * 1000);
    }
    return 5 * 60 * 1000;
}

export class ExtensionController implements vscode.Disposable {
    private statusBar: StatusBarManager;
    private commandManager: CommandManager;
    private authManager: AuthManager;
    private presenceManager: PresenceManager;
    private presenceSync: PresenceSync;
    private friendRequestNotifier: FriendRequestNotifier;
    private presenceTracker?: PresenceTracker;
    private readonly authStateSubscription: vscode.Disposable;
    private readonly presenceSubscription: vscode.Disposable;
    private readonly configurationSubscription: vscode.Disposable;
    private activitySubscription?: vscode.Disposable;

    constructor(context: vscode.ExtensionContext) {
        this.authManager = new AuthManager(context.secrets, context.globalState);
        this.presenceManager = new PresenceManager(context.globalState);
        this.friendRequestNotifier = new FriendRequestNotifier();
        this.presenceSync = new PresenceSync(
            this.authManager,
            this.presenceManager,
            this.friendRequestNotifier
        );
        this.statusBar = new StatusBarManager();
        this.commandManager = new CommandManager(
            this.authManager,
            this.presenceManager,
            this.friendRequestNotifier
        );
        this.updateStatusBar();
        this.authStateSubscription = this.authManager.onDidChangeAuthentication(
            () => this.updateStatusBar()
        );
        this.presenceSubscription = this.presenceManager.onDidChangeStatus(
            () => this.updateStatusBar()
        );
        this.configurationSubscription = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("discode.idleTimeoutMinutes")) {
                this.presenceTracker?.setIdleThresholdMs(getIdleThresholdMs());
            }
        });
    }

    public async initialize(): Promise<void> {
        await Promise.all([
            this.authManager.initialize(),
            this.presenceManager.initialize()
        ]);

        if (this.presenceTracker) {
            return;
        }

        this.presenceTracker = new PresenceTracker(getIdleThresholdMs());
        this.activitySubscription = this.presenceTracker.onDidChangePresence(
            (presence) => this.presenceManager.setActivity(presence.status)
        );
        this.presenceManager.setActivity(
            this.presenceTracker.getCurrentPresence().status
        );
        this.updateStatusBar();
    }

    private updateStatusBar(): void {
        this.statusBar.updatePresence(
            this.authManager.isAuthenticated(),
            this.presenceManager.getStatus()
        );
    }

    public async disconnect(): Promise<void> {
        await this.presenceSync.disconnect();
    }

    dispose() {
        this.presenceTracker?.dispose();
        this.presenceSync.dispose();
        this.activitySubscription?.dispose();
        this.authStateSubscription.dispose();
        this.presenceSubscription.dispose();
        this.configurationSubscription.dispose();
        this.commandManager.dispose();
        this.statusBar.dispose();
        this.authManager.dispose();
        this.presenceManager.dispose();
    }
}
