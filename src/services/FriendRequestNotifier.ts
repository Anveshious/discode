import * as vscode from "vscode";
import type { DiscodeFriendRequest } from "./DiscodeService";

export class FriendRequestNotifier {
    private knownRequestIds = new Set<string>();
    private initialized = false;

    constructor(
        private readonly showMessage: (
            message: string,
            ...items: string[]
        ) => Thenable<string | undefined> = vscode.window.showInformationMessage,
        private readonly openDashboard: () => void = () => {
            void vscode.commands.executeCommand("discode.openDashboard");
        }
    ) {}

    public processRequests(requests: DiscodeFriendRequest[]): void {
        if (!this.initialized) {
            this.knownRequestIds = new Set(requests.map((r) => r.id));
            this.initialized = true;
            return;
        }

        const currentIds = new Set<string>();
        for (const request of requests) {
            currentIds.add(request.id);
            if (!this.knownRequestIds.has(request.id)) {
                this.knownRequestIds.add(request.id);
                void this.showMessage(
                    `@${request.username} sent you a friend request on Discode!`,
                    "Open Dashboard"
                ).then((selection) => {
                    if (selection === "Open Dashboard") {
                        this.openDashboard();
                    }
                });
            }
        }
        this.knownRequestIds = currentIds;
    }

    public reset(): void {
        this.knownRequestIds.clear();
        this.initialized = false;
    }
}
