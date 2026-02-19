import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { SetupToken, Agent } from "@/lib/db";

const handler = compose(withAuth, withDatabase);

/**
 * GET /api/agents/by-token/[token]
 * Finds the agent that was registered using a specific setup token.
 */
export const GET = handler(async (_request, context) => {
  const { token } = await (context as { params: Promise<{ token: string }> }).params;

  const setupToken = await SetupToken.findOne({ token }).lean();
  if (!setupToken) {
    return Response.json({ error: "Token not found" }, { status: 404 });
  }

  if (!setupToken.used || !setupToken.usedByAgentId) {
    return Response.json({ registered: false, agent: null });
  }

  const agent = await Agent.findById(setupToken.usedByAgentId).lean();
  return Response.json({ registered: true, agent });
});
