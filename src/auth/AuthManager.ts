import * as vscode from "vscode";

export class AuthManager {
    private session?: vscode.AuthenticationSession;

    public async login(): Promise<vscode.AuthenticationSession> {
        try {
            const session = await vscode.authentication.getSession(
                "github",
                ["user:email"],
                { createIfNone: true }
            );

            this.session = session;
            vscode.window.showInformationMessage(
                `Welcome ${session.account.label}!`
            );
            
            console.log(this.session.accessToken);

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