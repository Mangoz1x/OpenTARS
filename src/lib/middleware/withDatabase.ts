import type { NextRequest } from "next/server";

type RouteHandler = (request: NextRequest, context?: unknown) => Promise<Response>;

export function withDatabase(handler: RouteHandler): RouteHandler {
  return async (request: NextRequest, context?: unknown) => {
    // Stub: will connect to MongoDB when database layer is implemented
    return handler(request, context);
  };
}
