export interface GitHubUser {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string;
    html_url: string;
    followers: number;
    following: number;
}

export interface GitHubUserSearchResult {
    id: number;
    login: string;
    avatar_url: string;
    html_url: string;
    isRegistered: boolean;
}