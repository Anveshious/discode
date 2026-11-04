import * as vscode from "vscode";

const LEGACY_SESSION_SECRET_KEY = "discode.githubSession";
const SIGNED_OUT_KEY = "discode.githubSignedOut";
const REAUTHENTICATION_REQUIRED_KEY = "discode.githubReauthenticationRequired";

export class AuthManager implements vscode.Disposable {
    private session?: vscode.AuthenticationSession;
    private sessionSyncGeneration = 0;
    private localSignOutInProgress = false;
    private readonly authenticationChangeEmitter = new vscode.EventEmitter<boolean>();
    private readonly providerSessionSubscription: vscode.Disposable;
    public readonly onDidChangeAuthentication = this.authenticationChangeEmitter.event;

    constructor(
        private readonly secretStorage: vscode.SecretStorage,
        private readonly globalState: vscode.Memento
    ) {
        this.providerSessionSubscription = vscode.authentication.onDidChangeSessions((event) => {
            if (
                event.provider.id !== "github"
                || this.localSignOutInProgress
                || this.globalState.get<boolean>(SIGNED_OUT_KEY, false)
            ) {
                return;
            }

            void this.refreshSession().catch((error: unknown) => {
                console.error("Failed to refresh the GitHub session.", error);
                void vscode.window.showErrorMessage(
                    "Unable to refresh GitHub authentication. Please sign in again."
                );
            });
        });
    }

    public async initialize(): Promise<void> {
        await this.secretStorage.delete(LEGACY_SESSION_SECRET_KEY);
        if (this.globalState.get<boolean>(SIGNED_OUT_KEY, false)) {
            return;
        }

        await this.restoreSession();
    }

    public async restoreSession(): Promise<boolean> {
        if (this.globalState.get<boolean>(SIGNED_OUT_KEY, false)) {
            this.setSession(undefined);
            return false;
        }

        try {
            return await this.refreshSession();
        } catch {
            return false;
        }
    }

    public async login(): Promise<vscode.AuthenticationSession> {
        try {
            const requiresReauthentication = this.globalState.get<boolean>(
                REAUTHENTICATION_REQUIRED_KEY,
                false
            );
            const session = await vscode.authentication.getSession("github", [], requiresReauthentication
                ? { forceNewSession: true }
                : { createIfNone: true });
            if (!session) {
                throw new Error("GitHub authentication did not return a session.");
            }

            await this.globalState.update(SIGNED_OUT_KEY, false);
            await this.globalState.update(REAUTHENTICATION_REQUIRED_KEY, false);
            this.setSession(session);
            vscode.window.showInformationMessage(`Welcome ${session.account.label}!`);
            return session;
        } catch (error) {
            vscode.window.showErrorMessage("Failed to login with GitHub");
            throw error;
        }
    }

    public async logout(): Promise<void> {
        this.localSignOutInProgress = true;
        this.sessionSyncGeneration++;
        try {
            await this.globalState.update(SIGNED_OUT_KEY, true);
            await this.globalState.update(REAUTHENTICATION_REQUIRED_KEY, false);
        } finally {
            this.setSession(undefined);
            this.localSignOutInProgress = false;
        }
    }

    public async handleSessionExpired(session: vscode.AuthenticationSession): Promise<boolean> {
        if (
            this.session?.id !== session.id
            || this.session.accessToken !== session.accessToken
        ) {
            return false;
        }

        this.localSignOutInProgress = true;
        this.sessionSyncGeneration++;
        try {
            await this.globalState.update(SIGNED_OUT_KEY, true);
            await this.globalState.update(REAUTHENTICATION_REQUIRED_KEY, true);
            return true;
        } finally {
            this.setSession(undefined);
            this.localSignOutInProgress = false;
        }
    }

    public getSession(): vscode.AuthenticationSession | undefined {
        return this.session;
    }

    public isAuthenticated(): boolean {
        return this.session !== undefined;
    }

    private async refreshSession(): Promise<boolean> {
        const generation = ++this.sessionSyncGeneration;
        let session: vscode.AuthenticationSession | undefined;
        try {
            session = await vscode.authentication.getSession("github", [], {
                createIfNone: false,
                silent: true,
            });
        } catch (error) {
            if (generation === this.sessionSyncGeneration) {
                this.setSession(undefined);
            }
            throw error;
        }

        if (generation !== this.sessionSyncGeneration) {
            return this.isAuthenticated();
        }

        this.setSession(session);
        return session !== undefined;
    }

    private setSession(session: vscode.AuthenticationSession | undefined): void {
        if (
            this.session?.id === session?.id
            && this.session?.accessToken === session?.accessToken
            && this.session?.account.id === session?.account.id
            && this.session?.account.label === session?.account.label
        ) {
            return;
        }

        this.session = session;
        this.authenticationChangeEmitter.fire(session !== undefined);
    }

    public dispose(): void {
        this.providerSessionSubscription.dispose();
        this.authenticationChangeEmitter.dispose();
    }
}
