import * as vscode from "vscode";
import { OpenDashboard } from "../webview/DashboardView";
import { AuthManager } from "../auth/AuthManager";

export class CommandManager implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private readonly dashboardView: OpenDashboard;
    private readonly authManager: AuthManager;

    constructor() {
        this.authManager = new AuthManager();
        this.dashboardView = new OpenDashboard(this.authManager);

        const openDashboard = vscode.commands.registerCommand("discode.openDashboard", () => {
            this.dashboardView.show();
        });

        this.disposables.push(openDashboard);
    }

    public async execute(message: any): Promise<void> {
            switch (message.type) {
                case "auth.login":
                    await this.authManager.login();
                    break;
                case "auth.logout":
                    await this.authManager.logout();
                    break;
            }
        }

    dispose(): void {
        this.disposables.forEach((disposable) => disposable.dispose());
    }
}