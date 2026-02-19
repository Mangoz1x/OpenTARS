import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Agent } from "@/lib/db";

const handler = compose(withAuth, withDatabase);

/**
 * GET /api/agents/[id]
 * Returns a single agent by ID.
 */
export const GET = handler(async (_request, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  const agent = await Agent.findById(id).lean();
  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  return Response.json({ agent });
});

/**
 * PATCH /api/agents/[id]
 * Updates an agent's mutable fields.
 */
export const PATCH = handler(async (request, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const body = await request.json();

  const allowed = ["name", "url", "archetypes", "preferredArchetype", "defaultCwd"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const agent = await Agent.findByIdAndUpdate(id, update, { new: true }).lean();
  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  return Response.json({ agent });
});

/**
 * DELETE /api/agents/[id]
 * Removes an agent. Cannot delete local agents.
 */
export const DELETE = handler(async (_request, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  const agent = await Agent.findById(id);
  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  if (agent.isLocal) {
    return Response.json({ error: "Cannot delete the local agent" }, { status: 403 });
  }

  await Agent.findByIdAndDelete(id);
  return Response.json({ success: true });
});
