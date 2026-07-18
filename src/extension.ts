import * as vscode from 'vscode';
import { ExtensionController} from './core/ExtensionController';

export function activate(context: vscode.ExtensionContext) {
	const controller = new ExtensionController();
	
	// const disposable = vscode.commands.registerCommand('discode.helloWorld', () => {
	// 	vscode.window.showInformationMessage("it's the time to discode!");
	// });

	// context.subscriptions.push(disposable);
	context.subscriptions.push(controller);
}
export function deactivate() {}