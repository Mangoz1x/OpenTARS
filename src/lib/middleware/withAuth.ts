import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";

type RouteHandler = (request: NextRequest, context?: unknown) => Promise<Response>;

export function withAuth(handler: RouteHandler): RouteHandler {
  return async (request: NextRequest, context?: unknown) => {
    const session = await getSession();

    if (!session) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    return handler(request, context);
  };
}
