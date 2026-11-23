# Discode Backend

Minimal Express API and PostgreSQL foundation for the Discode VS Code extension.

## Requirements

- Node.js 20 or newer
- Docker with Compose, or a reachable PostgreSQL instance

## Local development

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
npm install
npm run dev
```

The API listens on `http://localhost:8000` by default and applies SQL migrations
before accepting requests. `GET /api/health` runs a database query and returns
`200` when PostgreSQL is reachable or `503` when it is unavailable.

The extension signs in through VS Code's GitHub provider, then calls
`POST /api/auth/github` with its access token in the `Authorization: Bearer`
header. The backend verifies the token by requesting the authenticated user
profile from GitHub; it ignores identity fields supplied in the request body.
It creates the Discode user on first sign-in and updates the GitHub profile on
subsequent sign-ins, matching accounts only by GitHub's immutable numeric ID.
The response contains the Discode UUID, GitHub ID, profile fields, registration
timestamp and preferences. The GitHub token is not stored.

Invitation records store only a unique SHA-256 hash of their token. The
invitation creation flow must generate the random token, hash it, and provide
the hash when inserting the record; the raw token should only be returned to
the invite sender.

Friend relationships are represented by `friend_requests`. Each row records
the requester, recipient, status (`pending`, `accepted`, `declined`, or
`cancelled`), creation time, and resolution time. A user cannot request
themselves, and an active pending request or accepted friendship can exist only
once per user pair, regardless of direction. Declined or cancelled requests
remain in the table as history.

`POST /api/friend-requests` sends a request to a registered user. It requires a
GitHub bearer token and accepts `{ "recipientGithubId": 123456 }`; the requester
is derived from the verified GitHub identity rather than from client input. The
endpoint returns the created pending request, rejects unregistered recipients,
and returns `409` if a pending request or friendship already exists between the
users.

Friends can be added with authenticated `POST /api/friend-requests` using a
registered user's GitHub ID. Recipients can review incoming requests through
`GET /api/friend-requests` and accept them with
`POST /api/friend-requests/:id/accept`. `GET /api/friends` returns accepted
friends and their current presence. Authenticated `PUT /api/presence` accepts
one of `online`, `idle`, `focused`, `open-to-contribute`, or `offline`.
Presence older than 90 seconds is reported as offline.

Set the extension's `discode.backendUrl` setting to the backend base URL. Use
HTTPS outside localhost so GitHub credentials are protected in transit.

Configure the service with `PORT` and `DATABASE_URL`; see `.env.example`.
Never commit `.env` or use the development connection credentials in production.

## Embedded SQLite Backend

In addition to PostgreSQL, the backend supports a self-contained embedded mode powered by SQLite (`better-sqlite3`). The extension launches this automatically when `discode.backendUrl` is set to `"embedded"` (the default).

- `src/sqlite-server.js` — embedded entry point accepting `--db-path` and `--port` CLI arguments (prints assigned port as JSON to stdout).
- `src/db/sqlite-pool.js` — adapts SQLite to the `pg.Pool` interface (`query(sql, values)`), with SQL dialect translation and constraint error mapping.
- `src/db/sqlite-migrate.js` — initializes the SQLite schema matching PostgreSQL migrations.

Run embedded server manually:
```bash
node src/sqlite-server.js --db-path ./discode.db --port 8000
```

## Commands

- `npm start` — start the API
- `npm run dev` — restart the API when source files change
- `npm test` — run API tests

The PostgreSQL pool is closed when the process receives `SIGINT` or `SIGTERM`.
