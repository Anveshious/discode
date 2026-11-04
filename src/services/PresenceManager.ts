import * as vscode from "vscode";
import {
    isPresenceStatus,
    PresenceStatus,
} from "../models/PresenceStatus";

const PRESENCE_STATUS_KEY = "discode.presenceStatus";

export class PresenceManager implements vscode.Disposable {
    private status: PresenceStatus = "online";
    private readonly statusChangeEmitter = new vscode.EventEmitter<PresenceStatus>();
    public readonly onDidChangeStatus = this.statusChangeEmitter.event;

    constructor(private readonly globalState: vscode.Memento) {}

    public async initialize(): Promise<void> {
        const storedStatus: unknown = this.globalState.get(PRESENCE_STATUS_KEY);
        if (isPresenceStatus(storedStatus)) {
            this.status = storedStatus;
        }
    }

    public async setStatus(status: PresenceStatus): Promise<void> {
        if (status === this.status) {
            return;
        }

        await this.globalState.update(PRESENCE_STATUS_KEY, status);
        this.status = status;
        this.statusChangeEmitter.fire(status);
    }

    public getStatus(): PresenceStatus {
        return this.status;
    }

    public dispose(): void {
        this.statusChangeEmitter.dispose();
    }
}
