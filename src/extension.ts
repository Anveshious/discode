// import * as vscode from 'vscode';
// import { ExtensionController} from './core/ExtensionController';

// export function activate(context: vscode.ExtensionContext) {
// 	new ExtensionController();
	
// 	// const disposable = vscode.commands.registerCommand('discode.helloWorld', () => {
// 	// 	vscode.window.showInformationMessage("it's the time to discode!");
// 	// });

// 	// context.subscriptions.push(disposable);
// }
// export function deactivate() {}


import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    debugger;

    vscode.window.showErrorMessage("ACTIVATE() IS RUNNING");

    throw new Error("STOP HERE");
}

export function deactivate() {}