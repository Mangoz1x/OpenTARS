import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Agent } from "@/lib/db";

const handler = compose(withAuth, withDatabase);

/**
 * GET /api/agents
 * Returns all registered agents.
 */
export const GET = handler(async () => {
  const agents = await Agent.find().sort({ isLocal: -1, createdAt: 1 }).lean();
  return Response.json({ agents });
});
