import * as vscode from "vscode";
import { OpenDashboard } from "../webview/DashboardView";
import { AuthManager } from "../auth/AuthManager";

export class CommandManager implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private readonly dashboardView: OpenDashboard;

    constructor(private readonly authManager: AuthManager) {
        this.dashboardView = new OpenDashboard(this.authManager);

        const openDashboard = vscode.commands.registerCommand("discode.openDashboard", () => {
            this.dashboardView.show();
        });

        this.disposables.push(openDashboard);
    }

    dispose(): void {
        this.disposables.forEach((disposable) => disposable.dispose());
    }
}