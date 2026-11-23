import * as vscode from "vscode";
import { OpenDashboard } from "../webview/DashboardView";
import { AuthManager } from "../auth/AuthManager";
import { PresenceManager } from "../services/PresenceManager";
import type { FriendRequestNotifier } from "../services/FriendRequestNotifier";
import type { ManualPresenceStatus } from "../models/PresenceStatus";

export class CommandManager implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private readonly dashboardView: OpenDashboard;

    constructor(
        private readonly authManager: AuthManager,
        private readonly presenceManager: PresenceManager,
        friendRequestNotifier?: FriendRequestNotifier
    ) {
        this.dashboardView = new OpenDashboard(this.authManager, this.presenceManager, friendRequestNotifier);

        const openDashboard = vscode.commands.registerCommand("discode.openDashboard", () => {
            this.dashboardView.show();
        });

        const setPresenceStatus = vscode.commands.registerCommand("discode.setPresenceStatus", async () => {
            interface StatusQuickPickItem extends vscode.QuickPickItem {
                status: ManualPresenceStatus;
            }

            const current = this.presenceManager.getManualStatus();
            const items: StatusQuickPickItem[] = [
                {
                    label: "$(sync) Automatic (Online / Idle)",
                    description: current === "online" ? "Currently active" : undefined,
                    detail: "Automatically detects when you are active or idle in VS Code.",
                    status: "online",
                },
                {
                    label: "$(circle-slash) Focused",
                    description: current === "focused" ? "Currently active" : undefined,
                    detail: "Heads-down work. Signals friends that you prefer fewer interruptions.",
                    status: "focused",
                },
                {
                    label: "$(heart) Open to Contribute",
                    description: current === "open-to-contribute" ? "Currently active" : undefined,
                    detail: "Available for collaboration, code reviews, and pair programming.",
                    status: "open-to-contribute",
                },
            ];

            const selection = await vscode.window.showQuickPick(items, {
                placeHolder: "Select your Discode presence status",
            });

            if (selection) {
                await this.presenceManager.setManualStatus(selection.status);
                void vscode.window.showInformationMessage(
                    `Discode presence updated to ${selection.label.replace(/\$\([^)]+\)\s*/, "")}.`
                );
            }
        });

        this.disposables.push(openDashboard, setPresenceStatus);
    }

    dispose(): void {
        this.disposables.forEach((disposable) => disposable.dispose());
    }
}
