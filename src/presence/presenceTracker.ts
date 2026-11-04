import * as path from "path";
import * as vscode from "vscode";
import { PresenceStatus } from "../models/PresenceStatus";

/** How long with no activity before we call the user "idle". */
const DEFAULT_IDLE_THRESHOLD_MS = 5 * 60 * 1000;

export class PresenceTracker implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private readonly onDidChangeEmitter = new vscode.EventEmitter<PresenceStatus>();
    public readonly onDidChangePresence = this.onDidChangeEmitter.event;

    private current: PresenceStatus;
    private idleTimer?: NodeJS.Timeout;
    private readonly idleThresholdMs: number;

    constructor(idleThresholdMs: number = DEFAULT_IDLE_THRESHOLD_MS) {
        this.idleThresholdMs = idleThresholdMs;
        this.current = {
            status: "offline",
            updatedAt: Date.now(),
        };

        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => this.handleEditorChange(editor)),
            vscode.window.onDidChangeWindowState((state) => this.handleWindowStateChange(state)),
            vscode.window.onDidChangeTextEditorSelection(() => this.markActive()),
            vscode.workspace.onDidChangeTextDocument(() => this.markActive())
        );

        // Seed from whatever is active right now.
        this.handleEditorChange(vscode.window.activeTextEditor);
    }

    public getCurrentPresence(): PresenceStatus {
        return this.current;
    }

    private handleWindowStateChange(state: vscode.WindowState): void {
        if (state.focused) {
            this.markActive();
        } else {
            // Losing focus doesn't necessarily mean idle (could be a quick
            // alt-tab to check docs), but we don't want to claim "active"
            // while the editor isn't in front of the user either. Start the
            // idle countdown immediately rather than waiting for the next
            // keystroke that will never come while unfocused.
            this.scheduleIdle();
        }
    }

    private handleEditorChange(editor: vscode.TextEditor | undefined): void {
        if (!editor || editor.document.uri.scheme !== "file") {
            // Output panels, debug consoles, untitled scratch buffers, etc.
            // are not meaningful presence signals - don't publish their names.
            this.update({
                status: this.current.status === "offline" ? "offline" : "active",
                fileName: undefined,
                languageId: undefined,
                workspaceName: this.currentWorkspaceName(),
                gitBranch: this.current.gitBranch,
            });
            return;
        }

        this.update({
            status: "active",
            fileName: path.basename(editor.document.uri.fsPath),
            languageId: editor.document.languageId,
            workspaceName: this.currentWorkspaceName(editor.document.uri),
            gitBranch: this.readGitBranch(editor.document.uri),
        });
        this.scheduleIdle();
    }

    private markActive(): void {
        if (this.current.status !== "active") {
            this.update({ ...this.current, status: "active" });
        }
        this.scheduleIdle();
    }

    private scheduleIdle(): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }
        this.idleTimer = setTimeout(() => {
            this.update({ ...this.current, status: "idle" });
        }, this.idleThresholdMs);
    }

    private currentWorkspaceName(uri?: vscode.Uri): string | undefined {
        const folder = uri
            ? vscode.workspace.getWorkspaceFolder(uri)
            : vscode.workspace.workspaceFolders?.[0];
        return folder?.name;
    }

    private readGitBranch(_uri: vscode.Uri): string | undefined {
        // Best-effort only: the built-in git extension's API is async and
        // activation isn't guaranteed at this point. Wiring real branch
        // lookup is tracked as a follow-up (see ROADMAP) rather than done
        // here, so we fail soft instead of guessing.
        return this.current.gitBranch;
    }

    private update(next: Omit<PresenceStatus, "updatedAt">): void {
        this.current = { ...next, updatedAt: Date.now() };
        this.onDidChangeEmitter.fire(this.current);
    }

    public dispose(): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }
        this.disposables.forEach((d) => d.dispose());
        this.onDidChangeEmitter.dispose();
    }
}
