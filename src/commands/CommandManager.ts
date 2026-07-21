import * as vscode from "vscode";

export class CommandManager implements vscode.Disposable{
    private disposables: vscode.Disposable[] =[];
    constructor(){
        const openDashboard = vscode.commands.registerCommand(
            "discode.openDashboard",
            ()=>{
                vscode.window.showInformationMessage("welcome to discode");
            }
        );
        this.disposables.push(openDashboard);
    }
    dispose(): void {
        this.disposables.forEach(d=> d.dispose());
    }
}