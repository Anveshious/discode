import * as vscode from "vscode";
import { AuthManager } from "../auth/AuthManager";
import { PresenceManager } from "../services/PresenceManager";
import { GitHubService } from "../services/GitHubService";
import {
    isPresenceStatus,
    PRESENCE_STATUS_DESCRIPTIONS,
    PRESENCE_STATUS_LABELS,
} from "../models/PresenceStatus";

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
                    await this.postDashboardState(panel);
                    break;
                case "auth.login":
                    try {
                        await this.authManager.login();
                    } catch {
                        return;
                    }

                    try {
                        const user = await this.githubService.getCurrentUser();
                        await panel.webview.postMessage({
                            type: "auth.profile",
                            user,
                        });
                    } catch {
                        await vscode.window.showErrorMessage("Unable to load your GitHub profile.");
                    }
                    break;
                case "presence.update":
                    if (!this.authManager.isAuthenticated()) {
                        return;
                    }

                    if (!isPresenceStatus(message.status)) {
                        await vscode.window.showErrorMessage("Choose a valid presence status.");
                        return;
                    }

                    try {
                        await this.presenceManager.setStatus(message.status);
                    } catch {
                        await vscode.window.showErrorMessage("Unable to save your presence status.");
                    }
                    break;
                case "auth.logout":
                    try {
                        await this.authManager.logout();
                    } catch {
                        await vscode.window.showErrorMessage("Unable to sign out of GitHub.");
                    }
                    break;
            }
        });

        const postDashboardState = () => {
            void this.postDashboardState(panel).catch((error: unknown) => {
                console.error("Failed to update dashboard state.", error);
            });
        };
        const authStateSubscription = this.authManager.onDidChangeAuthentication(
            postDashboardState
        );
        const presenceSubscription = this.presenceManager.onDidChangeStatus(
            postDashboardState
        );

        panel.onDidDispose(() => {
            authStateSubscription.dispose();
            presenceSubscription.dispose();
            this.panel = undefined;
        });
    }

    private async postDashboardState(panel: vscode.WebviewPanel): Promise<void> {
        const session = this.authManager.getSession();
        await panel.webview.postMessage({
            type: "dashboard.state",
            authenticated: session !== undefined,
            accountLabel: session?.account.label,
            presence: this.presenceManager.getStatus(),
        });
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
            --idle-color: #d29922;
            --focused-color: #58a6ff;
            --contribute-color: #bc8cff;
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
            max-width: 460px;
            padding: 24px;
        }

        .dashboard-card {
            background-color: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            padding: 2rem;
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

        .dot.presence-idle {
            background-color: var(--idle-color);
        }

        .dot.presence-focused {
            background-color: var(--focused-color);
        }

        .dot.presence-open-to-contribute {
            background-color: var(--contribute-color);
        }

        .presence-card {
            padding: 1rem 1.2rem;
            margin-bottom: 1.5rem;
            text-align: left;
            background-color: rgba(0, 0, 0, 0.15);
            border: 1px solid var(--border-color);
            border-radius: 6px;
        }

        .presence-card label {
            display: block;
            margin-bottom: 0.6rem;
            color: var(--text-muted);
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 600;
        }

        .presence-select {
            width: 100%;
            padding: 0.65rem 0.75rem;
            color: var(--text-main);
            background-color: var(--bg-color);
            border: 1px solid var(--border-color);
            border-radius: 5px;
            font: inherit;
        }

        .presence-description {
            min-height: 2.5em;
            margin: 0.75rem 0 0;
            color: var(--text-muted);
            font-size: 0.85rem;
            line-height: 1.45;
        }

        .local-note {
            margin: 0 0 1.25rem;
            color: var(--text-muted);
            font-size: 0.78rem;
            line-height: 1.45;
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
                    <span class="profile-label">GitHub</span>
                    <span class="profile-name" id="userName">Anne *</span>
                </div>

                <div class="status-container">
                    <span class="status-label">Status</span>
                    <div class="status-indicator">
                        <span class="dot online" id="presenceDot"></span>
                        <span id="presenceLabel">Online</span>
                    </div>
                </div>

                <div class="presence-card">
                    <label for="presenceSelect">Set your presence</label>
                    <select class="presence-select" id="presenceSelect" onchange="changePresence(this.value)">
                        ${Object.entries(PRESENCE_STATUS_LABELS).map(([status, label]) =>
        `<option value="${status}">${label}</option>`
    ).join("")}
                    </select>
                    <p class="presence-description" id="presenceDescription"></p>
                </div>

                <p class="local-note">Your presence is saved for this VS Code profile. Sharing it with teammates isn’t available yet.</p>

                <button class="btn btn-secondary" onclick="logout()">
                    Sign Out
                </button>
            </div>

        </div>
    </div>

    <script>
        // Check if running inside VS Code, otherwise fail gracefully so it still works in a standard browser
        const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
        const presenceLabels = ${JSON.stringify(PRESENCE_STATUS_LABELS)};
        const presenceDescriptions = ${JSON.stringify(PRESENCE_STATUS_DESCRIPTIONS)};

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

        function changePresence(status) {
            if (vscode) {
                vscode.postMessage({ type: "presence.update", status });
            }
        }

        function setPresenceState(status) {
            const label = presenceLabels[status];
            if (!label) {
                return;
            }

            document.getElementById('presenceSelect').value = status;
            document.getElementById('presenceLabel').textContent = label;
            document.getElementById('presenceDescription').textContent =
                presenceDescriptions[status];
            document.getElementById('presenceDot').className =
                'dot' + (status === 'online' ? ' online' : ' presence-' + status);
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

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'auth.profile') {
                document.getElementById('userName').textContent =
                    message.user.name || message.user.login;
            } else if (message.type === 'dashboard.state') {
                setViewState(message.authenticated);
                if (message.authenticated && message.accountLabel) {
                    document.getElementById('userName').textContent =
                        message.accountLabel;
                }
                setPresenceState(message.presence);
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