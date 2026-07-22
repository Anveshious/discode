import * as vscode from "vscode";

export class OpenDashboard {
    private panel?: vscode.WebviewPanel;

    public show(): void {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            "discodeDashboard",
            "Discode Dashboard",
            vscode.ViewColumn.One,
            {
                enableScripts: true,
            }
        );

        this.panel.webview.html = this.getHtmlContent();

        this.panel.webview.onDidReceiveMessage((message) => {
            switch (message.type) {
                case "auth.login":
                    vscode.window.showInformationMessage("GitHub Login Clicked!");
                    break;
            }
        });

        this.panel.onDidDispose(() => {
            this.panel = undefined;
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
        /* CSS Styling */
        :root {
            --bg-color: #0d1117;
            --card-bg: #161b22;
            --border-color: #30363d;
            --text-main: #c9d1d9;
            --text-muted: #8b949e;
            --btn-bg: #238636;
            --btn-hover: #2ea043;
            --offline-color: #8b949e;
            --online-color: #3fb950;
        }

        body {
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background-color: var(--bg-color);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: var(--text-main);
        }

        .dashboard-card {
            background-color: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 2.5rem 2rem;
            width: 100%;
            max-width: 340px;
            text-align: center;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }

        .header h1 {
            margin: 0;
            font-size: 1.8rem;
            font-weight: 700;
            letter-spacing: 0.5px;
            color: #ffffff;
        }

        .header p {
            color: var(--text-muted);
            font-size: 0.95rem;
            margin-top: 10px;
            margin-bottom: 2.5rem;
        }

        .status-container {
            background-color: rgba(13, 17, 23, 0.5);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 1rem 1.2rem;
            margin-bottom: 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .status-label {
            color: var(--text-muted);
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 600;
        }

        .status-indicator {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 500;
            font-size: 1rem;
        }

        .dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            display: inline-block;
            background-color: var(--offline-color);
            transition: all 0.3s ease;
        }

        .dot.online {
            background-color: var(--online-color);
            box-shadow: 0 0 10px rgba(63, 185, 80, 0.4);
        }

        .github-btn {
            background-color: var(--btn-bg);
            color: #ffffff;
            border: 1px solid rgba(240, 246, 252, 0.1);
            padding: 0.8rem 1.5rem;
            border-radius: 6px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
            transition: background-color 0.2s, border-color 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }

        .github-btn:hover {
            background-color: var(--btn-hover);
        }

        .github-icon {
            width: 20px;
            height: 20px;
            fill: currentColor;
        }
    </style>
</head>
<body>
    <div class="dashboard-card">
        <div class="header">
            <h1>🚀 DISCODE</h1>
            <p>Know when your friends are coding.</p>
        </div>

        <div class="status-container">
            <span class="status-label">Status</span>
            <div class="status-indicator">
                <span class="dot" id="statusDot"></span>
                <span id="statusText">Offline</span>
            </div>
        </div>

        <button class="github-btn" id="loginBtn" onclick="login()">
            <!-- Inline GitHub SVG Icon -->
            <svg class="github-icon" viewBox="0 0 16 16" version="1.1" aria-hidden="true">
                <path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
            </svg>
            Sign in with GitHub
        </button>
    </div>

    <script>
    //     // JavaScript logic for interactivity
    //     let isOnline = false;
        const vscode = acquireVsCodeApi();

        function login() {
            vscode.postMessage({
                type: "auth.login"
            });
        }

    //     function toggleStatus() {
    //         const statusDot = document.getElementById('statusDot');
    //         const statusText = document.getElementById('statusText');
    //         const loginBtn = document.getElementById('loginBtn');

    //         isOnline = !isOnline;

    //         if (isOnline) {
    //             // Change to Online state
    //             statusDot.classList.add('online');
    //             statusText.textContent = 'Online';
    //             loginBtn.innerHTML = 'Sign Out';
    //             loginBtn.style.backgroundColor = '#21262d';
    //             loginBtn.style.color = '#c9d1d9';
    //         }
    //         else {
    //             // Revert to Offline state
    //             statusDot.classList.remove('online');
    //             statusText.textContent = 'Offline';
    //             loginBtn.style.backgroundColor = 'var(--btn-bg)';
    //             loginBtn.style.color = '#ffffff';
    //         }
    //     }
    </script>
</body>
</html>`;
    }
}