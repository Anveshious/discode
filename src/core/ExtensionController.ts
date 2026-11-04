import * as vscode from "vscode";
import { StatusBarManager } from "../ui/StatusBarManager";
import { CommandManager } from "../commands/CommandManager";
import { AuthManager } from "../auth/AuthManager";
import { PresenceManager } from "../services/PresenceManager";
import { PresenceTracker } from "../presence/presenceTracker";

export class ExtensionController implements vscode.Disposable {
    private statusBar: StatusBarManager;
    private commandManager: CommandManager;
    private authManager: AuthManager;
    private presenceManager: PresenceManager;
    private presenceTracker?: PresenceTracker;
    private readonly authStateSubscription: vscode.Disposable;
    private readonly presenceSubscription: vscode.Disposable;
    private activitySubscription?: vscode.Disposable;

    constructor(context: vscode.ExtensionContext) {
        this.authManager = new AuthManager(context.secrets, context.globalState);
        this.presenceManager = new PresenceManager(context.globalState);
        this.statusBar = new StatusBarManager();
        this.commandManager = new CommandManager(this.authManager, this.presenceManager);
        this.updateStatusBar();
        this.authStateSubscription = this.authManager.onDidChangeAuthentication(
            () => this.updateStatusBar()
        );
        this.presenceSubscription = this.presenceManager.onDidChangeStatus(
            () => this.updateStatusBar()
        );
    }

    public async initialize(): Promise<void> {
        await Promise.all([
            this.authManager.initialize(),
            this.presenceManager.initialize()
        ]);

        if (this.presenceTracker) {
            return;
        }

        this.presenceTracker = new PresenceTracker();
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

    dispose() {
        this.presenceTracker?.dispose();
        this.activitySubscription?.dispose();
        this.authStateSubscription.dispose();
        this.presenceSubscription.dispose();
        this.commandManager.dispose();
        this.statusBar.dispose();
        this.authManager.dispose();
        this.presenceManager.dispose();
    }
}
