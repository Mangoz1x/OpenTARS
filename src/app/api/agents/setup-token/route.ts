import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { SetupToken } from "@/lib/db";

const handler = compose(withAuth, withDatabase);

/**
 * POST /api/agents/setup-token
 * Generates a one-time setup token for registering a new agent.
 * Requires authentication (admin must be logged in).
 */
export const POST = handler(async (request: NextRequest) => {
  const body = await request.json();
  const agentName = body.agentName ?? "TARS Agent";
  const archetypes = body.archetypes ?? ["developer"];
  const expiresInMinutes = body.expiresInMinutes ?? 30;

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  await SetupToken.create({
    token,
    agentName,
    archetypes,
    expiresAt,
  });

  return Response.json({
    token,
    expiresAt: expiresAt.toISOString(),
    agentName,
    instructions: `On the agent machine, set these env vars and start the agent server:\n  TARS_SETUP_TOKEN=${token}\n  TARS_URL=<this server's URL, e.g. http://192.168.1.50:3000>`,
  });
});
