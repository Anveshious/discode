import * as vscode from "vscode";
import { StatusBarManager } from "../ui/StatusBarManager";
import { CommandManager } from "../commands/CommandManager";
import { AuthManager } from "../auth/AuthManager";

export class ExtensionController implements vscode.Disposable {
    private statusBar: StatusBarManager;
    private commandManager: CommandManager;
    private authManager: AuthManager;
    private readonly authStateSubscription: vscode.Disposable;

    constructor(context: vscode.ExtensionContext) {
        this.authManager = new AuthManager(context.secrets);
        this.statusBar = new StatusBarManager();
        this.commandManager = new CommandManager(this.authManager);
        this.statusBar.updateAuthenticationState(this.authManager.isAuthenticated());
        this.authStateSubscription = this.authManager.onDidChangeAuthentication(
            (isAuthenticated) => this.statusBar.updateAuthenticationState(isAuthenticated)
        );
    }

    public async initialize(): Promise<void> {
        await this.authManager.initialize();
    }

    dispose() {
        this.authStateSubscription.dispose();
        this.commandManager.dispose();
        this.statusBar.dispose();
        this.authManager.dispose();
    }
}
