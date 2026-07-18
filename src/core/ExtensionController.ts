import * as vscode from "vscode";

export class ExtensionController {
    constructor() {
        vscode.window.showInformationMessage(
            "Extension Controller initialized 🚀"
        );
    }
}