import * as vscode from "vscode";
import { AuthManager } from "../auth/AuthManager";
import { DiscodeService } from "../services/DiscodeService";
import { GitHubService } from "../services/GitHubService";
import { ManualPresenceStatus } from "../models/PresenceStatus";
import { PresenceManager } from "../services/PresenceManager";

function isManualPresenceStatus(value: unknown): value is ManualPresenceStatus {
    return value === "online"
        || value === "focused"
        || value === "open-to-contribute";
}

function isGitHubId(value: unknown): value is string | number {
    if (typeof value === "string") {
        if (!/^\d{1,19}$/.test(value)) {
            return false;
        }
        const id = BigInt(value);
        return id > 0n && id <= 9223372036854775807n;
    }
    return typeof value === "number"
        && Number.isSafeInteger(value)
        && value > 0;
}

export class OpenDashboard {
    private panel?: vscode.WebviewPanel;
    private latestSearchRequestId = 0;
    private socialRefreshInterval?: NodeJS.Timeout;
    private readonly discodeService: DiscodeService;
    private readonly githubService: GitHubService;

    constructor(
        private readonly authManager: AuthManager,
        private readonly presenceManager: PresenceManager
    ) {
        this.discodeService = new DiscodeService(authManager);
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
        this.latestSearchRequestId = 0;

        panel.webview.html = this.getHtmlContent();

        panel.webview.onDidReceiveMessage(async(message) => {
            switch (message.type) {
                case "webview.ready":
                    await this.postAuthenticationState(panel);
                    await this.postPresenceState(panel);
                    await this.refreshSocialData(panel);
                    break;
                case "auth.login":
                    try {
                        await this.authManager.login();
                    } catch {
                        return;
                    }
                    break;
                case "auth.logout":
                    void this.discodeService.updatePresence("offline").catch((error: unknown) => {
                        console.error("Failed to publish offline presence before sign-out.", error);
                    });
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
                case "github.searchUsers":
                    if (
                        !Number.isSafeInteger(message.requestId)
                        || message.requestId < this.latestSearchRequestId
                    ) {
                        return;
                    }
                    this.latestSearchRequestId = message.requestId;

                    if (typeof message.username !== "string") {
                        await panel.webview.postMessage({
                            type: "github.search.error",
                            requestId: message.requestId,
                            message: "Enter a valid GitHub username.",
                        });
                        return;
                    }

                    await this.searchGitHubUsers(panel, message.username, message.requestId);
                    break;
                case "friend.request":
                    await this.sendFriendRequest(panel, message.githubId);
                    break;
                case "friend.accept":
                    await this.acceptFriendRequest(panel, message.requestId);
                    break;
            }
        });

        const authStateSubscription = this.authManager.onDidChangeAuthentication(
            () => {
                void this.postAuthenticationState(panel)
                    .then(() => this.refreshSocialData(panel))
                    .catch((error: unknown) => {
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
            if (this.socialRefreshInterval) {
                clearInterval(this.socialRefreshInterval);
                this.socialRefreshInterval = undefined;
            }
            this.panel = undefined;
        });
        this.socialRefreshInterval = setInterval(
            () => this.refreshSocialData(panel),
            30_000
        );
    }

    private async refreshSocialData(panel: vscode.WebviewPanel): Promise<void> {
        const session = this.authManager.getSession();
        if (!session) {
            await panel.webview.postMessage({
                type: "social.state",
                friends: [],
                requests: [],
            });
            return;
        }

        try {
            const [friends, requests] = await Promise.all([
                this.discodeService.getFriends(),
                this.discodeService.getFriendRequests(),
            ]);
            const currentSession = this.authManager.getSession();
            if (
                this.panel !== panel
                || currentSession?.id !== session.id
                || currentSession.accessToken !== session.accessToken
            ) {
                return;
            }
            await panel.webview.postMessage({
                type: "social.state",
                friends,
                requests,
            });
        } catch (error) {
            const currentSession = this.authManager.getSession();
            if (
                this.panel !== panel
                || currentSession?.id !== session.id
                || currentSession.accessToken !== session.accessToken
            ) {
                return;
            }
            await panel.webview.postMessage({
                type: "social.error",
                message: error instanceof Error
                    ? error.message
                    : "Unable to load your friends.",
            });
        }
    }

    private async sendFriendRequest(
        panel: vscode.WebviewPanel,
        githubId: unknown
    ): Promise<void> {
        if (!isGitHubId(githubId)) {
            await panel.webview.postMessage({
                type: "friend.requestResult",
                githubId: String(githubId),
                status: "error",
                message: "Choose a valid Discode user.",
            });
            return;
        }

        try {
            await this.discodeService.sendFriendRequest(githubId);
            await panel.webview.postMessage({
                type: "friend.requestResult",
                githubId: String(githubId),
                status: "sent",
            });
            await this.refreshSocialData(panel);
        } catch (error) {
            await panel.webview.postMessage({
                type: "friend.requestResult",
                githubId: String(githubId),
                status: "error",
                message: error instanceof Error
                    ? error.message
                    : "Unable to send the friend request.",
            });
        }
    }

    private async acceptFriendRequest(
        panel: vscode.WebviewPanel,
        requestId: unknown
    ): Promise<void> {
        if (typeof requestId !== "string") {
            await panel.webview.postMessage({
                type: "friend.acceptResult",
                requestId: "",
                status: "error",
                message: "Choose a valid friend request.",
            });
            return;
        }

        try {
            await this.discodeService.acceptFriendRequest(requestId);
            await panel.webview.postMessage({
                type: "friend.acceptResult",
                requestId,
                status: "accepted",
            });
            await this.refreshSocialData(panel);
        } catch (error) {
            await panel.webview.postMessage({
                type: "friend.acceptResult",
                requestId,
                status: "error",
                message: error instanceof Error
                    ? error.message
                    : "Unable to accept the friend request.",
            });
        }
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
            const result = await this.discodeService.signIn();
            if (
                this.panel !== panel
                || this.authManager.getSession()?.id !== session.id
                || this.authManager.getSession()?.accessToken !== session.accessToken
            ) {
                return;
            }

            await panel.webview.postMessage({
                type: "auth.profile",
                user: result.user,
                created: result.created,
            });
        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : "Unable to load your GitHub profile.";
            await vscode.window.showErrorMessage(message);
        }
    }

    private async searchGitHubUsers(
        panel: vscode.WebviewPanel,
        username: string,
        requestId: number
    ): Promise<void> {
        const session = this.authManager.getSession();
        if (!session) {
            await panel.webview.postMessage({
                type: "github.search.error",
                requestId,
                message: "Sign in with GitHub to search for users.",
            });
            return;
        }

        try {
            const users = await this.githubService.searchUsers(username);
            if (!this.isCurrentSearch(panel, session, requestId)) {
                return;
            }

            await panel.webview.postMessage({
                type: "github.search.result",
                requestId,
                users,
            });
        } catch (error) {
            if (!this.isCurrentSearch(panel, session, requestId)) {
                return;
            }
            await panel.webview.postMessage({
                type: "github.search.error",
                requestId,
                message: error instanceof Error ? error.message : "Unable to search GitHub users.",
            });
        }
    }

    private isCurrentSearch(
        panel: vscode.WebviewPanel,
        session: vscode.AuthenticationSession,
        requestId: number
    ): boolean {
        const currentSession = this.authManager.getSession();
        return this.panel === panel
            && this.latestSearchRequestId === requestId
            && currentSession?.id === session.id
            && currentSession.accessToken === session.accessToken;
    }

    private getHtmlContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Discode Dashboard</title>
    <style>
        :root {
            /* Foundation tokens: derived from VS Code theme variables, dark-first fallbacks. */
            --dc-bg: var(--vscode-editor-background, #0f1115);
            --dc-fg: var(--vscode-foreground, #d4d7dd);
            --dc-muted: var(--vscode-descriptionForeground, #8b919c);
            --dc-rail: color-mix(in srgb, var(--dc-bg) 92%, var(--dc-fg) 8%);
            --dc-surface: color-mix(in srgb, var(--dc-bg) 94%, var(--dc-fg) 6%);
            --dc-raised: color-mix(in srgb, var(--dc-bg) 88%, var(--dc-fg) 12%);
            --dc-hover: color-mix(in srgb, var(--dc-bg) 82%, var(--dc-fg) 18%);
            --dc-border: var(--vscode-widget-border, color-mix(in srgb, var(--dc-fg) 16%, transparent));
            --dc-focus: var(--vscode-focusBorder, #4cc9b0);

            /* Brand identity */
            --dc-brand-a: #2dd4bf;
            --dc-brand-b: #8b5cf6;
            --dc-brand-gradient: linear-gradient(135deg, var(--dc-brand-a), var(--dc-brand-b));

            /* Presence colours */
            --st-online: var(--vscode-charts-green, #3fb950);
            --st-idle: var(--vscode-charts-yellow, #d29922);
            --st-focused: var(--vscode-charts-purple, #a371f7);
            --st-contribute: var(--vscode-charts-blue, #2dd4bf);
            --st-offline: var(--dc-muted);

            --radius: 12px;
            --radius-sm: 8px;
            --space-1: 4px;
            --space-2: 8px;
            --space-3: 12px;
            --space-4: 16px;
            --space-5: 24px;
            --space-6: 32px;
        }

        * { box-sizing: border-box; }

        html, body { height: 100%; }

        body {
            margin: 0;
            color: var(--dc-fg);
            background: var(--dc-bg);
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            line-height: 1.5;
        }

        .hidden { display: none !important; }

        /* ---------- Shell ---------- */
        .app {
            display: grid;
            grid-template-columns: 64px minmax(0, 1fr) 300px;
            grid-template-areas: "rail main aside";
            min-height: 100vh;
        }

        /* ---------- Rail ---------- */
        .rail {
            grid-area: rail;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-4) 0;
            background: var(--dc-rail);
            border-right: 1px solid var(--dc-border);
        }

        .brand-mark {
            width: 40px;
            height: 40px;
            display: grid;
            place-items: center;
            margin-bottom: var(--space-3);
            border-radius: 12px;
            background: var(--dc-brand-gradient);
            color: #fff;
            font-size: 18px;
            font-weight: 800;
            letter-spacing: -0.02em;
            box-shadow: 0 4px 14px color-mix(in srgb, var(--dc-brand-b) 35%, transparent);
        }

        .rail-nav {
            display: flex;
            flex-direction: column;
            gap: var(--space-2);
        }

        .nav-btn {
            position: relative;
            width: 40px;
            height: 40px;
            display: grid;
            place-items: center;
            padding: 0;
            color: var(--dc-muted);
            background: transparent;
            border: 0;
            border-radius: 12px;
            cursor: pointer;
            transition: background-color 0.15s ease, color 0.15s ease, border-radius 0.15s ease;
        }

        .nav-btn svg {
            width: 20px;
            height: 20px;
            fill: none;
            stroke: currentColor;
            stroke-width: 1.8;
            stroke-linecap: round;
            stroke-linejoin: round;
        }

        .nav-btn:hover:not(:disabled) {
            background: var(--dc-hover);
            color: var(--dc-fg);
            border-radius: 9px;
        }

        .nav-btn.active {
            background: var(--dc-raised);
            color: var(--dc-fg);
        }

        .nav-btn.active::before {
            content: "";
            position: absolute;
            left: -12px;
            top: 10px;
            bottom: 10px;
            width: 3px;
            border-radius: 0 3px 3px 0;
            background: var(--dc-brand-gradient);
        }

        .nav-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        /* ---------- Main ---------- */
        .main {
            grid-area: main;
            min-width: 0;
            padding: var(--space-6);
            display: flex;
            flex-direction: column;
            gap: var(--space-5);
        }

        .page-header h1 {
            margin: 0;
            font-size: 1.6em;
            font-weight: 700;
            letter-spacing: -0.01em;
        }

        .page-header p {
            margin: var(--space-1) 0 0;
            color: var(--dc-muted);
        }

        .view {
            display: flex;
            flex-direction: column;
            gap: var(--space-4);
            width: 100%;
            max-width: 760px;
        }

        /* ---------- Cards ---------- */
        .card {
            background: var(--dc-surface);
            border: 1px solid var(--dc-border);
            border-radius: var(--radius);
            padding: var(--space-5);
            transition: border-color 0.15s ease;
        }

        .card:hover {
            border-color: color-mix(in srgb, var(--dc-fg) 28%, transparent);
        }

        .eyebrow {
            display: block;
            color: var(--dc-muted);
            font-size: 0.72em;
            font-weight: 600;
            letter-spacing: 0.1em;
            text-transform: uppercase;
        }

        .card-title {
            margin: var(--space-1) 0 0;
            font-size: 1.1em;
            font-weight: 600;
        }

        /* ---------- Hero / profile ---------- */
        .hero {
            padding: 0;
            overflow: hidden;
        }

        .hero-banner {
            height: 88px;
            background:
                radial-gradient(circle at 20% 120%, color-mix(in srgb, var(--dc-brand-a) 55%, transparent), transparent 60%),
                radial-gradient(circle at 85% -20%, color-mix(in srgb, var(--dc-brand-b) 60%, transparent), transparent 55%),
                var(--dc-raised);
        }

        .hero-body {
            display: flex;
            align-items: flex-end;
            gap: var(--space-4);
            padding: 0 var(--space-5) var(--space-5);
            margin-top: -36px;
        }

        .avatar-wrap {
            position: relative;
            flex: 0 0 auto;
        }

        .avatar {
            display: block;
            width: 80px;
            height: 80px;
            border-radius: 50%;
            object-fit: cover;
            background: var(--dc-raised);
            border: 4px solid var(--dc-surface);
            box-shadow: 0 0 0 2px var(--ring, var(--st-online));
        }

        .avatar-badge {
            position: absolute;
            right: 2px;
            bottom: 2px;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: var(--ring, var(--st-online));
            border: 3px solid var(--dc-surface);
        }

        .hero-text { min-width: 0; padding-bottom: var(--space-1); }

        .hero-name {
            margin: 0;
            font-size: 1.35em;
            font-weight: 700;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .hero-meta {
            color: var(--dc-muted);
            font-size: 0.92em;
        }

        .hero-meta .sep { margin: 0 var(--space-2); opacity: 0.6; }

        /* ---------- Presence ---------- */
        .presence-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--space-3);
            margin-bottom: var(--space-4);
        }

        .status-pill {
            display: inline-flex;
            align-items: center;
            gap: var(--space-2);
            padding: 4px 12px;
            font-weight: 600;
            font-size: 0.92em;
            background: var(--dc-raised);
            border: 1px solid var(--dc-border);
            border-radius: 999px;
        }

        .dot {
            --dot: var(--st-offline);
            width: 9px;
            height: 9px;
            border-radius: 50%;
            background: var(--dot);
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--dot) 22%, transparent);
            transition: background-color 0.2s ease, box-shadow 0.2s ease;
        }

        [data-status="online"]  { --dot: var(--st-online);     --ring: var(--st-online); }
        [data-status="idle"]    { --dot: var(--st-idle);       --ring: var(--st-idle); }
        [data-status="focused"] { --dot: var(--st-focused);    --ring: var(--st-focused); }
        [data-status="open-to-contribute"] { --dot: var(--st-contribute); --ring: var(--st-contribute); }
        [data-status="offline"] { --dot: var(--st-offline);    --ring: var(--st-offline); }

        .segmented {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: var(--space-2);
        }

        .seg-btn {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 2px;
            padding: var(--space-3);
            text-align: left;
            font: inherit;
            color: var(--dc-fg);
            background: var(--dc-raised);
            border: 1px solid var(--dc-border);
            border-radius: var(--radius-sm);
            cursor: pointer;
            transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
        }

        .seg-btn:hover {
            background: var(--dc-hover);
            transform: translateY(-1px);
        }

        .seg-btn[aria-pressed="true"] {
            border-color: var(--dc-focus);
            background: color-mix(in srgb, var(--dc-focus) 14%, var(--dc-raised));
        }

        .seg-title { font-weight: 600; }
        .seg-desc { color: var(--dc-muted); font-size: 0.85em; }

        /* ---------- Stats ---------- */
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: var(--space-4);
        }

        .stat-value {
            display: block;
            margin-top: var(--space-1);
            font-size: 1.8em;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
        }

        /* ---------- Buttons ---------- */
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: var(--space-2);
            padding: 9px 18px;
            font: inherit;
            font-weight: 600;
            border: 1px solid transparent;
            border-radius: var(--radius-sm);
            cursor: pointer;
            transition: background-color 0.15s ease, transform 0.15s ease, filter 0.15s ease;
        }

        .btn-primary {
            color: #fff;
            background: var(--dc-brand-gradient);
        }

        .btn-primary:hover {
            filter: brightness(1.1);
            transform: translateY(-1px);
        }

        .btn-secondary {
            color: var(--dc-fg);
            background: var(--dc-raised);
            border-color: var(--dc-border);
        }

        .btn-secondary:hover { background: var(--dc-hover); }

        .btn svg { width: 18px; height: 18px; fill: currentColor; }

        .actions { display: flex; justify-content: flex-end; }

        /* ---------- Welcome (logged out) ---------- */
        .welcome {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: var(--space-4);
            padding: var(--space-6);
            background:
                radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--dc-brand-b) 22%, transparent), transparent 55%),
                radial-gradient(circle at 0% 100%, color-mix(in srgb, var(--dc-brand-a) 16%, transparent), transparent 55%),
                var(--dc-surface);
        }

        .welcome h2 { margin: 0; font-size: 1.5em; letter-spacing: -0.01em; }
        .welcome p { margin: 0; color: var(--dc-muted); max-width: 46ch; }

        /* ---------- Aside ---------- */
        .aside {
            grid-area: aside;
            display: flex;
            flex-direction: column;
            gap: var(--space-4);
            padding: var(--space-6) var(--space-5);
            background: var(--dc-rail);
            border-left: 1px solid var(--dc-border);
            min-width: 0;
        }

        .panel-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: var(--space-3);
        }

        .badge {
            min-width: 22px;
            padding: 1px 8px;
            text-align: center;
            font-size: 0.8em;
            font-weight: 600;
            color: var(--dc-muted);
            background: var(--dc-raised);
            border-radius: 999px;
        }

        .panel {
            padding: var(--space-4);
            background: var(--dc-surface);
            border: 1px solid var(--dc-border);
            border-radius: var(--radius);
        }

        .search-form {
            display: flex;
            gap: var(--space-2);
        }

        .search-input {
            flex: 1;
            min-width: 0;
            padding: 8px 10px;
            color: var(--dc-fg);
            font: inherit;
            background: var(--dc-raised);
            border: 1px solid var(--dc-border);
            border-radius: var(--radius-sm);
        }

        .search-input:focus-visible {
            outline: 2px solid var(--dc-focus);
            outline-offset: 2px;
        }

        .search-form .btn {
            padding: 8px 12px;
        }

        .search-form .btn:disabled {
            opacity: 0.6;
            cursor: wait;
        }

        .search-status {
            margin: var(--space-2) 0 0;
            color: var(--dc-muted);
        }

        .search-results {
            display: grid;
            gap: var(--space-2);
            margin-top: var(--space-3);
        }

        .search-result {
            display: flex;
            align-items: center;
            gap: var(--space-3);
            padding: var(--space-3);
            border: 1px solid var(--dc-border);
            border-radius: var(--radius-sm);
        }

        .search-avatar {
            width: 40px;
            height: 40px;
            flex: 0 0 auto;
            border-radius: 50%;
            background: var(--dc-raised);
        }

        .search-user-details {
            min-width: 0;
            flex: 1;
        }

        .search-user-details strong,
        .search-user-details span {
            display: block;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .search-user-details span {
            color: var(--dc-muted);
        }

        .search-profile-link {
            color: var(--dc-focus);
            white-space: nowrap;
        }

        .friend-list,
        .friend-request-list {
            display: grid;
            gap: var(--space-2);
            max-height: 320px;
            overflow-y: auto;
        }

        .friend-row,
        .friend-request-row {
            display: flex;
            align-items: center;
            gap: var(--space-3);
            min-width: 0;
            padding: var(--space-2) 0;
            border-bottom: 1px solid var(--dc-border);
        }

        .friend-avatar {
            width: 34px;
            height: 34px;
            flex: 0 0 auto;
            border-radius: 50%;
            background: var(--dc-raised);
        }

        .friend-details {
            flex: 1;
            min-width: 0;
        }

        .friend-name,
        .friend-presence {
            display: block;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .friend-name { font-weight: 600; }
        .friend-presence { color: var(--dc-muted); font-size: 0.88em; }

        .presence-dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            margin-right: 5px;
            border-radius: 50%;
            background: var(--dot, var(--st-offline));
        }

        .friend-request-row .btn {
            flex: 0 0 auto;
            padding: 6px 10px;
            font-size: 0.88em;
        }

        .friend-request-row .btn:disabled {
            opacity: 0.65;
            cursor: wait;
        }

        .empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-5) var(--space-3);
            text-align: center;
            color: var(--dc-muted);
            border: 1px dashed var(--dc-border);
            border-radius: var(--radius-sm);
        }

        .empty svg {
            width: 28px;
            height: 28px;
            fill: none;
            stroke: currentColor;
            stroke-width: 1.5;
            stroke-linecap: round;
            stroke-linejoin: round;
            opacity: 0.7;
        }

        .empty strong { color: var(--dc-fg); font-weight: 600; }

        /* ---------- Focus ---------- */
        .btn:focus-visible,
        .nav-btn:focus-visible,
        .seg-btn:focus-visible {
            outline: 2px solid var(--dc-focus);
            outline-offset: 2px;
        }

        /* ---------- Responsive ---------- */
        @media (max-width: 960px) {
            .app {
                grid-template-columns: 64px minmax(0, 1fr);
                grid-template-areas:
                    "rail main"
                    "rail aside";
                grid-template-rows: auto 1fr;
            }

            .aside {
                border-left: 0;
                border-top: 1px solid var(--dc-border);
                padding: var(--space-5) var(--space-6);
            }
        }

        @media (max-width: 600px) {
            .app {
                grid-template-columns: minmax(0, 1fr);
                grid-template-areas: "rail" "main" "aside";
                grid-template-rows: auto auto 1fr;
            }

            .rail {
                flex-direction: row;
                padding: var(--space-2) var(--space-4);
                border-right: 0;
                border-bottom: 1px solid var(--dc-border);
            }

            .brand-mark { margin: 0 var(--space-2) 0 0; width: 34px; height: 34px; }
            .rail-nav { flex-direction: row; }
            .nav-btn.active::before { display: none; }

            .main, .aside { padding: var(--space-4); }

            .hero-body { flex-direction: column; align-items: flex-start; gap: var(--space-3); }
        }

        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after { transition-duration: 0.01ms !important; }
        }
    </style>
</head>
<body>
    <div class="app">

        <!-- ================= NAVIGATION RAIL ================= -->
        <nav class="rail" aria-label="Discode navigation">
            <div class="brand-mark" aria-label="Discode">D</div>
            <div class="rail-nav">
                <button class="nav-btn active" type="button" title="Home" aria-label="Home" aria-current="page">
                    <svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>
                </button>
                <button class="nav-btn" type="button" title="Friends (coming soon)" aria-label="Friends" disabled>
                    <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 010 6.8"/><path d="M18 14.3c2 .7 3.5 2.6 3.5 5.7"/></svg>
                </button>
                <button class="nav-btn" type="button" title="Activity (coming soon)" aria-label="Activity" disabled>
                    <svg viewBox="0 0 24 24"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>
                </button>
            </div>
        </nav>

        <!-- ================= MAIN CONTENT ================= -->
        <main class="main">

            <!-- LOGGED OUT -->
            <div id="view-logged-out" class="view">
                <div class="page-header">
                    <h1>Welcome to Discode</h1>
                    <p>Know when your friends are coding.</p>
                </div>

                <section class="card welcome">
                    <span class="eyebrow">Get started</span>
                    <h2>Share your presence while you code</h2>
                    <p>Sign in with GitHub to show your status, see who is around, and find people open to contribute.</p>
                    <button class="btn btn-primary" id="loginBtn" type="button" onclick="login()">
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                            <path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
                        </svg>
                        Sign in with GitHub
                    </button>
                </section>

                <section class="card">
                    <div class="presence-head" style="margin-bottom:0">
                        <span class="eyebrow">Status</span>
                        <span class="status-pill" id="statusPill" data-status="offline">
                            <span class="dot" id="statusDot"></span>
                            <span id="statusText">Offline</span>
                        </span>
                    </div>
                </section>
            </div>

            <!-- LOGGED IN -->
            <div id="view-logged-in" class="view hidden">
                <div class="page-header">
                    <h1>Dashboard</h1>
                    <p>Your profile and presence at a glance.</p>
                </div>

                <section class="card hero" id="heroCard" data-status="online">
                    <div class="hero-banner"></div>
                    <div class="hero-body">
                        <div class="avatar-wrap">
                            <img class="avatar" id="userAvatar" alt="GitHub avatar" hidden />
                            <span class="avatar-badge" aria-hidden="true"></span>
                        </div>
                        <div class="hero-text">
                            <h2 class="hero-name" id="userName">Loading profile...</h2>
                            <div class="hero-meta">
                                <span id="userLogin">—</span><span class="sep">·</span>GitHub ID <span id="userId">—</span>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="card">
                    <div class="presence-head">
                        <div>
                            <span class="eyebrow">Presence</span>
                            <h3 class="card-title">Your status</h3>
                        </div>
                        <span class="status-pill" id="statusPillLoggedIn" data-status="online">
                            <span class="dot" id="statusDotLoggedIn"></span>
                            <span id="statusTextLoggedIn" aria-live="polite">Online</span>
                        </span>
                    </div>

                    <div class="segmented" id="manualStatus" role="group" aria-label="Manual presence status">
                        <button class="seg-btn" type="button" data-status="online" aria-pressed="true" onclick="setManualStatus('online')">
                            <span class="seg-title">Automatic</span>
                            <span class="seg-desc">Online or idle, detected for you</span>
                        </button>
                        <button class="seg-btn" type="button" data-status="focused" aria-pressed="false" onclick="setManualStatus('focused')">
                            <span class="seg-title">Focused</span>
                            <span class="seg-desc">Heads down, please don't disturb</span>
                        </button>
                        <button class="seg-btn" type="button" data-status="open-to-contribute" aria-pressed="false" onclick="setManualStatus('open-to-contribute')">
                            <span class="seg-title">Open to Contribute</span>
                            <span class="seg-desc">Happy to collaborate</span>
                        </button>
                    </div>
                </section>

                <div class="stats">
                    <section class="card">
                        <span class="eyebrow">Friends online</span>
                        <span class="stat-value" id="friendsOnlineCount">0</span>
                    </section>
                    <section class="card">
                        <span class="eyebrow">Friends offline</span>
                        <span class="stat-value" id="friendsOfflineCount">0</span>
                    </section>
                </div>

                <div class="actions">
                    <button class="btn btn-secondary" type="button" onclick="logout()">Sign Out</button>
                </div>
            </div>

        </main>

        <!-- ================= SOCIAL PANEL ================= -->
        <aside class="aside" aria-label="Friends and activity">
            <section class="panel hidden" id="github-search-panel" aria-label="GitHub user search">
                <div class="panel-head">
                    <span class="eyebrow">Find GitHub users</span>
                </div>
                <form class="search-form" id="githubSearchForm">
                    <input
                        class="search-input"
                        id="githubUsername"
                        type="search"
                        aria-label="GitHub username"
                        placeholder="Search usernames"
                        maxlength="39"
                        autocomplete="off"
                        required
                    />
                    <button class="btn btn-primary" id="githubSearchButton" type="submit">Search</button>
                </form>
                <p class="search-status" id="githubSearchStatus" role="status" aria-live="polite"></p>
                <div class="search-results" id="githubSearchResult" hidden></div>
            </section>

            <section class="panel">
                <div class="panel-head">
                    <span class="eyebrow">Friends</span>
                    <span class="badge" id="friendCount">0</span>
                </div>
                <p class="search-status" id="friendListStatus">Sign in to see your friends.</p>
                <div class="friend-list" id="friendList"></div>
                <div class="empty hidden" id="friendListEmpty">
                    <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 010 6.8"/><path d="M18 14.3c2 .7 3.5 2.6 3.5 5.7"/></svg>
                    <strong>No accepted friends yet</strong>
                    <span>Search for Discode users to send a friend request.</span>
                </div>
            </section>

            <section class="panel hidden" id="friend-requests-panel">
                <div class="panel-head">
                    <span class="eyebrow">Friend requests</span>
                    <span class="badge" id="friendRequestCount">0</span>
                </div>
                <p class="search-status" id="friendRequestStatus"></p>
                <div class="friend-request-list" id="friendRequestList"></div>
            </section>

            <section class="panel">
                <div class="panel-head">
                    <span class="eyebrow">Activity</span>
                </div>
                <div class="empty">
                    <svg viewBox="0 0 24 24"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>
                    <strong>Nothing happening</strong>
                    <span>Social activity will appear here.</span>
                </div>
            </section>
        </aside>

    </div>

    <script>
        // Check if running inside VS Code, otherwise fail gracefully so it still works in a standard browser
        const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
        const friendRequestButtons = new Map();
        const friendAcceptButtons = new Map();

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

        let searchDebounceTimer;
        let latestSearchRequestId = 0;

        function searchGitHubUsers(username, requestId) {
            if (requestId !== latestSearchRequestId) {
                return;
            }
            if (!vscode) {
                document.getElementById('githubSearchStatus').textContent =
                    'Search is available in the VS Code dashboard.';
                return;
            }

            document.getElementById('githubSearchButton').disabled = true;
            document.getElementById('githubSearchStatus').textContent = 'Searching GitHub...';
            vscode.postMessage({ type: 'github.searchUsers', username, requestId });
        }

        const githubUsernameInput = document.getElementById('githubUsername');
        githubUsernameInput.addEventListener('input', () => {
            const username = githubUsernameInput.value.trim();
            const requestId = ++latestSearchRequestId;
            clearTimeout(searchDebounceTimer);
            document.getElementById('githubSearchButton').disabled = false;
            document.getElementById('githubSearchResult').replaceChildren();
            document.getElementById('githubSearchResult').hidden = true;
            friendRequestButtons.clear();

            if (!username) {
                document.getElementById('githubSearchStatus').textContent = '';
                return;
            }

            document.getElementById('githubSearchStatus').textContent = 'Waiting to search...';
            searchDebounceTimer = setTimeout(
                () => searchGitHubUsers(username, requestId),
                300
            );
        });

        document.getElementById('githubSearchForm').addEventListener('submit', event => {
            event.preventDefault();
            clearTimeout(searchDebounceTimer);
            const username = githubUsernameInput.value.trim();
            const requestId = ++latestSearchRequestId;
            const result = document.getElementById('githubSearchResult');
            result.replaceChildren();
            result.hidden = true;
            friendRequestButtons.clear();

            if (!username) {
                document.getElementById('githubSearchStatus').textContent =
                    'Enter a GitHub username to search.';
                return;
            }

            searchGitHubUsers(username, requestId);
        });

        function setViewState(isLoggedIn) {
            document.getElementById('view-logged-out').classList.toggle('hidden', isLoggedIn);
            document.getElementById('view-logged-in').classList.toggle('hidden', !isLoggedIn);
            document.getElementById('github-search-panel').classList.toggle('hidden', !isLoggedIn);
        }

        function finishGitHubSearch() {
            document.getElementById('githubSearchButton').disabled = false;
        }

        function showGitHubUsers(users) {
            const result = document.getElementById('githubSearchResult');
            const profileCards = users.map(user => {
                const profile = document.createElement('div');
                profile.className = 'search-result';

                const avatar = document.createElement('img');
                avatar.className = 'search-avatar';
                avatar.src = user.avatar_url;
                avatar.alt = '';

                const details = document.createElement('div');
                details.className = 'search-user-details';
                const username = document.createElement('strong');
                username.textContent = '@' + user.login;
                const membership = document.createElement('span');
                membership.textContent = user.isRegistered
                    ? 'On Discode'
                    : 'Not on Discode';
                details.append(username, membership);

                if (user.isRegistered) {
                    const button = document.createElement('button');
                    button.className = 'btn btn-secondary';
                    button.type = 'button';
                    if (String(user.id) === document.getElementById('userId').textContent) {
                        button.textContent = 'You';
                        button.disabled = true;
                    } else {
                        button.textContent = 'Send friend request';
                        button.onclick = () => {
                            button.disabled = true;
                            button.textContent = 'Sending…';
                            document.getElementById('githubSearchStatus').textContent =
                                'Sending friend request...';
                            vscode?.postMessage({ type: 'friend.request', githubId: user.id });
                        };
                        friendRequestButtons.set(String(user.id), button);
                    }
                    profile.append(avatar, details, button);
                } else {
                    const link = document.createElement('a');
                    link.className = 'search-profile-link';
                    link.href = 'https://github.com/' + encodeURIComponent(user.login);
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.textContent = 'View profile';
                    profile.append(avatar, details, link);
                }
                return profile;
            });

            result.replaceChildren(...profileCards);
            result.hidden = false;
        }

        function labelFor(status) {
            return status === 'open-to-contribute'
                ? 'Open to Contribute'
                : status.charAt(0).toUpperCase() + status.slice(1);
        }

        function createFriendRow(friend) {
            const row = document.createElement('div');
            row.className = 'friend-row';

            try {
                const avatarUrl = new URL(friend.avatarUrl);
                if (
                    avatarUrl.protocol === 'https:'
                    && avatarUrl.hostname === 'avatars.githubusercontent.com'
                ) {
                    const avatar = document.createElement('img');
                    avatar.className = 'friend-avatar';
                    avatar.src = avatarUrl.toString();
                    avatar.alt = '';
                    row.appendChild(avatar);
                }
            } catch {
                // Skip malformed avatar URLs and keep the friend visible.
            }

            const details = document.createElement('div');
            details.className = 'friend-details';
            const name = document.createElement('span');
            name.className = 'friend-name';
            name.textContent = '@' + friend.username;
            const presence = document.createElement('span');
            presence.className = 'friend-presence';
            const dot = document.createElement('span');
            dot.className = 'presence-dot';
            dot.dataset.status = friend.status;
            dot.setAttribute('aria-hidden', 'true');
            presence.append(dot, document.createTextNode(labelFor(friend.status)));
            details.append(name, presence);
            row.appendChild(details);
            return row;
        }

        function createFriendRequestRow(request) {
            const row = document.createElement('div');
            row.className = 'friend-request-row';
            const name = document.createElement('span');
            name.className = 'friend-name';
            name.textContent = '@' + request.username;
            const button = document.createElement('button');
            button.className = 'btn btn-primary';
            button.type = 'button';
            button.textContent = 'Accept';
            button.onclick = () => {
                button.disabled = true;
                button.textContent = 'Accepting…';
                vscode?.postMessage({ type: 'friend.accept', requestId: request.id });
            };
            friendAcceptButtons.set(request.id, button);
            row.append(name, button);
            return row;
        }

        function renderSocialState(friends, requests) {
            const friendList = document.getElementById('friendList');
            const requestList = document.getElementById('friendRequestList');
            friendList.replaceChildren(...friends.map(createFriendRow));
            requestList.replaceChildren(...requests.map(createFriendRequestRow));

            const onlineCount = friends.filter(friend => friend.status !== 'offline').length;
            document.getElementById('friendsOnlineCount').textContent = String(onlineCount);
            document.getElementById('friendsOfflineCount').textContent =
                String(friends.length - onlineCount);
            document.getElementById('friendCount').textContent = String(friends.length);
            document.getElementById('friendRequestCount').textContent = String(requests.length);
            document.getElementById('friendListStatus').textContent = '';
            document.getElementById('friendListEmpty').classList.toggle('hidden', friends.length > 0);
            document.getElementById('friend-requests-panel').classList.toggle(
                'hidden',
                requests.length === 0
            );
            document.getElementById('friendRequestStatus').textContent = requests.length
                ? 'Review incoming requests.'
                : '';
            friendAcceptButtons.clear();
        }

        function resetSocialState() {
            renderSocialState([], []);
            document.getElementById('friendListStatus').textContent = 'Sign in to see your friends.';
            document.getElementById('friendListEmpty').classList.add('hidden');
            document.getElementById('friend-requests-panel').classList.add('hidden');
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'auth.profile') {
                document.getElementById('userName').textContent =
                    message.user.name || message.user.username;
                document.getElementById('userLogin').textContent = message.user.username;
                document.getElementById('userId').textContent = message.user.githubId;
                const avatar = document.getElementById('userAvatar');
                avatar.src = message.user.avatarUrl;
                avatar.hidden = false;
            } else if (message.type === 'auth.state') {
                latestSearchRequestId++;
                clearTimeout(searchDebounceTimer);
                document.getElementById('githubSearchStatus').textContent = '';
                document.getElementById('githubSearchResult').hidden = true;
                document.getElementById('githubSearchResult').replaceChildren();
                finishGitHubSearch();
                setViewState(message.authenticated);
                if (message.authenticated && message.accountLabel) {
                    document.getElementById('userLogin').textContent = message.accountLabel;
                } else if (!message.authenticated) {
                    document.getElementById('userName').textContent = 'Not signed in';
                    document.getElementById('userLogin').textContent = '—';
                    document.getElementById('userId').textContent = '—';
                    const avatar = document.getElementById('userAvatar');
                    avatar.removeAttribute('src');
                    avatar.hidden = true;
                    resetSocialState();
                }
            } else if (message.type === 'presence.state') {
                const status = message.status;
                document.getElementById('statusTextLoggedIn').textContent = labelFor(status);
                document.getElementById('statusPillLoggedIn').dataset.status = status;
                document.getElementById('heroCard').dataset.status = status;
                document.querySelectorAll('#manualStatus .seg-btn').forEach(btn => {
                    btn.setAttribute(
                        'aria-pressed',
                        String(btn.dataset.status === message.manualStatus)
                    );
                });
            } else if (message.type === 'github.search.result') {
                if (message.requestId !== latestSearchRequestId) {
                    return;
                }
                finishGitHubSearch();
                if (!message.users.length) {
                    document.getElementById('githubSearchStatus').textContent =
                        'No GitHub users found matching @'
                        + document.getElementById('githubUsername').value.trim()
                        + '.';
                    return;
                }

                document.getElementById('githubSearchStatus').textContent = message.users.length === 5
                    ? 'Showing up to 5 matching GitHub users.'
                    : 'Found ' + message.users.length + ' matching GitHub user'
                        + (message.users.length === 1 ? '.' : 's.');
                showGitHubUsers(message.users);
            } else if (message.type === 'github.search.error') {
                if (message.requestId !== latestSearchRequestId) {
                    return;
                }
                finishGitHubSearch();
                document.getElementById('githubSearchStatus').textContent = message.message;
            } else if (message.type === 'social.state') {
                renderSocialState(message.friends, message.requests);
            } else if (message.type === 'social.error') {
                document.getElementById('friendListStatus').textContent = message.message;
            } else if (message.type === 'friend.requestResult') {
                const button = friendRequestButtons.get(String(message.githubId));
                if (!button) {
                    return;
                }
                if (message.status === 'sent') {
                    button.textContent = 'Request sent';
                    button.className = 'btn btn-secondary';
                    document.getElementById('githubSearchStatus').textContent =
                        'Friend request sent.';
                } else {
                    button.disabled = false;
                    button.textContent = 'Send friend request';
                    document.getElementById('githubSearchStatus').textContent = message.message;
                }
            } else if (message.type === 'friend.acceptResult') {
                const button = friendAcceptButtons.get(message.requestId);
                if (!button) {
                    return;
                }
                if (message.status === 'accepted') {
                    button.textContent = 'Accepted';
                    document.getElementById('friendRequestStatus').textContent =
                        'Friend request accepted.';
                } else {
                    button.disabled = false;
                    button.textContent = 'Accept';
                    document.getElementById('friendRequestStatus').textContent = message.message;
                }
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