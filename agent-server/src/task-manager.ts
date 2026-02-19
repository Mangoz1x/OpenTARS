import { v4 as uuidv4 } from "uuid";
import { Task } from "./db/models/Task.js";
import { TaskEventBus } from "./event-bus.js";
import { notifyTars } from "./webhook.js";
import type { CreateTaskRequest, TaskStatus } from "./types.js";
import type { AgentServerConfig } from "./config.js";

export interface ManagedTask {
  taskId: string;
  abortController: AbortController;
  eventBus: TaskEventBus;
}

export class TaskManager {
  private activeTasks = new Map<string, ManagedTask>();
  private config: AgentServerConfig;

  constructor(config: AgentServerConfig) {
    this.config = config;
  }

  isRunning(): boolean {
    return [...this.activeTasks.values()].some((t) => !t.abortController.signal.aborted);
  }

  getActiveTaskId(): string | null {
    for (const [taskId, managed] of this.activeTasks) {
      if (!managed.abortController.signal.aborted) {
        return taskId;
      }
    }
    return null;
  }

  async createTask(request: CreateTaskRequest): Promise<ManagedTask> {
    const taskId = `task_${uuidv4()}`;
    const abortController = new AbortController();
    const eventBus = new TaskEventBus();

    // Persist to DB
    await Task.create({
      _id: taskId,
      agentId: this.config.agentId,
      status: "running",
      prompt: request.prompt,
      systemPrompt: request.systemPrompt ?? "",
    });

    const managed: ManagedTask = { taskId, abortController, eventBus };
    this.activeTasks.set(taskId, managed);

    return managed;
  }

  getManaged(taskId: string): ManagedTask | undefined {
    return this.activeTasks.get(taskId);
  }

  async getTask(taskId: string) {
    return Task.findById(taskId).lean();
  }

  async updateTask(taskId: string, updates: Record<string, unknown>): Promise<void> {
    await Task.findByIdAndUpdate(taskId, { $set: updates });
  }

  async completeTask(
    taskId: string,
    status: TaskStatus,
    result: string | null,
    stopReason: string | null,
    costUsd: number,
    turnsCompleted: number,
    filesModified: string[]
  ): Promise<void> {
    await Task.findByIdAndUpdate(taskId, {
      $set: {
        status,
        result,
        stopReason,
        costUsd,
        turnsCompleted,
        filesModified,
        completedAt: new Date(),
      },
    });

    notifyTars(this.config, {
      taskId,
      status,
      result,
      stopReason,
      costUsd,
      turnsCompleted,
      filesModified,
    });

    const managed = this.activeTasks.get(taskId);
    if (managed) {
      managed.eventBus.close();
      this.activeTasks.delete(taskId);
    }
  }

  async failTask(taskId: string, error: string): Promise<void> {
    await Task.findByIdAndUpdate(taskId, {
      $set: {
        status: "failed",
        error,
        completedAt: new Date(),
      },
    });

    notifyTars(this.config, { taskId, status: "failed", error });

    const managed = this.activeTasks.get(taskId);
    if (managed) {
      managed.eventBus.close();
      this.activeTasks.delete(taskId);
    }
  }

  async cancelTask(taskId: string): Promise<void> {
    const managed = this.activeTasks.get(taskId);
    if (!managed) return;

    managed.abortController.abort();

    await Task.findByIdAndUpdate(taskId, {
      $set: {
        status: "cancelled",
        completedAt: new Date(),
      },
    });

    notifyTars(this.config, { taskId, status: "cancelled" });

    managed.eventBus.close();
    this.activeTasks.delete(taskId);
  }
}
