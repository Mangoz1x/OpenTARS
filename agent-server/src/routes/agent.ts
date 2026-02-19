import { Router } from "express";
import os from "os";
import type { AgentServerConfig } from "../config.js";
import type { TaskManager } from "../task-manager.js";

export function createAgentRouter(
  taskManager: TaskManager,
  config: AgentServerConfig
): Router {
  const router = Router();

  router.get("/info", async (_req, res) => {
    const activeTaskId = taskManager.getActiveTaskId();
    let currentTask = null;

    if (activeTaskId) {
      const task = await taskManager.getTask(activeTaskId);
      if (task) {
        currentTask = {
          taskId: task._id,
          status: task.status,
          createdAt: task.createdAt,
        };
      }
    }

    res.json({
      agentId: config.agentId,
      name: config.agentName,
      capabilities: ["code", "test", "debug", "build"],
      status: activeTaskId ? "busy" : "idle",
      currentTask,
      machine: {
        hostname: os.hostname(),
        os: process.platform,
        cpus: os.cpus().length,
        memoryGb: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
      },
      sdk: {
        model: config.defaultModel,
      },
      uptime: Math.round(process.uptime()),
    });
  });

  router.get("/health", (_req, res) => {
    res.json({
      healthy: true,
      uptime: Math.round(process.uptime()),
      apiKeyValid: !!process.env.ANTHROPIC_API_KEY,
    });
  });

  return router;
}
