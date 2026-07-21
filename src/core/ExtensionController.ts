import * as vscode from "vscode";
import { StatusBarManager } from "../ui/StatusBarManager";
import { CommandManager } from "../commands/CommandManager";

export class ExtensionController implements vscode.Disposable {
    private statusBar: StatusBarManager;
    private commandManager: CommandManager;

    constructor() {
        this.statusBar = new StatusBarManager();
        this.commandManager = new CommandManager();
    }

    dispose() {
        this.commandManager.dispose();
        this.statusBar.dispose();
    }
}

