import * as vscode from "vscode";

export interface StatusBarState {
    text: string;
    tooltip?: string;
    command?: string;
    color?: vscode.ThemeColor;
}