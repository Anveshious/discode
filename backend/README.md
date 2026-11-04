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

The API listens on `http://localhost:3000` by default. `GET /api/health` runs a
database query and returns `200` when PostgreSQL is reachable or `503` when it
is unavailable.

Configure the service with `PORT` and `DATABASE_URL`; see `.env.example`.
Never commit `.env` or use the development connection credentials in production.

## Commands

- `npm start` — start the API
- `npm run dev` — restart the API when source files change
- `npm test` — run API tests

The PostgreSQL pool is closed when the process receives `SIGINT` or `SIGTERM`.
