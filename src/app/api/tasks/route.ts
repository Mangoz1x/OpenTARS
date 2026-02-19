import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Task } from "@/lib/db";
import type { NextRequest } from "next/server";

const handler = compose(withAuth, withDatabase);

/**
 * GET /api/tasks — List tasks for the Tasks UI panel.
 * Optional query params: status, conversationId, limit
 */
export const GET = handler(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status");
  const conversationId = searchParams.get("conversationId");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (conversationId) filter.conversationId = conversationId;

  const tasks = await Task.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return Response.json({ tasks });
});
