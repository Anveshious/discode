import * as vscode from "vscode";
import { OpenDashboard } from "../webview/DashboardView";

export class CommandManager implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private readonly dashboardView: OpenDashboard;

    constructor() {
        this.dashboardView = new OpenDashboard();

        const openDashboard = vscode.commands.registerCommand("discode.openDashboard", () => {
            this.dashboardView.show();
        });

        this.disposables.push(openDashboard);
    }

    dispose(): void {
        this.disposables.forEach((disposable) => disposable.dispose());
    }
}