import type { NextRequest } from "next/server";
import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Message } from "@/lib/db";
import { resolvePendingAnswer } from "@/lib/orchestrator/pending-answers";

const handler = compose(withAuth, withDatabase);

export const POST = handler(async (request: NextRequest, context) => {
  const { id } = await (
    context as { params: Promise<{ id: string }> }
  ).params;

  const { messageId, answers } = await request.json();

  if (!messageId || !answers) {
    return Response.json(
      { error: "messageId and answers are required" },
      { status: 400 }
    );
  }

  // Save answers to DB
  await Message.findByIdAndUpdate(messageId, {
    $set: {
      "userQuestion.answered": true,
      "userQuestion.answers": answers,
    },
  });

  // Resolve pending answer — model continues on the same SSE stream
  const resolved = resolvePendingAnswer(id, answers);
  if (!resolved) {
    return Response.json(
      { error: "No pending question for this conversation" },
      { status: 404 }
    );
  }

  return Response.json({ success: true });
});
