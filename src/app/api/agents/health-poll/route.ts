import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Agent } from "@/lib/db";

const handler = compose(withAuth, withDatabase);

/**
 * POST /api/agents/health-poll
 * Pings all agents in parallel and updates their online status.
 */
export const POST = handler(async () => {
  const agents = await Agent.find().lean();

  const results = await Promise.allSettled(
    agents.map(async (agent) => {
      let isOnline = false;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(`${agent.url}/agent/health`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) isOnline = true;
      } catch {
        // Agent unreachable
      }

      const now = new Date();
      await Agent.findByIdAndUpdate(agent._id, {
        isOnline,
        ...(isOnline ? { lastHeartbeat: now } : {}),
      });

      return {
        agentId: agent._id,
        isOnline,
        lastHeartbeat: isOnline ? now.toISOString() : (agent.lastHeartbeat as Date)?.toISOString() ?? null,
      };
    })
  );

  return Response.json({
    results: results.map((r) =>
      r.status === "fulfilled" ? r.value : { agentId: null, isOnline: false, lastHeartbeat: null }
    ),
  });
});
