import express from "express";
import { createAuthRouter } from "./routes/auth.js";
import { createFriendRequestsRouter } from "./routes/friendRequests.js";
import { createHealthRouter } from "./routes/health.js";
import { createUsersRouter } from "./routes/users.js";

export function createApp(pool, options = {}) {
  const app = express();

  app.use(express.json({ limit: "100kb" }));
  app.use("/api", createHealthRouter(pool));
  app.use("/api", createAuthRouter({ pool, ...options }));
  app.use("/api", createFriendRequestsRouter({ pool, ...options }));
  app.use("/api", createUsersRouter(pool));
  app.use((_request, response) => {
    response.status(404).json({ error: "Not found" });
  });
  app.use((error, _request, response, next) => {
    if (error.type === "entity.parse.failed") {
      response.status(400).json({ error: "invalid_json" });
      return;
    }
    if (error.type === "entity.too.large") {
      response.status(413).json({ error: "payload_too_large" });
      return;
    }
    next(error);
  });

  return app;
}
