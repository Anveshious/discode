# Discode

### Developer Presence for VS Code

**Know when your friends are coding.**

Discode is a VS Code extension that aims to bring developer discovery, social connections, and real-time presence into the coding environment. Using GitHub as the identity provider, Discode is designed to help developers find one another, build a network of coding friends, and see when those friends are online or open to collaboration — without leaving VS Code.

> **Project status:** Early development / prototype. GitHub authentication and the initial extension interface are implemented. The backend now has an Express/PostgreSQL foundation; backend-powered social features and cross-user real-time presence remain planned.

---

## The Idea

Discode takes inspiration from the social experience of Discord and brings it directly into Visual Studio Code.

A developer signs in using GitHub. Their GitHub username becomes their Discode identity. They can then search for other GitHub developers, connect with people already using Discode, and invite developers who have not joined yet.

Once connected, friends will be able to see one another's availability and permitted coding activity through the VS Code interface. A lightweight notification system will make it possible to know when a friend comes online or becomes available to collaborate.

**The goal is to make coding feel less isolated and make developer collaboration easier to discover.**

## Planned Features

### 1. GitHub Authentication

- Sign in through VS Code's built-in GitHub authentication provider.
- Use the authenticated GitHub account as the user's Discode identity.
- Retrieve relevant public profile information.
- Avoid creating a separate username and password system.

### 2. Developer Discovery

Search for developers using their GitHub usernames.

| Search result | Expected behaviour |
|---|---|
| GitHub user is registered on Discode | Display their Discode profile and allow a friend request |
| GitHub user exists but is not on Discode | Offer an invitation to join |
| GitHub user does not exist | Display a user-not-found result |

Discode will use GitHub's supported APIs for public user search and profile lookup. It will maintain its **own user registry** to identify which GitHub accounts have registered on Discode; GitHub does not provide an unrestricted downloadable database of every username.

### 3. Friends and Connections

- Send friend requests to registered Discode users, accept or decline incoming requests, cancel outgoing requests, and remove existing friends.
- Prevent duplicate and self-directed friend requests as well as requests between existing friends in both the API and dashboard UI.
- Display incoming friend requests with sender details, avatars, and pending count in the dashboard.
- Maintain an accepted-friends list inside the Discode dashboard.
- Display online and active friends (`online`, `focused`, `open-to-contribute`, `idle`) prioritized before offline friends, styled with status-colored presence dots and accessible labels.
- Show each accepted friend's current status, including online and offline counters.

Friend relationships will be managed by Discode rather than inferred from GitHub followers.

### 4. Developer Presence and Status

Discode is intended to support the following statuses:

| Status | Meaning |
|---|---|
| Online | Available and active in VS Code |
| Idle | Inactive for a configurable period (`discode.idleTimeoutMinutes`) |
| Focused | Deep work; prefers fewer interruptions |
| Open to Contribute | Available for collaboration |
| Offline | Not connected to Discode |

Users should be able to select a status manually (via the Discode dashboard or `discode.setPresenceStatus` in the Command Palette), while automatic activity detection provides supporting presence information. Manual status and connection state remain distinct. Changes to manual status immediately synchronize with the Discode backend API. The extension publishes a
configurable presence heartbeat (defaulting to every 30 seconds via `discode.heartbeatIntervalSeconds`); friends are shown as offline when their
last update is more than 90 seconds old.

Disconnected clients are handled gracefully on extension deactivation (e.g. closing or reloading VS Code) by stopping the heartbeat and immediately publishing an `offline` presence status to the Discode backend. In the event of an unexpected disconnect (power loss or network failure), the backend marks friends offline once the 90-second heartbeat freshness window elapses.

### 5. Coding Activity

With user permission, Discode may display lightweight activity such as:

- Whether a friend is actively coding.
- Current programming language.
- Current filename.
- Workspace or project name.

Privacy is a core requirement: Discode should not share source code, full local file paths, or private workspace information by default. Activity visibility should be configurable.

### 6. VS Code Notifications

Discode alerts developers with native VS Code notifications for social interactions:

- Incoming friend request notifications with an "Open Dashboard" quick action.
- A friend coming online.
- A friend becoming available to contribute.
- A relevant presence change.

Notifications should be configurable and dismissible so that Discode does not interrupt focused work.

### 7. Discode Dashboard

The dashboard is the central social interface inside VS Code. The planned dashboard will bring together:

- GitHub profile and Discode identity.
- Current status selector.
- Accepted friends with online/offline indicators.
- GitHub username search.
- Incoming friend requests and accept actions.
- Invitation actions.
- Privacy and notification settings.

---

## Current Implementation

The project is currently an early-stage VS Code extension prototype.

### Implemented

- [x] TypeScript-based VS Code extension scaffold.
- [x] GitHub authentication using VS Code's built-in authentication API.
- [x] GitHub username, numeric account ID, avatar and profile retrieval.
- [x] Debounced GitHub username search with up to five public profile matches.
- [x] Use of the numeric GitHub account ID as the stable identity key; usernames are display/search values.
- [x] Login, local sign-out, session restoration and authentication-provider change handling.
- [x] Expired-session handling that signs the user out and requests reauthentication.
- [x] Reusable Discode dashboard opened through `discode.openDashboard`.
- [x] Status bar presence item.
- [x] Detect active editor usage, inactivity-to-Idle transitions, and VS Code focus loss with configurable timeout (`discode.idleTimeoutMinutes`).
- [x] Manual Focused and Open to Contribute overrides, synchronized immediately to backend with command palette support (`discode.setPresenceStatus`).
- [x] Modular extension structure separating authentication, commands, services, models and UI.
- [x] Initial presence-status definitions, including Online, Idle, Focused and Open to Contribute.
- [x] Local presence tracking groundwork.
- [x] Backend friend requests, acceptance, and accepted-friend listing.
- [x] Accept and decline incoming friend requests with real-time UI updates.
- [x] Cancel outgoing friend requests before acceptance.
- [x] Prevent duplicate and self-directed friend requests with helpful user feedback.
- [x] Prevent friend requests between existing friends in search and connection views.
- [x] Friend request notifications with quick action to open the dashboard.
- [x] Publish presence with a configurable heartbeat interval (`discode.heartbeatIntervalSeconds`) and expire stale presence after 90 seconds.
- [x] Show accepted friends and incoming requests in the dashboard with requester avatars and profile links.
- [x] Remove existing friends with instant UI updates and backend synchronization.

### In Progress / Needs Integration

- [ ] Finalize the dashboard experience and connect all UI states to extension services.

### Planned

- [x] Backend Express API foundation, PostgreSQL connection configuration, and database health endpoint.
- [x] GitHub-verified sign-in that creates or updates a Discode account using the numeric GitHub ID.
- [x] Backend user API and PostgreSQL schema/migrations.
- [x] Discode user registration and profile persistence.
- [x] GitHub username search and public profile discovery.
- [ ] Invitation flow for users not yet registered.
- [x] Friend requests and accepted-friend connections.
- [x] Online/offline presence across accepted friends using heartbeat polling.
- [x] Manual status selection and synchronization.
- [ ] Privacy-controlled coding activity sharing.
- [ ] Real-time friend notifications.
- [ ] Dashboard redesign and account settings.
- [ ] Testing, packaging and eventual Marketplace release.

> **Status note:** Presence is shared through authenticated REST heartbeats and dashboard polling. A dedicated real-time push service and notifications remain future work.

Automatic presence initializes with the extension and detects editor activity and VS Code focus locally. After five minutes without editor activity, or when VS Code loses focus, activity becomes Idle. When no editor is active or the extension shuts down, its local presence becomes Offline and pending idle timers are cleared. Selecting Focused or Open to Contribute sets a separate manual override while the extension is active; choosing Automatic returns to the activity-derived Online/Idle state.

---

## Technical Direction

The extension is being developed with a modular architecture so that authentication, presence, dashboard UI and future social features can evolve independently.

| Layer | Planned technology | Responsibility |
|---|---|---|
| VS Code extension | TypeScript, VS Code Extension API | Authentication, editor integration, commands and notifications |
| Dashboard | VS Code Webview; React as a future option | Social interface and user interactions |
| Backend | Node.js, Express | User registration, profiles, friend relationships and API |
| Database | PostgreSQL | Persistent users, connections and preferences |
| Presence transport | Authenticated REST heartbeat and dashboard polling | Friend presence synchronization with stale-presence expiry |
| Identity and discovery | GitHub Authentication API and GitHub REST API | Authentication and public profile lookup |

### High-Level Architecture

```mermaid
flowchart TD
    A[VS Code Extension] <-->|HTTPS| B[Discode Backend]
    A --> C[Discode Dashboard]
    B <--> D[(PostgreSQL Database)]
    B <--> E[GitHub API]
```

The GitHub authentication provider establishes the user's identity in the extension. The backend independently verifies the identity presented by the extension before creating or accessing a Discode account. The backend manages Discode-specific data and limits shared presence to accepted friends.

GitHub usernames can change, so the numeric GitHub account ID is the stable identity key. The username and other profile fields are presentation data, not account keys. Signing out of Discode clears the extension's local authenticated state; the GitHub account itself remains signed in to VS Code.

The backend directory contains the Express API, PostgreSQL connection pool, environment configuration, local Compose database, GitHub-verified account registration, friend requests, accepted-friend listing, and presence endpoints. A dedicated real-time push service is not yet implemented.

See [backend/README.md](./backend/README.md) for backend setup and development commands.

The extension's dedicated API service sends the current VS Code GitHub session as a bearer token for account, social, and presence operations. The API service reports network, server, invalid-response and authentication errors rather than treating failed requests as success.

---

## Development Roadmap

Development will proceed incrementally, preserving the working extension while introducing the backend and social features.

| Phase | Scope | Status |
|---|---|---|
| 01 | GitHub authentication and identity | Implemented groundwork |
| 02 | Backend integration and user registration | Implemented |
| 03 | GitHub username search and developer discovery | Implemented |
| 04 | Friend requests and accepted-friend connections | Implemented |
| 05 | Online/offline presence via heartbeats | Implemented; push updates planned |
| 06 | Custom statuses and activity detection | Implemented |
| 07 | VS Code notifications | Planned |
| 08 | Dashboard improvements, privacy controls and polish | Ongoing / planned |

Phases may overlap as implementation and testing progress. The roadmap will be updated as features are completed and verified.

---

## Project Structure

The extension currently follows a modular TypeScript structure.

```text
src/
├── auth/
│   └── AuthManager.ts
├── backend/
│   ├── src/
│   └── test/
├── commands/
│   └── CommandManager.ts
├── core/
│   └── ExtensionController.ts
├── gitHub/
│   └── GithubService.ts
├── models/
│   ├── GitHubUser.ts
│   ├── PresenceStatus.ts
│   ├── StatusBarState.ts
│   └── user.ts
├── presence/
│   └── presenceTracker.ts
├── services/
│   ├── GitHubService.ts
│   └── PresenceManager.ts
├── ui/
│   └── StatusBarManager.ts
├── webview/
│   └── DashboardView.ts
└── extension.ts
```

The structure may evolve as the dashboard and backend integration grow. The backend is expected to become a separately organized component rather than placing server responsibilities inside the VS Code extension.

---

## Running the Extension Locally

### Prerequisites

- [Node.js](https://nodejs.org/)
- npm
- [Visual Studio Code](https://code.visualstudio.com/)
- GitHub account

### Setup

```bash
# Clone the repository
git clone <repository-url>

# Enter the project directory
cd discode

# Install dependencies
npm install

# Compile the extension
npm run compile
```

### Launch

1. Open the project folder in VS Code.
2. Press `F5` to launch the Extension Development Host.
3. Open the Command Palette.
4. Run **Discode: Open Dashboard**.
5. Sign in with GitHub when prompted.

### Available Scripts

| Command | Purpose |
|---|---|
| `npm install` | Install project dependencies |
| `npm run compile` | Compile TypeScript |
| `npm run watch` | Watch and compile source changes |
| `npm run lint` | Run ESLint |
| `npm test` | Compile, lint and run extension tests |

---

## Security and Privacy Principles

Discode is designed around minimal and user-controlled presence sharing.

- GitHub authentication tokens must be handled securely and never committed to the repository.
- The backend must verify authenticated identities; a submitted username alone is not proof of ownership.
- Only the minimum profile and presence data required for the service should be stored.
- Users should control which coding-activity details are visible to friends.
- Source code and full local file paths must never be transmitted as presence data.
- Real-time connections and backend communication must use secure transport.
- Users should be able to control notifications and activity visibility.
- Account deletion and associated data removal must be supported when the backend is introduced.

---

## Current Focus

The immediate priority is to move from a locally functioning extension prototype to a connected Discode service.

**Next major milestone:** establish the backend, define the user identity and registration flow, and connect the existing extension to persistent Discode accounts.

Features will be marked complete only after they are implemented and tested, not merely designed.

---

## Project Status

Discode is actively being developed. The current repository represents an evolving prototype, and the planned architecture and feature set may change as implementation progresses.

**Built for developers, by developers.**

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE.md) for details.