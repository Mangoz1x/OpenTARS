import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Agent } from "@/lib/db";

const handler = compose(withAuth, withDatabase);

/**
 * GET /api/agents/[id]/health
 * Pings the agent's health endpoint and updates DB status.
 */
export const GET = handler(async (_request, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  const agent = await Agent.findById(id);
  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  let isOnline = false;
  let healthData: Record<string, unknown> | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${agent.url}/agent/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      isOnline = true;
      healthData = await res.json();
    }
  } catch {
    // Agent unreachable
  }

  const now = new Date();
  await Agent.findByIdAndUpdate(id, {
    isOnline,
    ...(isOnline ? { lastHeartbeat: now } : {}),
  });

  return Response.json({
    agentId: id,
    isOnline,
    lastHeartbeat: isOnline ? now.toISOString() : agent.lastHeartbeat?.toISOString() ?? null,
    health: healthData,
  });
});
