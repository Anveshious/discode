import * as vscode from "vscode";

export class AuthManager {
    private session?: vscode.AuthenticationSession;

    public async login(): Promise<vscode.AuthenticationSession> {
        
        try {
            // this.session = await vscode.authentication.getSession("github", [], {
            //     createIfNone: true,
            // });
            const session = await vscode.authentication.getSession("github",[],{createIfNone: true});
            //vscode.window.showInformationMessage("Successfully logged in with GitHub!");
            vscode.window.showInformationMessage(
                `Welcome ${session.account.label}!`
            );
            return session;
        } catch (error) {
            vscode.window.showErrorMessage("Failed to login with GitHub");
            throw error;
        }
    }

    public logout() {
        this.session = undefined;
    }

    public getSession(): vscode.AuthenticationSession | undefined {
        return this.session;
    }

    public isAuthenticated(): boolean {
        return this.session !== undefined;
    }
}