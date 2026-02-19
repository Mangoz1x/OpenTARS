import type { NextRequest } from "next/server";
import { connectDB, Task, Agent } from "@/lib/db";

/**
 * GET /api/tasks/:id/progress
 *
 * Proxies live task progress from the remote agent server.
 * Falls back to stale TARS Task data if the agent is unreachable.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await connectDB();

  const task = await Task.findById(id).lean() as Record<string, unknown> | null;
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  // Build stale fallback from TARS data
  const stale = {
    status: task.status as string,
    turnsCompleted: (task.turnsCompleted as number) ?? 0,
    lastActivity: (task.lastActivity as string) ?? "",
    costUsd: (task.costUsd as number) ?? 0,
    result: task.result as string | null,
    error: task.error as string | null,
  };

  // If already terminal, no need to hit the agent
  const terminal = ["completed", "failed", "cancelled", "max_turns", "max_budget"];
  if (terminal.includes(stale.status)) {
    return Response.json(stale);
  }

  // Try to proxy from the live agent
  try {
    const agent = await Agent.findById(task.agentId).lean() as Record<string, unknown> | null;
    if (!agent?.url || agent.url === "http://pending") {
      return Response.json(stale);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    const res = await fetch(`${agent.url}/tasks/${task.remoteTaskId}`, {
      headers: agent.apiKey
        ? { Authorization: `Bearer ${agent.apiKey}` }
        : {},
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return Response.json(stale);
    }

    const live = (await res.json()) as Record<string, unknown>;

    return Response.json({
      status: live.status ?? stale.status,
      turnsCompleted: live.turnsCompleted ?? stale.turnsCompleted,
      lastActivity: live.lastActivity ?? stale.lastActivity,
      costUsd: live.costUsd ?? stale.costUsd,
      result: live.result ?? stale.result,
      error: live.error ?? stale.error,
    });
  } catch {
    // Agent unreachable — return stale data
    return Response.json(stale);
  }
}
