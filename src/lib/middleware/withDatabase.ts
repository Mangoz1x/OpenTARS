import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";

type RouteHandler = (request: NextRequest, context?: unknown) => Promise<Response>;

export function withDatabase(handler: RouteHandler): RouteHandler {
  return async (request: NextRequest, context?: unknown) => {
    try {
      await connectDB();
    } catch {
      return Response.json(
        { error: "Database connection failed" },
        { status: 503 }
      );
    }
    return handler(request, context);
  };
}
