import type { NextRequest } from "next/server";
import { connectDB, Task } from "@/lib/db";

/**
 * POST /api/tasks/:id/claim-response
 *
 * Atomic dedup: only one client/tab can claim the auto-response for a task.
 * Uses findOneAndUpdate with { responseClaimed: false } as a filter guard.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await connectDB();

  const task = await Task.findOneAndUpdate(
    { _id: id, responseClaimed: false },
    { $set: { responseClaimed: true } },
    { new: true }
  ).lean() as Record<string, unknown> | null;

  if (!task) {
    // Either task doesn't exist or was already claimed
    return Response.json({ claimed: false });
  }

  return Response.json({
    claimed: true,
    status: task.status,
    result: task.result ?? null,
    error: task.error ?? null,
    agentName: task.agentName,
    summary: task.summary,
  });
}
