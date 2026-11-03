import * as vscode from "vscode";
import { StatusBarState } from "../models/StatusBarState";

export class StatusBarManager implements vscode.Disposable {
  private statusBar: vscode.StatusBarItem;

  public update(state: StatusBarState): void {
    this.statusBar.text = state.text;
    this.statusBar.tooltip = state.tooltip;
    this.statusBar.command = state.command;
    this.statusBar.color = state.color;
  }

  public updateAuthenticationState(isAuthenticated: boolean): void {
    this.update({
      text: isAuthenticated ? "$(radio-tower) Discode: Online" : "$(radio-tower) Discode",
      tooltip: isAuthenticated ? "Signed in to GitHub" : "Sign in to GitHub",
      command: "discode.openDashboard",
      color: isAuthenticated ? new vscode.ThemeColor("charts.green") : undefined
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

    this.update({
      text: "$(radio-tower) Discode",
      command: "discode.openDashboard"
    });

    this.statusBar.show();
  }
}