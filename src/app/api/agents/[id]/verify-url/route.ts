import { NextRequest } from "next/server";
import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Agent } from "@/lib/db";

const handler = compose(withAuth, withDatabase);

/**
 * POST /api/agents/[id]/verify-url
 * Tries to reach the agent at the given URL. If successful, saves the URL to the agent doc.
 * Used by the setup wizard to auto-discover which IP works.
 */
export const POST = handler(async (request: NextRequest, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const { url } = await request.json();

  if (!url) {
    return Response.json({ error: "url is required" }, { status: 400 });
  }

  const agent = await Agent.findById(id);
  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  const candidateUrl = url.replace(/\/$/, "");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${candidateUrl}/agent/health`, {
      headers: agent.apiKey ? { Authorization: `Bearer ${agent.apiKey}` } : {},
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return Response.json({ success: false });
    }
  } catch {
    return Response.json({ success: false });
  }

  // Reachable — persist the URL
  await Agent.findByIdAndUpdate(id, { url: candidateUrl, isOnline: true, lastHeartbeat: new Date() });

  return Response.json({ success: true, url: candidateUrl });
});
