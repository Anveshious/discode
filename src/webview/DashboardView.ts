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
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            margin: 0;
            padding: 24px;
        }

        .card {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 16px;
            background: var(--vscode-sideBar-background);
            max-width: 640px;
        }

        h1 {
            margin-top: 0;
        }
    </style>
</head>
<body>
    <div class="card">
        <h1>Discode Dashboard</h1>
        <p>Your developer presence dashboard is ready.</p>
    </div>
</body>
</html>`;
    }
}