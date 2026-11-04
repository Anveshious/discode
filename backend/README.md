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

The API listens on `http://localhost:3000` by default and applies SQL migrations
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

Set the extension's `discode.backendUrl` setting to the backend base URL. Use
HTTPS outside localhost so GitHub credentials are protected in transit.

Configure the service with `PORT` and `DATABASE_URL`; see `.env.example`.
Never commit `.env` or use the development connection credentials in production.

## Commands

- `npm start` — start the API
- `npm run dev` — restart the API when source files change
- `npm test` — run API tests

The PostgreSQL pool is closed when the process receives `SIGINT` or `SIGTERM`.
