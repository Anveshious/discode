import * as vscode from "vscode";
import { StatusBarState } from "../models/StatusBarState";

export class StatusBarManager implements vscode.Disposable {
  private statusBar: vscode.StatusBarItem;

  constructor() {
    this.statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );

    this.statusBar.text = "$(radio-tower) Discode";
    // this.statusBar.tooltip = "Discode";
    // this.statusBar.command = "discode.helloWorld";
    this.statusBar.show();
  }

  public update(state: StatusBarState): void {
    this.statusBar.text = state.text;
    this.statusBar.tooltip = state.tooltip;
    this.statusBar.command = state.command;
    this.statusBar.color = state.color;
  }

  public show(): void {
    this.statusBar.show();
  }

  public dispose(): void {
    this.statusBar.dispose();
  }
}