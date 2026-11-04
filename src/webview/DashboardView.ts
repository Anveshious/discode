import * as vscode from "vscode";
import { AuthManager } from "../auth/AuthManager";
import { GitHubService } from "../services/GitHubService";
import { ManualPresenceStatus } from "../models/PresenceStatus";
import { PresenceManager } from "../services/PresenceManager";

function isManualPresenceStatus(value: unknown): value is ManualPresenceStatus {
    return value === "online"
        || value === "focused"
        || value === "open-to-contribute";
}

export class OpenDashboard {
    private panel?: vscode.WebviewPanel;
    private readonly githubService: GitHubService;

    constructor(
        private readonly authManager: AuthManager,
        private readonly presenceManager: PresenceManager
    ) {
        this.githubService = new GitHubService(authManager);
    }

    public async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            "discodeDashboard",
            "Discode Dashboard",
            vscode.ViewColumn.One,
            {
                enableScripts: true,
            }
        );
        this.panel = panel;

        panel.webview.html = this.getHtmlContent();

        panel.webview.onDidReceiveMessage(async(message) => {
            switch (message.type) {
                case "webview.ready":
                    await this.postAuthenticationState(panel);
                    await this.postPresenceState(panel);
                    break;
                case "auth.login":
                    try {
                        await this.authManager.login();
                    } catch {
                        return;
                    }
                    break;
                case "auth.logout":
                    try {
                        await this.authManager.logout();
                    } catch {
                        await vscode.window.showErrorMessage("Unable to sign out of GitHub.");
                    }
                    break;
                case "presence.setManualStatus":
                    if (!isManualPresenceStatus(message.status)) {
                        await vscode.window.showErrorMessage("Choose a valid presence status.");
                        return;
                    }

                    try {
                        await this.presenceManager.setManualStatus(message.status);
                    } catch {
                        await vscode.window.showErrorMessage("Unable to save your presence status.");
                    }
                    break;
            }
        });

        const authStateSubscription = this.authManager.onDidChangeAuthentication(
            () => {
                void this.postAuthenticationState(panel).catch((error: unknown) => {
                    console.error("Failed to update dashboard authentication state.", error);
                });
            }
        );
        const presenceSubscription = this.presenceManager.onDidChangeStatus(() => {
            void this.postPresenceState(panel).catch((error: unknown) => {
                console.error("Failed to update dashboard presence state.", error);
            });
        });

        panel.onDidDispose(() => {
            authStateSubscription.dispose();
            presenceSubscription.dispose();
            this.panel = undefined;
        });
    }

    private async postPresenceState(panel: vscode.WebviewPanel): Promise<void> {
        await panel.webview.postMessage({
            type: "presence.state",
            status: this.presenceManager.getStatus(),
            manualStatus: this.presenceManager.getManualStatus(),
        });
    }

    private async postAuthenticationState(panel: vscode.WebviewPanel): Promise<void> {
        const session = this.authManager.getSession();
        await panel.webview.postMessage({
            type: "auth.state",
            authenticated: session !== undefined,
            accountLabel: session?.account.label,
        });

        if (!session) {
            return;
        }

        try {
            const user = await this.githubService.getCurrentUser();
            if (
                this.panel !== panel
                || this.authManager.getSession()?.id !== session.id
                || this.authManager.getSession()?.accessToken !== session.accessToken
            ) {
                return;
            }

            await panel.webview.postMessage({
                type: "auth.profile",
                user,
            });
        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : "Unable to load your GitHub profile.";
            await vscode.window.showErrorMessage(message);
        }
    }

    private getHtmlContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Discode Dashboard</title>
    <style>
        /* Professional VS Code Extension Theming */
        :root {
            /* Uses native VS Code theme variables, falls back to GitHub Dark if opened in a browser */
            --bg-color: var(--vscode-editor-background, #0d1117);
            --card-bg: var(--vscode-sideBar-background, #161b22);
            --border-color: var(--vscode-widget-border, #30363d);
            --text-main: var(--vscode-editor-foreground, #c9d1d9);
            --text-muted: var(--vscode-descriptionForeground, #8b949e);
            --btn-bg: var(--vscode-button-background, #238636);
            --btn-fg: var(--vscode-button-foreground, #ffffff);
            --btn-hover: var(--vscode-button-hoverBackground, #2ea043);
            --btn-secondary: var(--vscode-button-secondaryBackground, #21262d);
            --btn-secondary-fg: var(--vscode-button-secondaryForeground, #c9d1d9);
            --btn-secondary-hover: var(--vscode-button-secondaryHoverBackground, #30363d);
            --offline-color: #8b949e;
            --online-color: #3fb950;
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background-color: var(--bg-color);
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
            color: var(--text-main);
        }

        .dashboard-container {
            width: 100%;
            max-width: 360px;
            padding: 20px;
        }

        .dashboard-card {
            background-color: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            padding: 2.5rem 2rem;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            position: relative;
            overflow: hidden;
        }

        .header {
            margin-bottom: 2rem;
        }

        .header h1 {
            margin: 0;
            font-size: 1.75rem;
            font-weight: 700;
            letter-spacing: 0.5px;
            color: var(--text-main);
        }

        .header p {
            color: var(--text-muted);
            font-size: 0.9rem;
            margin-top: 8px;
            line-height: 1.4;
        }

        /* Profile Section */
        .profile-card {
            background-color: rgba(0, 0, 0, 0.15);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 1rem 1.2rem;
            margin-bottom: 1rem;
            text-align: left;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .profile-avatar {
            width: 56px;
            height: 56px;
            border-radius: 50%;
            object-fit: cover;
            margin-bottom: 8px;
        }

        .profile-label {
            color: var(--text-muted);
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 600;
        }

        .profile-name {
            font-size: 1.2rem;
            font-weight: 600;
            color: var(--text-main);
        }

        /* Status & Stats Section */
        .status-container {
            background-color: rgba(0, 0, 0, 0.15);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 1rem 1.2rem;
            margin-bottom: 1.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .status-label {
            color: var(--text-muted);
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 600;
        }

        .status-indicator {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 500;
            font-size: 0.95rem;
        }

        .dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            display: inline-block;
            background-color: var(--offline-color);
            transition: all 0.3s ease;
        }

        .dot.online {
            background-color: var(--online-color);
            box-shadow: 0 0 10px rgba(63, 185, 80, 0.5);
        }

        .stats-container {
            display: flex;
            justify-content: space-between;
            padding: 0 0.5rem;
            margin-bottom: 2rem;
            font-size: 0.9rem;
            color: var(--text-muted);
        }

        .stats-container span {
            color: var(--text-main);
            font-weight: 600;
        }

        .presence-select {
            width: 100%;
            margin: 0 0 1.5rem;
            padding: 0.65rem;
            color: var(--text-main);
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 5px;
            font: inherit;
        }

        /* Buttons */
        .btn {
            border: 1px solid transparent;
            padding: 0.75rem 1.5rem;
            border-radius: 5px;
            font-size: 0.95rem;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-family: inherit;
        }

        .btn-primary {
            background-color: var(--btn-bg);
            color: var(--btn-fg);
            border-color: rgba(255, 255, 255, 0.1);
        }

        .btn-primary:hover {
            background-color: var(--btn-hover);
        }

        .btn-secondary {
            background-color: var(--btn-secondary);
            color: var(--btn-secondary-fg);
            border-color: var(--border-color);
        }

        .btn-secondary:hover {
            background-color: var(--btn-secondary-hover);
        }

        .github-icon {
            width: 18px;
            height: 18px;
            fill: currentColor;
        }

        /* Smooth View Transitions */
        .view-section {
            transition: opacity 0.3s ease, transform 0.3s ease;
            opacity: 1;
            transform: translateY(0);
        }

        .hidden {
            display: none !important;
            opacity: 0;
            transform: translateY(10px);
        }
    </style>
</head>
<body>
    <div class="dashboard-container">
        <div class="dashboard-card">

            <!-- ================= LOGGED OUT VIEW ================= -->
            <div id="view-logged-out" class="view-section">
                <div class="header">
                    <h1>🚀 DISCODE</h1>
                    <p>Know when your friends are coding.</p>
                </div>

                <div class="status-container" style="margin-bottom: 2.5rem;">
                    <span class="status-label">Status</span>
                    <div class="status-indicator">
                        <span class="dot" id="statusDot"></span>
                        <span id="statusText">Offline</span>
                    </div>
                </div>

                <button class="btn btn-primary" id="loginBtn" onclick="login()">
                    <svg class="github-icon" viewBox="0 0 16 16" version="1.1" aria-hidden="true">
                        <path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
                    </svg>
                    Sign in with GitHub
                </button>
            </div>

            <!-- ================= LOGGED IN VIEW ================= -->
            <div id="view-logged-in" class="view-section hidden">
                <div class="header">
                    <h1>🚀 DISCODE</h1>
                    <p>👋 Welcome back!</p>
                </div>

                <div class="profile-card">
                    <img class="profile-avatar" id="userAvatar" alt="GitHub avatar" hidden />
                    <span class="profile-label">Display name</span>
                    <span class="profile-name" id="userName">Loading profile...</span>
                    <span class="profile-label">GitHub username</span>
                    <span id="userLogin">—</span>
                    <span class="profile-label">GitHub ID</span>
                    <span id="userId">—</span>
                </div>

                <div class="status-container" style="margin-bottom: 1rem;">
                    <span class="status-label">Status</span>
                    <div class="status-indicator">
                        <span class="dot online" id="statusDotLoggedIn"></span>
                        <span id="statusTextLoggedIn">Online</span>
                    </div>
                </div>

                <label class="profile-label" for="manualStatus">Your status</label>
                <select class="presence-select" id="manualStatus" onchange="setManualStatus(this.value)">
                    <option value="online">Automatic (Online / Idle)</option>
                    <option value="focused">Focused</option>
                    <option value="open-to-contribute">Open to Contribute</option>
                </select>

                <div class="stats-container">
                    <span>Friends Online:</span>
                    <span id="friendsCount">0</span>
                </div>

                <button class="btn btn-secondary" onclick="logout()">
                    Sign Out
                </button>
            </div>

        </div>
    </div>

    <script>
        // Check if running inside VS Code, otherwise fail gracefully so it still works in a standard browser
        const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

        function login() {
            if (vscode) {
                vscode.postMessage({ type: "auth.login" });
            }
        }

        function logout() {
            if (vscode) {
                vscode.postMessage({ type: "auth.logout" });
            }
        }

        function setManualStatus(status) {
            if (vscode) {
                vscode.postMessage({ type: "presence.setManualStatus", status });
            }
        }

        // Logic to swap the screens
        function setViewState(isLoggedIn) {
            const loggedOutView = document.getElementById('view-logged-out');
            const loggedInView = document.getElementById('view-logged-in');
            
            if (isLoggedIn) {
                loggedOutView.classList.add('hidden');
                loggedInView.classList.remove('hidden');
            } else {
                loggedInView.classList.add('hidden');
                loggedOutView.classList.remove('hidden');
            }
        }

        // Optional: Listen for backend state changes (e.g., when the extension first loads)
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'auth.profile') {
                document.getElementById('userName').textContent =
                    message.user.name || message.user.login;
                document.getElementById('userLogin').textContent = message.user.login;
                document.getElementById('userId').textContent =
                    String(message.user.id);
                const avatar = document.getElementById('userAvatar');
                avatar.src = message.user.avatar_url;
                avatar.hidden = false;
            } else if (message.type === 'auth.state') {
                setViewState(message.authenticated);
                if (message.authenticated && message.accountLabel) {
                    document.getElementById('userLogin').textContent =
                        message.accountLabel;
                } else if (!message.authenticated) {
                    document.getElementById('userName').textContent =
                        'Not signed in';
                    document.getElementById('userLogin').textContent = '—';
                    document.getElementById('userId').textContent = '—';
                    const avatar = document.getElementById('userAvatar');
                    avatar.removeAttribute('src');
                    avatar.hidden = true;
                }
            } else if (message.type === 'presence.state') {
                const status = message.status;
                document.getElementById('statusTextLoggedIn').textContent =
                    status === 'open-to-contribute'
                        ? 'Open to Contribute'
                        : status.charAt(0).toUpperCase() + status.slice(1);
                const statusDot = document.getElementById('statusDotLoggedIn');
                statusDot.classList.toggle('online', status !== 'idle');
                document.getElementById('manualStatus').value = message.manualStatus;
            }
        });

        if (vscode) {
            vscode.postMessage({ type: "webview.ready" });
        }
    </script>
</body>
</html>`;
    }
}