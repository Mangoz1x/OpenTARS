import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { compose } from "@/lib/middleware/compose";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { SetupToken, Agent, SiteConfig } from "@/lib/db";

const handler = compose(withDatabase);

/**
 * POST /api/agents/register
 * Called by an agent server with a one-time setup token.
 * Returns all config the agent needs: MongoDB URI, API key, auth token, agent ID.
 * No session auth required — the setup token IS the authentication.
 */
export const POST = handler(async (request: NextRequest) => {
  const body = await request.json();
  const { token, hostname, os: agentOs, cpus, memoryGb } = body;

  if (!token) {
    return Response.json({ error: "Setup token is required" }, { status: 400 });
  }

  // Validate the token
  const setupToken = await SetupToken.findOne({ token, used: false });
  if (!setupToken) {
    return Response.json({ error: "Invalid or expired setup token" }, { status: 401 });
  }

  if (new Date() > setupToken.expiresAt) {
    return Response.json({ error: "Setup token has expired" }, { status: 401 });
  }

  // Generate agent credentials
  const agentId = `agent-${randomBytes(4).toString("hex")}`;
  const authToken = randomBytes(32).toString("hex");

  // Get the Anthropic API key from SiteConfig
  const siteConfig = await SiteConfig.findOne();
  const anthropicApiKey = siteConfig?.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;

  if (!anthropicApiKey) {
    return Response.json(
      { error: "No Anthropic API key configured on the TARS server" },
      { status: 500 }
    );
  }

  // Register the agent
  await Agent.create({
    _id: agentId,
    name: setupToken.agentName,
    url: "", // Will be updated when agent reports its URL
    apiKey: authToken,
    archetypes: setupToken.archetypes,
    preferredArchetype: setupToken.archetypes[0],
    capabilities: ["code", "test", "debug", "build"],
    isOnline: false,
    machine: {
      hostname: hostname ?? "unknown",
      os: agentOs ?? "unknown",
      cpus: cpus ?? 0,
      memoryGb: memoryGb ?? 0,
    },
  });

  // Mark token as used
  setupToken.used = true;
  setupToken.usedByAgentId = agentId;
  await setupToken.save();

  return Response.json({
    agentId,
    agentName: setupToken.agentName,
    authToken,
    mongodbUri: process.env.MONGODB_URI,
    anthropicApiKey,
    archetypes: setupToken.archetypes,
  });
});
