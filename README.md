# Discode

**Discode** is a Visual Studio Code extension, presented by **Codespace**, that brings developer presence to your editor — inspired by Discord and Steam's "currently playing" systems, but for code.

The long-term vision: open VS Code, and your friends can see that you're online, coding, idle, or offline — and eventually, what you're working on. Discode aims to make coding feel a little more social and a little less solitary.

> **Status: early development.** Discode is a work-in-progress summer project. This README is kept accurate on purpose — anything listed under "Planned" is *not* built yet. See [Roadmap](#roadmap) for what's coming.

---

## Table of Contents

- [Features](#features)
  - [Implemented](#implemented)
  - [Planned](#planned)
- [Requirements](#requirements)
- [Extension Settings](#extension-settings)
- [Architecture](#architecture)
- [Development Roadmap](#roadmap)
- [Known Issues](#known-issues)
- [Contributing](#contributing)
- [Release Notes](#release-notes)
- [License](#license)

---

## Features

### Implemented

These features exist in the codebase today and can be tried right now:

- **GitHub authentication** — Sign in with your GitHub account via VS Code's built-in authentication provider (`vscode.authentication.getSession`).
- **Status bar presence item** — Discode adds an item to the VS Code status bar.
- **Dashboard panel** — A command opens a reusable Discode dashboard (`WebviewPanel`), which can be reopened and closed cleanly (`panel.reveal()` / `onDidDispose`).
- **Core extension architecture** — The extension is organized into focused components (`ExtensionController`, `CommandManager`, `AuthManager`, `StatusBarManager`, `DashboardView`) with clear responsibility boundaries. See [Architecture](#architecture).

> No screenshots yet — these will be added here once the dashboard UI is finalized.

### Planned

These features are designed and discussed, but **not yet implemented**. They are listed here to set expectations, not to claim functionality:

- **Local presence detection** — A state machine (`Online → Coding → Idle → Offline`) that reflects real editing activity in the status bar, based on signals like active document edits, window focus, and inactivity duration.
- **GitHub profile display** — Showing the authenticated user's avatar, username, display name, followers, and following count in the dashboard.
- **Discode friends system** — A dedicated friend system (friend requests via GitHub username) that is explicitly separate from GitHub followers/following. GitHub followers will **not** automatically become Discode friends.
- **Real-time presence sharing** — Seeing friends' online/coding/idle/offline status, powered by a backend service.
- **React-based dashboard** — A migration of the dashboard from static HTML to React + TypeScript + Vite for a more maintainable, interactive UI.

---

## Requirements

- Visual Studio Code (recent version — exact minimum `engines.vscode` version TBD).
- A GitHub account, for signing in.
- Node.js and npm, if building/running the extension from source.

No additional runtime dependencies are required for the currently implemented features. The planned backend (see [Roadmap](#roadmap)) will introduce its own requirements once built.

## Extension Settings

Discode does not currently contribute any user-configurable settings via `contributes.configuration`.

Planned settings, once presence detection and the friends system exist, may include things like:

- `discode.idleTimeout` — how long without activity before status changes to Idle.
- `discode.shareProjectName` — whether to share the current project/language with friends, or keep it private.

These are **not implemented** and are listed here only as an indication of future direction.

## Architecture

Discode is organized into small, single-responsibility components:

```text
ExtensionController
        |
        |-- StatusBarManager   (owns the status bar item)
        |
        |-- CommandManager     (routes commands & dashboard messages)
        |
        |-- AuthManager        (owns the GitHub auth session)
        |
        |-- DashboardView      (owns the webview panel)
```

Key principles:

- The dashboard (webview) never talks to `AuthManager` or GitHub directly — it sends messages, and `CommandManager` routes them to the right component.
- Authentication logic is isolated in `AuthManager`.
- Business logic for talking to the GitHub API will live in a dedicated `GitHubService`, called only through `CommandManager`.

A migration to a React-based dashboard (TypeScript + Vite) is under consideration but not scheduled — see [Roadmap](#roadmap).

## Roadmap

Development proceeds one milestone at a time. Rough order of priority:

1. **Local presence engine** — Build the Online/Coding/Idle/Offline state machine from local VS Code activity signals only (no backend). Reflect it accurately in the status bar.
2. **GitHub profile in dashboard** — Fetch and display the authenticated user's avatar, name, and username via a `GitHubService`.
3. **README & polish for public release** — Keep documentation honest and up to date as an MVP milestone.
4. **Friends system (backend)** — Introduce a minimal backend (candidate stack: Node.js, Express, Socket.IO, MongoDB — not finalized) to support friend requests and cross-user presence.
5. **Real-time presence sharing** — Heartbeats and live status updates between friends.
6. **React + Vite dashboard migration** — Once the dashboard has enough interactive surface area to justify it.

This order is intentional: nothing that requires a backend is prioritized before the local, backend-free version is solid.

## Known Issues

- No known issues have been filed yet, since presence detection and GitHub profile/follower integration are not yet built.
- This section will be kept current as features ship and real issues surface.

## Contributing

Discode is an early-stage, learning-driven project. Contributions, suggestions, and issue reports are welcome once the project is public.

Until a `CONTRIBUTING.md` exists, the short version:

- Open an issue before submitting a large pull request.
- Keep changes scoped — this project favors small, incremental milestones over large refactors.
- Match the existing architecture (see [Architecture](#architecture)) rather than introducing new patterns without discussion.
- Run `npm run setup:hooks` once after cloning to enable the commit hook, which adds the staged file paths to `CHANGELOG.md` before each commit.

## Release Notes

### Unreleased

- Initial extension scaffold (TypeScript).
- GitHub authentication via `vscode.authentication.getSession`.
- Status bar item.
- Dashboard command and reusable `WebviewPanel`.
- Core component architecture (`ExtensionController`, `CommandManager`, `AuthManager`, `StatusBarManager`, `DashboardView`).

No versioned release has been published yet. This section will be updated with real version numbers (e.g. `0.1.0`) at the first public release.

## License

License to be determined before public release.

---

*This README reflects the actual state of the project and is updated as features move from "Planned" to "Implemented."*