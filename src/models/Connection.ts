export type FriendRequestStatus = "none" | "sent" | "received" | "friends";
export type ConnectionKind = "followers" | "following";

export interface Connection {
    githubId: string;
    username: string;
    avatarUrl: string;
    profileUrl: string;
    onDiscode: boolean;
    requestStatus: FriendRequestStatus | null;
}

export interface ConnectionPage {
    page: number;
    hasMore: boolean;
    items: Connection[];
}