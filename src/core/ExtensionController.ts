import * as vscode from "vscode";
import { StatusBarManager } from "../ui/StatusBarManager";

export class ExtensionController implements vscode.Disposable {
    private statusBar: StatusBarManager;

    constructor() {
        this.statusBar = new StatusBarManager();
    }

    dispose() {
        this.statusBar.dispose();
    }
}