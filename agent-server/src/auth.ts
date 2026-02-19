import type { RequestHandler } from "express";
import type { AgentServerConfig } from "./config.js";

export function authMiddleware(config: AgentServerConfig): RequestHandler {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid Authorization header" });
      return;
    }

    const token = header.slice(7);
    if (token !== config.authToken) {
      res.status(403).json({ error: "Invalid token" });
      return;
    }

    next();
  };
}
