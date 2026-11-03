import * as vscode from "vscode";
import {
  PresenceStatus,
  PRESENCE_STATUS_LABELS
} from "../models/PresenceStatus";
import { StatusBarState } from "../models/StatusBarState";

export class StatusBarManager implements vscode.Disposable {
  private statusBar: vscode.StatusBarItem;

  public update(state: StatusBarState): void {
    this.statusBar.text = state.text;
    this.statusBar.tooltip = state.tooltip;
    this.statusBar.command = state.command;
    this.statusBar.color = state.color;
  }

  public updatePresence(isAuthenticated: boolean, status: PresenceStatus): void {
    const label = isAuthenticated ? PRESENCE_STATUS_LABELS[status] : "Offline";
    const colorByStatus: Record<PresenceStatus, string> = {
      online: "charts.green",
      idle: "charts.orange",
      focused: "charts.blue",
      "open-to-contribute": "charts.purple"
    };

    this.update({
      text: `$(radio-tower) Discode: ${label}`,
      tooltip: isAuthenticated ? `GitHub presence: ${label}` : "Sign in to GitHub",
      command: "discode.openDashboard",
      color: isAuthenticated ? new vscode.ThemeColor(colorByStatus[status]) : undefined
    });
  }

  public show(): void {
    this.statusBar.show();
  }

  public dispose(): void {
    this.statusBar.dispose();
  }

  constructor() {
    this.statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );

    this.updatePresence(false, "online");

    this.statusBar.show();
  }
}