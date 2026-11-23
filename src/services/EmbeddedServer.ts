import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import { ChildProcess, spawn } from "node:child_process";

export class EmbeddedServer implements vscode.Disposable {
    private process?: ChildProcess;
    private port?: number;
    private isStarting = false;

    constructor(private readonly context: vscode.ExtensionContext) {}

    public getUrl(): string | undefined {
        return this.port ? `http://127.0.0.1:${this.port}` : undefined;
    }

    public async start(): Promise<number> {
        if (this.port) {
            return this.port;
        }
        if (this.isStarting) {
            throw new Error("Embedded backend server is already starting.");
        }
        this.isStarting = true;

        try {
            const storagePath = this.context.globalStorageUri.fsPath;
            if (!fs.existsSync(storagePath)) {
                fs.mkdirSync(storagePath, { recursive: true });
            }
            const dbPath = path.join(storagePath, "discode.db");

            const serverScript = path.join(
                this.context.extensionPath,
                "backend",
                "src",
                "sqlite-server.js"
            );
            const backendCwd = path.join(this.context.extensionPath, "backend");

            const nodeBinary = process.env.NODE_BINARY || "node";

            const child = spawn(
                nodeBinary,
                [serverScript, "--db-path", dbPath, "--port", "0"],
                {
                    cwd: backendCwd,
                    stdio: ["pipe", "pipe", "pipe"],
                    env: {
                        ...process.env,
                    },
                }
            );

            this.process = child;

            const port = await new Promise<number>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    cleanup();
                    reject(new Error("Embedded backend startup timed out after 10 seconds."));
                }, 10_000);

                let stdoutBuffer = "";
                let stderrBuffer = "";

                const onStdout = (data: Buffer) => {
                    stdoutBuffer += data.toString();
                    const lines = stdoutBuffer.split(/\r?\n/);
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
                            try {
                                const parsed = JSON.parse(trimmed);
                                if (typeof parsed.port === "number") {
                                    cleanup();
                                    resolve(parsed.port);
                                    return;
                                }
                            } catch {
                                // Ignore non-JSON lines
                            }
                        }
                    }
                };

                const onStderr = (data: Buffer) => {
                    stderrBuffer += data.toString();
                };

                const onError = (err: Error) => {
                    cleanup();
                    reject(new Error(`Failed to start embedded backend: ${err.message}`));
                };

                const onClose = (code: number | null) => {
                    cleanup();
                    reject(new Error(`Embedded backend exited prematurely with code ${code}. Stderr: ${stderrBuffer}`));
                };

                const cleanup = () => {
                    clearTimeout(timeout);
                    child.stdout?.off("data", onStdout);
                    child.stderr?.off("data", onStderr);
                    child.off("error", onError);
                    child.off("close", onClose);
                };

                child.stdout?.on("data", onStdout);
                child.stderr?.on("data", onStderr);
                child.on("error", onError);
                child.on("close", onClose);
            });

            this.port = port;
            return port;
        } finally {
            this.isStarting = false;
        }
    }

    public dispose(): void {
        if (this.process && !this.process.killed) {
            try {
                this.process.kill();
            } catch {
                // ignore
            }
            this.process = undefined;
            this.port = undefined;
        }
    }
}
