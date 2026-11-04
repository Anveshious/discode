import * as vscode from "vscode";
import {
    isPresenceStatus,
    ManualPresenceStatus,
    PresenceActivity,
    PresenceStatusValue,
} from "../models/PresenceStatus";

const PRESENCE_STATUS_KEY = "discode.presenceStatus";

function isManualPresenceStatus(value: unknown): value is ManualPresenceStatus {
    return value === "online"
        || value === "focused"
        || value === "open-to-contribute";
}

export class PresenceManager implements vscode.Disposable {
    private manualStatus: ManualPresenceStatus = "online";
    private activity: PresenceActivity = "offline";
    private readonly statusChangeEmitter = new vscode.EventEmitter<PresenceStatusValue>();
    public readonly onDidChangeStatus = this.statusChangeEmitter.event;

    constructor(
        private readonly globalState: Pick<vscode.Memento, "get" | "update">
    ) {}

    public async initialize(): Promise<void> {
        const storedStatus: unknown = this.globalState.get(PRESENCE_STATUS_KEY);
        if (isManualPresenceStatus(storedStatus)) {
            this.manualStatus = storedStatus;
        } else if (isPresenceStatus(storedStatus)) {
            // Migrate old values without persisting automatically detected idle.
            this.manualStatus = storedStatus === "focused" || storedStatus === "open-to-contribute"
                ? storedStatus
                : "online";
            await this.globalState.update(PRESENCE_STATUS_KEY, this.manualStatus);
        }
    }

    public async setManualStatus(status: ManualPresenceStatus): Promise<void> {
        if (status === this.manualStatus) {
            return;
        }

        const previousEffectiveStatus = this.getStatus();
        await this.globalState.update(PRESENCE_STATUS_KEY, status);
        this.manualStatus = status;
        this.fireIfStatusChanged(previousEffectiveStatus);
    }

    public setActivity(activity: PresenceActivity): void {
        if (activity === this.activity) {
            return;
        }

        const previousEffectiveStatus = this.getStatus();
        this.activity = activity;
        this.fireIfStatusChanged(previousEffectiveStatus);
    }

    public getManualStatus(): ManualPresenceStatus {
        return this.manualStatus;
    }

    public getStatus(): PresenceStatusValue {
        if (this.manualStatus !== "online") {
            return this.manualStatus;
        }
        return this.activity === "active" ? "online" : "idle";
    }

    private fireIfStatusChanged(previousStatus: PresenceStatusValue): void {
        const status = this.getStatus();
        if (status !== previousStatus) {
            this.statusChangeEmitter.fire(status);
        }
    }

    public dispose(): void {
        this.statusChangeEmitter.dispose();
    }
}
