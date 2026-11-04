import * as vscode from "vscode";
import type { AuthManager } from "../auth/AuthManager";

interface ApiErrorResponse {
    error: string;
}

export class ApiError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly code?: string
    ) {
        super(message);
        this.name = "ApiError";
    }
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
    return typeof value === "object"
        && value !== null
        && typeof (value as Record<string, unknown>).error === "string";
}

function getBackendBaseUrl(): URL {
    const configuredUrl = vscode.workspace.getConfiguration("discode").get<string>(
        "backendUrl",
        "http://localhost:3000"
    );
    let url: URL;
    try {
        url = new URL(configuredUrl);
    } catch {
        throw new Error("The Discode backend URL is invalid.");
    }

    const isLocalHttp = url.protocol === "http:"
        && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !isLocalHttp) {
        throw new Error("The Discode backend must use HTTPS except on localhost.");
    }
    if (url.username || url.password || url.search || url.hash) {
        throw new Error("The Discode backend URL must not contain credentials or query parameters.");
    }

    if (!url.pathname.endsWith("/")) {
        url.pathname += "/";
    }
    return url;
}

export class ApiService {
    constructor(
        private readonly authManager: Pick<AuthManager, "getSession" | "handleSessionExpired">,
        private readonly fetchImplementation: typeof fetch = globalThis.fetch
    ) {}

    public get(path: string): Promise<unknown> {
        return this.request(path, { method: "GET" });
    }

    public post(path: string, body: unknown): Promise<unknown> {
        return this.request(path, { method: "POST", body });
    }

    public async request(
        path: string,
        options: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {}
    ): Promise<unknown> {
        const session = this.authManager.getSession();
        if (!session) {
            throw new Error("GitHub authentication is required to use the Discode API.");
        }

        const endpoint = path.replace(/^\/+/, "");
        if (!endpoint || endpoint.split("/").some((part) => part === "." || part === "..")) {
            throw new Error("The Discode API endpoint is invalid.");
        }

        const baseUrl = getBackendBaseUrl();
        const url = new URL(endpoint, baseUrl);
        if (
            endpoint.includes("\\")
            || url.origin !== baseUrl.origin
            || !url.pathname.startsWith(baseUrl.pathname)
        ) {
            throw new Error("The Discode API endpoint is invalid.");
        }

        let body: string | undefined;
        try {
            body = options.body === undefined ? undefined : JSON.stringify(options.body);
        } catch {
            throw new Error("The Discode API request body is not valid JSON.");
        }

        let response: Response;
        try {
            const headers = new Headers({
                Accept: "application/json",
                Authorization: `Bearer ${session.accessToken}`,
            });
            if (options.body !== undefined) {
                headers.set("Content-Type", "application/json");
            }
            response = await this.fetchImplementation(url, {
                method: options.method ?? "GET",
                headers,
                body,
                signal: AbortSignal.timeout(10_000),
            });
        } catch (error) {
            if (error instanceof Error && error.name === "TimeoutError") {
                throw new Error("The Discode backend request timed out.");
            }
            throw new Error("Unable to reach the Discode backend. Check your connection and try again.");
        }

        let result: unknown;
        try {
            result = await response.json();
        } catch {
            if (!response.ok) {
                throw new ApiError(
                    `The Discode backend returned an HTTP ${response.status} error.`,
                    response.status
                );
            }
            throw new Error("The Discode backend returned an invalid response.");
        }

        if (!response.ok) {
            const code = isApiErrorResponse(result) ? result.error : undefined;
            if (response.status === 401 && code === "invalid_github_token") {
                await this.authManager.handleSessionExpired(session);
                throw new ApiError("Your GitHub session expired. Please sign in again.", 401, code);
            }
            if (response.status >= 500) {
                throw new ApiError(
                    "The Discode server is temporarily unavailable. Please try again later.",
                    response.status,
                    code
                );
            }
            throw new ApiError(
                code
                    ? `The Discode API request failed: ${code}.`
                    : `The Discode API request failed with status ${response.status}.`,
                response.status,
                code
            );
        }

        return result;
    }
}
