import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Task, Agent } from "@/lib/db";
import type { NextRequest } from "next/server";

const handler = compose(withAuth, withDatabase);

/**
 * POST /api/tasks/:id/cancel — Cancel a task from the Tasks UI.
 * Forwards the cancel to the agent server, then updates the TARS task doc.
 */
export const POST = handler(async (
  _request: NextRequest,
  context: unknown,
) => {
  const { params } = context as { params: Promise<{ id: string }> };
  const { id } = await params;

  const task = await Task.findById(id);
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.status !== "running") {
    return Response.json(
      { error: `Task is already ${task.status}` },
      { status: 409 }
    );
  }

  // Forward cancel to the remote agent
  const agent = await Agent.findById(task.agentId).lean() as Record<string, unknown> | null;
  if (agent?.url && agent.apiKey) {
    try {
      await fetch(`${agent.url}/tasks/${task.remoteTaskId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${agent.apiKey}`,
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Agent might be offline — still update local status
    }
  }

  task.status = "cancelled";
  task.completedAt = new Date();
  await task.save();

  return Response.json({ ok: true, status: "cancelled" });
});
