import * as vscode from "vscode";

const SESSION_SECRET_KEY = "discode.githubSession";

function isAuthenticationSession(value: unknown): value is vscode.AuthenticationSession {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const session = value as Record<string, unknown>;
    if (
        typeof session.id !== "string"
        || typeof session.accessToken !== "string"
        || !Array.isArray(session.scopes)
        || !session.scopes.every((scope) => typeof scope === "string")
        || typeof session.account !== "object"
        || session.account === null
    ) {
        return false;
    }

    const account = session.account as Record<string, unknown>;
    return typeof account.id === "string" && typeof account.label === "string";
}

export class AuthManager implements vscode.Disposable {
    private session?: vscode.AuthenticationSession;
    private readonly authenticationChangeEmitter = new vscode.EventEmitter<boolean>();
    public readonly onDidChangeAuthentication = this.authenticationChangeEmitter.event;

    constructor(private readonly secretStorage: vscode.SecretStorage) {}

    public async initialize(): Promise<void> {
        const storedSession = await this.secretStorage.get(SESSION_SECRET_KEY);
        if (storedSession === undefined) {
            return;
        }

        let session: unknown;
        try {
            session = JSON.parse(storedSession);
        } catch {
            await this.secretStorage.delete(SESSION_SECRET_KEY);
            await vscode.window.showErrorMessage(
                "The saved GitHub session is invalid. Please log in again."
            );
            return;
        }

        if (!isAuthenticationSession(session)) {
            await this.secretStorage.delete(SESSION_SECRET_KEY);
            await vscode.window.showErrorMessage(
                "The saved GitHub session is invalid. Please log in again."
            );
            return;
        }

        this.session = session;
        this.authenticationChangeEmitter.fire(true);
    }

    public async login(): Promise<vscode.AuthenticationSession> {
        try {
            const session = await vscode.authentication.getSession(
                "github",
                ["user:email"],
                { createIfNone: true }
            );

            await this.secretStorage.store(
                SESSION_SECRET_KEY,
                JSON.stringify(session)
            );
            this.session = session;
            this.authenticationChangeEmitter.fire(true);
            vscode.window.showInformationMessage(
                `Welcome ${session.account.label}!`
            );

            return session;
        } catch (error) {
            vscode.window.showErrorMessage("Failed to login with GitHub");
            throw error;
        }
    }

    public async logout(): Promise<void> {
        await this.secretStorage.delete(SESSION_SECRET_KEY);
        this.session = undefined;
        this.authenticationChangeEmitter.fire(false);
    }

    public getSession(): vscode.AuthenticationSession | undefined {
        return this.session;
    }

    public isAuthenticated(): boolean {
        return this.session !== undefined;
    }

    public dispose(): void {
        this.authenticationChangeEmitter.dispose();
    }
    
}