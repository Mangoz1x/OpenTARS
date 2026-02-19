import express from "express";
import { bootstrap } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { connectDB } from "./db/connection.js";
import { authMiddleware } from "./auth.js";
import { TaskManager } from "./task-manager.js";
import { createTaskRouter } from "./routes/tasks.js";
import { createAgentRouter } from "./routes/agent.js";

async function main() {
  // Bootstrap: load config from saved file, setup token, or env vars
  console.log("[Agent Server] Bootstrapping...");
  await bootstrap();

  // Now env vars are populated — load structured config
  const config = loadConfig();

  // Connect to MongoDB
  console.log("[Agent Server] Connecting to MongoDB...");
  await connectDB(config.mongodbUri);

  const taskManager = new TaskManager(config);

  const app = express();
  app.use(express.json());
  app.use(authMiddleware(config));

  app.use("/tasks", createTaskRouter(taskManager, config));
  app.use("/agent", createAgentRouter(taskManager, config));

  app.listen(config.port, () => {
    console.log(`[Agent Server] Running on port ${config.port}`);
    console.log(`[Agent Server] Agent ID: ${config.agentId}`);
    console.log(`[Agent Server] Model: ${config.defaultModel}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n[Agent Server] Shutting down...");
    const activeId = taskManager.getActiveTaskId();
    if (activeId) {
      console.log(`[Agent Server] Cancelling active task: ${activeId}`);
      await taskManager.cancelTask(activeId);
    }
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[Agent Server] Failed to start:", err);
  process.exit(1);
});
