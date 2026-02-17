import type { NextRequest } from "next/server";
import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Message } from "@/lib/db";

const handler = compose(withAuth, withDatabase);

export const POST = handler(async (request: NextRequest, context) => {
  const { id } = await (
    context as { params: Promise<{ id: string }> }
  ).params;

  void id; // conversationId available if needed for validation

  const { messageId, answers } = await request.json();

  if (!messageId || !answers) {
    return Response.json(
      { error: "messageId and answers are required" },
      { status: 400 }
    );
  }

  // Save answers to DB. The chat route's onQuestion is polling this document —
  // once it sees answered: true, the model continues.
  await Message.findByIdAndUpdate(messageId, {
    $set: {
      "userQuestion.answered": true,
      "userQuestion.answers": answers,
    },
  });

  return Response.json({ success: true });
});
