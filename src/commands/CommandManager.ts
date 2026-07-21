import * as vscode from "vscode";

export class CommandManager implements vscode.Disposable{
    private disposables: vscode.Disposable[] =[];
    constructor(){
    }
    dispose(): void {
        this.disposables.forEach(d=> d.dispose());
    }
}