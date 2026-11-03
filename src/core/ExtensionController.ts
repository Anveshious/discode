import * as vscode from "vscode";
import { StatusBarManager } from "../ui/StatusBarManager";
import { CommandManager } from "../commands/CommandManager";

export class ExtensionController implements vscode.Disposable {
    private statusBar: StatusBarManager;
    private commandManager: CommandManager;

    constructor(context: vscode.ExtensionContext) {
        this.statusBar = new StatusBarManager();
        this.commandManager = new CommandManager(context);
    }

    public async initialize(): Promise<void> {
        await this.commandManager.initialize();
    }

    dispose() {
        this.commandManager.dispose();
        this.statusBar.dispose();
    }
}
