import * as vscode from 'vscode';
import { ExtensionController} from './core/ExtensionController';

export async function activate(context: vscode.ExtensionContext) {
	const controller = new ExtensionController(context);
	context.subscriptions.push(controller);
	await controller.initialize();
	
	// const disposable = vscode.commands.registerCommand('discode.helloWorld', () => {
	// 	vscode.window.showInformationMessage("it's the time to discode!");
	// });

	// context.subscriptions.push(disposable);
}
export function deactivate() {}