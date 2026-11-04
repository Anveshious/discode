import * as vscode from "vscode";
import { StatusBarManager } from "../ui/StatusBarManager";
import { CommandManager } from "../commands/CommandManager";
import { AuthManager } from "../auth/AuthManager";
import { PresenceManager } from "../services/PresenceManager";

export class ExtensionController implements vscode.Disposable {
    private statusBar: StatusBarManager;
    private commandManager: CommandManager;
    private authManager: AuthManager;
    private presenceManager: PresenceManager;
    private readonly authStateSubscription: vscode.Disposable;
    private readonly presenceSubscription: vscode.Disposable;

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
        this.updateStatusBar();
    }

    private updateStatusBar(): void {
        this.statusBar.updatePresence(
            this.authManager.isAuthenticated(),
            this.presenceManager.getStatus()
        );
    }

    dispose() {
        this.authStateSubscription.dispose();
        this.presenceSubscription.dispose();
        this.commandManager.dispose();
        this.statusBar.dispose();
        this.authManager.dispose();
        this.presenceManager.dispose();
    }
}
