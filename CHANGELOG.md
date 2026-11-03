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

- Staged paths: `src/auth/AuthManager.ts`, `src/commands/CommandManager.ts`, `src/core/ExtensionController.ts`, `src/extension.ts`, `src/ui/StatusBarManager.ts`, and 1 more
- Staged paths: `CHANGELOG.md`, `README.md`, `src/auth/AuthManager.ts`, `src/gitHub/GithubService.ts`, `src/models/GitHubUser.ts`, and 1 more
- Staged paths: `.githooks/pre-commit`, `CHANGELOG.md`, `package.json`, `scripts/update-changelog.js`, `src/auth/AuthManager.ts`, and 2 more
