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
    private disposed = false;

    constructor(idleThresholdMs: number = DEFAULT_IDLE_THRESHOLD_MS) {
        this.idleThresholdMs = idleThresholdMs;
        this.current = {
            status: "offline",
            isWindowFocused: vscode.window.state.focused,
            updatedAt: Date.now(),
        };

        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => this.handleEditorChange(editor)),
            vscode.window.onDidChangeWindowState((state) => this.handleWindowStateChange(state)),
            vscode.window.onDidChangeTextEditorSelection(() => this.markActive()),
            vscode.workspace.onDidChangeTextDocument((event) => {
                if (event.document === vscode.window.activeTextEditor?.document) {
                    this.markActive();
                }
            })
        );

        // Seed from whatever is active right now.
        this.handleEditorChange(vscode.window.activeTextEditor);
    }

    public getCurrentPresence(): PresenceStatus {
        return this.current;
    }

    private handleWindowStateChange(state: vscode.WindowState): void {
        if (this.current.isWindowFocused !== state.focused) {
            this.update({ ...this.current, isWindowFocused: state.focused });
        }

        if (state.focused) {
            this.markActive();
        } else {
            this.clearIdleTimer();
            this.update({
                ...this.current,
                status: this.hasActiveEditor() ? "idle" : "offline",
            });
        }
    }

    private handleEditorChange(editor: vscode.TextEditor | undefined): void {
        if (!editor) {
            this.clearIdleTimer();
            this.update({
                status: "offline",
                isWindowFocused: this.current.isWindowFocused,
                fileName: undefined,
                languageId: undefined,
                workspaceName: this.currentWorkspaceName(),
                gitBranch: this.current.gitBranch,
            });
            return;
        }

        if (editor.document.uri.scheme !== "file") {
            this.update({
                status: this.current.isWindowFocused ? "active" : "idle",
                isWindowFocused: this.current.isWindowFocused,
                fileName: undefined,
                languageId: undefined,
                workspaceName: undefined,
                gitBranch: undefined,
            });
            this.scheduleIdle();
            return;
        }

        this.update({
            status: this.current.isWindowFocused ? "active" : "idle",
            isWindowFocused: this.current.isWindowFocused,
            fileName: path.basename(editor.document.uri.fsPath),
            languageId: editor.document.languageId,
            workspaceName: this.currentWorkspaceName(editor.document.uri),
            gitBranch: this.readGitBranch(editor.document.uri),
        });
        if (this.current.isWindowFocused) {
            this.scheduleIdle();
        }
    }

    private markActive(): void {
        if (!this.current.isWindowFocused) {
            return;
        }

        if (this.current.status !== "active") {
            this.update({
                ...this.current,
                status: this.hasActiveEditor() ? "active" : "offline",
            });
        }
        if (this.current.status === "active") {
            this.scheduleIdle();
        }
    }

    private scheduleIdle(): void {
        this.clearIdleTimer();
        if (!this.current.isWindowFocused || this.current.status !== "active") {
            return;
        }
        this.idleTimer = setTimeout(() => {
            this.update({ ...this.current, status: "idle" });
        }, this.idleThresholdMs);
    }

    private clearIdleTimer(): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = undefined;
        }
    }

    private hasActiveEditor(): boolean {
        return vscode.window.activeTextEditor !== undefined;
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
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.clearIdleTimer();
        if (
            this.current.status !== "offline"
            || this.current.fileName !== undefined
            || this.current.languageId !== undefined
            || this.current.workspaceName !== undefined
            || this.current.gitBranch !== undefined
        ) {
            this.update({
                ...this.current,
                status: "offline",
                fileName: undefined,
                languageId: undefined,
                workspaceName: undefined,
                gitBranch: undefined,
            });
        }
        this.disposables.forEach((d) => d.dispose());
        this.onDidChangeEmitter.dispose();
    }
}
