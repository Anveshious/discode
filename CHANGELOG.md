# Change Log

All notable changes to the "discode" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added

- GitHub authentication using VS Code's built-in authentication provider.
- Authenticated GitHub profile retrieval with profile links and follower counts, sent to the dashboard after sign-in.
- A reusable Discode dashboard opened through a VS Code command.
- A status bar presence item and command-based extension entry points.
- A modular extension structure for authentication, commands, dashboard, and status bar features.

### Changed

- Staged paths: `.gitignore`, `README.md`, `backend/.env.example`, `backend/README.md`, `backend/compose.yaml`, and 8 more
- Staged paths: `README.md`, `src/core/ExtensionController.ts`, `src/models/PresenceStatus.ts`, `src/presence/presenceTracker.ts`, `src/services/PresenceManager.ts`, and 4 more
- Staged paths: `README.md`, `src/commands/CommandManager.ts`, `src/core/ExtensionController.ts`, `src/models/PresenceStatus.ts`, `src/presence/presenceTracker.ts`, and 4 more
- Staged paths: `README.md`, `src/auth/AuthManager.ts`, `src/core/ExtensionController.ts`, `src/models/GitHubUser.ts`, `src/services/GitHubService.ts`, and 2 more
- Staged paths: `README.md`, `package-lock.json`, `package.json`, `src/test/extension.test.ts`, `src/test/presenceTracker.test.ts`, and 1 more
- Staged paths: `.mcp.json`, `src/auth/AuthManager.ts`, `src/commands/CommandManager.ts`, `src/models/PresenceStatus.ts`, `src/presence/presenceTracker.ts`, and 3 more
- Staged paths: `src/commands/CommandManager.ts`, `src/core/ExtensionController.ts`, `src/models/PresenceStatus.ts`, `src/services/PresenceManager.ts`, `src/ui/StatusBarManager.ts`, and 1 more
- Staged paths: `eslint.config.mjs`, `package.json`
- Staged paths: `src/auth/AuthManager.ts`, `src/commands/CommandManager.ts`, `src/core/ExtensionController.ts`, `src/ui/StatusBarManager.ts`, `src/webview/DashboardView.ts`
- Staged paths: `src/auth/AuthManager.ts`, `src/commands/CommandManager.ts`, `src/core/ExtensionController.ts`, `src/extension.ts`, `src/ui/StatusBarManager.ts`, and 1 more
- Staged paths: `CHANGELOG.md`, `README.md`, `src/auth/AuthManager.ts`, `src/gitHub/GithubService.ts`, `src/models/GitHubUser.ts`, and 1 more
- Staged paths: `.githooks/pre-commit`, `CHANGELOG.md`, `package.json`, `scripts/update-changelog.js`, `src/auth/AuthManager.ts`, and 2 more
