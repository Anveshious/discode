export const PRESENCE_STATUSES = [
    "online",
    "idle",
    "focused",
    "open-to-contribute",
] as const;

export type PresenceStatus = typeof PRESENCE_STATUSES[number];

export const PRESENCE_STATUS_LABELS: Record<PresenceStatus, string> = {
    online: "Online",
    idle: "Idle",
    focused: "Focused",
    "open-to-contribute": "Open to contribute",
};

export const PRESENCE_STATUS_DESCRIPTIONS: Record<PresenceStatus, string> = {
    online: "Available and coding.",
    idle: "Around, but may be away from your editor.",
    focused: "Deep in a task. Please avoid interruptions.",
    "open-to-contribute": "Available to collaborate or help with an issue.",
};

export function isPresenceStatus(value: unknown): value is PresenceStatus {
    return typeof value === "string"
        && PRESENCE_STATUSES.some((status) => status === value);
}
