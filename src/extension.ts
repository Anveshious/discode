import * as vscode from 'vscode';
import { ExtensionController } from './core/ExtensionController';

let controller: ExtensionController | undefined;

export async function activate(context: vscode.ExtensionContext) {
	controller = new ExtensionController(context);
	context.subscriptions.push(controller);
	await controller.initialize();
}

export async function deactivate(): Promise<void> {
	await controller?.disconnect();
	controller = undefined;
}