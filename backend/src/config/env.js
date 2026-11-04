import "dotenv/config";

function parsePort(value) {
  const port = Number(value ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return port;
}

function parseDatabaseUrl(value) {
  if (!value) {
    throw new Error("DATABASE_URL is required.");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol.");
  }
  return value;
}

export const config = Object.freeze({
  port: parsePort(process.env.PORT),
  databaseUrl: parseDatabaseUrl(process.env.DATABASE_URL),
});
