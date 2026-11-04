import express from "express";
import { createHealthRouter } from "./routes/health.js";

export function createApp(pool) {
  const app = express();

  app.use(express.json({ limit: "100kb" }));
  app.use("/api", createHealthRouter(pool));
  app.use((_request, response) => {
    response.status(404).json({ error: "Not found" });
  });

  return app;
}
