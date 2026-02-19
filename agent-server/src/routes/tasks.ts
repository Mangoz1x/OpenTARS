import { Router } from "express";
import fs from "fs/promises";
import { z } from "zod/v4";
import type { AgentServerConfig } from "../config.js";
import type { TaskManager } from "../task-manager.js";
import { runTask } from "../task-runner.js";

const createTaskSchema = z.object({
  prompt: z.string().min(1),
  systemPrompt: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
  permissionMode: z.enum(["default", "acceptEdits", "bypassPermissions"]).optional(),
  cwd: z.string().optional(),
  maxTurns: z.number().int().positive().optional(),
  maxBudgetUsd: z.number().positive().optional(),
  sessionId: z.string().nullable().optional(),
});

export function createTaskRouter(
  taskManager: TaskManager,
  config: AgentServerConfig
): Router {
  const router = Router();

  // POST /tasks — Start a new task
  router.post("/", async (req, res) => {
    // Validate request body
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.issues,
      });
      return;
    }

    const body = parsed.data;

    // Check single-task concurrency
    if (taskManager.isRunning()) {
      const activeId = taskManager.getActiveTaskId();
      res.status(409).json({
        error: "Agent is already running a task",
        currentTaskId: activeId,
      });
      return;
    }

    // Validate cwd if provided
    if (body.cwd) {
      try {
        await fs.access(body.cwd);
      } catch {
        res.status(400).json({ error: `Working directory does not exist: ${body.cwd}` });
        return;
      }
    }

    // Create task
    const managed = await taskManager.createTask(body);

    // Fire and forget — run task in background
    runTask(managed, body, taskManager, config).catch((err) => {
      console.error(`[Task ${managed.taskId}] Unhandled error:`, err);
    });

    res.status(201).json({
      taskId: managed.taskId,
      sessionId: null, // Will be set once SDK initializes
      status: "running",
      createdAt: new Date().toISOString(),
    });
  });

  // GET /tasks/:id — Get task status/result
  router.get("/:id", async (req, res) => {
    const task = await taskManager.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const response: Record<string, unknown> = {
      taskId: task._id,
      sessionId: task.sessionId,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      turnsCompleted: task.turnsCompleted,
      costUsd: task.costUsd,
      lastActivity: task.lastActivity,
    };

    if (task.status === "completed") {
      response.result = task.result;
      response.stopReason = task.stopReason;
      response.filesModified = task.filesModified;
      response.completedAt = task.completedAt;
    }

    if (task.status === "failed") {
      response.error = task.error;
      response.completedAt = task.completedAt;
    }

    if (task.status === "cancelled" || task.status === "max_turns" || task.status === "max_budget") {
      response.completedAt = task.completedAt;
      response.filesModified = task.filesModified;
    }

    res.json(response);
  });

  // GET /tasks/:id/stream — SSE stream of real-time progress
  router.get("/:id/stream", async (req, res) => {
    const task = await taskManager.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const managed = taskManager.getManaged(req.params.id);

    // If task is already done and no event bus, return the final state
    if (!managed && task.status !== "running") {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const finalEvent = task.status === "failed"
        ? { event: "error", data: { message: task.error } }
        : { event: "result", data: { status: task.status, result: task.result } };

      res.write(`event: ${finalEvent.event}\ndata: ${JSON.stringify(finalEvent.data)}\n\n`);
      res.end();
      return;
    }

    if (!managed) {
      res.status(404).json({ error: "Task event stream not available" });
      return;
    }

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Parse Last-Event-ID for reconnection
    const lastEventId = req.headers["last-event-id"]
      ? parseInt(req.headers["last-event-id"] as string, 10)
      : undefined;

    let closed = false;

    req.on("close", () => {
      closed = true;
    });

    try {
      for await (const event of managed.eventBus.subscribe(lastEventId)) {
        if (closed) break;
        res.write(`id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
      }
    } catch {
      // Client disconnected
    }

    res.end();
  });

  // POST /tasks/:id/cancel — Cancel a running task
  router.post("/:id/cancel", async (req, res) => {
    const task = await taskManager.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    if (task.status !== "running") {
      res.status(409).json({
        error: `Task already ${task.status}`,
        taskId: task._id,
        status: task.status,
      });
      return;
    }

    await taskManager.cancelTask(req.params.id);

    res.json({
      taskId: task._id,
      status: "cancelled",
      message: "Task cancelled by orchestrator",
    });
  });

  return router;
}
