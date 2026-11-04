import { Router } from "express";

export function createHealthRouter(pool) {
  const router = Router();

  router.get("/health", async (_request, response) => {
    try {
      await pool.query("SELECT 1");
      response.status(200).json({ status: "ok", database: "connected" });
    } catch (error) {
      console.error("Health check could not reach PostgreSQL.", error);
      response.status(503).json({ status: "unavailable", database: "disconnected" });
    }
  });

  return router;
}
