export const PRESENCE_STATUSES = [
    "online",
    "idle",
    "focused",
    "open-to-contribute",
] as const;

export type PresenceStatusValue = typeof PRESENCE_STATUSES[number];

export type PresenceActivity = "active" | "idle" | "offline";

export interface PresenceStatus {
    status: PresenceActivity;

    /** Basename only, e.g. "ExtensionController.ts" - never a full path. */
    fileName?: string;

    /** VS Code language id, e.g. "typescript", "markdown". */
    languageId?: string;

    /** Workspace folder name, e.g. "discode" - never a full path. */
    workspaceName?: string;

    /** Current git branch, if discoverable via the built-in git extension. */
    gitBranch?: string;

    /** Epoch ms when this state was last computed. */
    updatedAt: number;
}

export const PRESENCE_STATUS_LABELS: Record<PresenceStatusValue, string> = {
    online: "Online",
    idle: "Idle",
    focused: "Focused",
    "open-to-contribute": "Open to contribute",
};

export const PRESENCE_STATUS_DESCRIPTIONS: Record<PresenceStatusValue, string> = {
    online: "Available and coding.",
    idle: "Around, but may be away from your editor.",
    focused: "Deep in a task. Please avoid interruptions.",
    "open-to-contribute": "Available to collaborate or help with an issue.",
};

export function isPresenceStatus(value: unknown): value is PresenceStatusValue {
    return typeof value === "string"
        && PRESENCE_STATUSES.some((status) => status === value);
}
