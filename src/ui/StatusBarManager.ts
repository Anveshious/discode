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

  public show(): void {
    this.show();
  }

  public dispose(): void {
    this.dispose();
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