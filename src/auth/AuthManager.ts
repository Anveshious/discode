import * as vscode from "vscode";

export class AuthManager {
    private session?: vscode.AuthenticationSession;

    public async handleMessage(message: any): Promise<void> {
        switch (message.type) {
            case "auth.login":
                await this.login();
                break;
            case "auth.logout":
                await this.logout();
                break;
        }
    }

    private async login(): Promise<vscode.AuthenticationSession> {
        try {
            this.session = await vscode.authentication.getSession("github", ["user:email"], {
                createIfNone: true,
            });
            vscode.window.showInformationMessage("Successfully logged in with GitHub!");
            return this.session;
        } catch (error) {
            vscode.window.showErrorMessage("Failed to login with GitHub");
            throw error;
        }
    }

    private async logout(): Promise<void> {
        if (this.session) {
            await vscode.authentication.getSession("github", ["user:email"], {
                createIfNone: false,
            });
            this.session = undefined;
            vscode.window.showInformationMessage("Logged out successfully");
        }
    }

    public getSession(): vscode.AuthenticationSession | undefined {
        return this.session;
    }

    public isAuthenticated(): boolean {
        return this.session !== undefined;
    }
}