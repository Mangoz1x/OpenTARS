import express from "express";
import { bootstrap } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { connectDB } from "./db/connection.js";
import { authMiddleware } from "./auth.js";
import { TaskManager } from "./task-manager.js";
import { createTaskRouter } from "./routes/tasks.js";
import { createAgentRouter } from "./routes/agent.js";
import { log, initLogger, printBanner, printStartupError } from "./logger.js";
import { startHeartbeat, stopHeartbeat } from "./heartbeat.js";
import { getPrivateIps } from "./network.js";

async function main() {
  printBanner();

  // Bootstrap: load config from saved file, setup token, or env vars
  await bootstrap();

  // Now env vars are populated — load structured config
  const config = loadConfig();

  initLogger(config.debug);
  if (config.debug) log.detail("Debug:", "enabled");

  // Connect to MongoDB
  log.dim("Connecting to MongoDB...");
  await connectDB(config.mongodbUri);
  log.success("Connected to MongoDB");

  const taskManager = new TaskManager(config);

  const app = express();
  app.use(express.json());
  app.use(authMiddleware(config));

  app.use("/tasks", createTaskRouter(taskManager, config));
  app.use("/agent", createAgentRouter(taskManager, config));

  app.listen(config.port, () => {
    log.success(`Running on port ${config.port}`);
    log.detail("Agent ID:", config.agentId);
    log.detail("Model:   ", config.defaultModel);

    const ips = getPrivateIps();
    if (ips.length > 0) {
      log.detail("Private IP:", ips.join(", "));
    }

    startHeartbeat(config.agentId, config.port);
    console.log();
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log();
    log.dim("Shutting down...");
    await stopHeartbeat(config.agentId);
    const activeId = taskManager.getActiveTaskId();
    if (activeId) {
      log.warn(`Cancelling active task: ${activeId}`);
      await taskManager.cancelTask(activeId);
    }
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  printStartupError(err);
  process.exit(1);
});
