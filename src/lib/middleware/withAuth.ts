import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { connectDB, Agent } from "@/lib/db";

type RouteHandler = (request: NextRequest, context?: unknown) => Promise<Response>;

/**
 * Validates a Bearer token against registered agent API keys.
 * Returns true if the token matches any agent's apiKey.
 */
async function validateAgentToken(token: string): Promise<boolean> {
  await connectDB();
  const agent = await Agent.findOne({ apiKey: token }, { _id: 1 }).lean();
  return agent !== null;
}

export function withAuth(handler: RouteHandler): RouteHandler {
  return async (request: NextRequest, context?: unknown) => {
    // 1. Session auth (browser users)
    const session = await getSession();
    if (session) {
      return handler(request, context);
    }

    // 2. Bearer token auth (agents)
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (token && (await validateAgentToken(token))) {
        return handler(request, context);
      }
    }

    return Response.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  };
}
