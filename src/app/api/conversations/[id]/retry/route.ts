import type { NextRequest } from "next/server";
import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Conversation, Message } from "@/lib/db";

const handler = compose(withAuth, withDatabase);

/**
 * Cleans up failed messages (partial assistant text + error status) so the
 * conversation can be retried cleanly. Deletes all messages that were created
 * after the specified user message.
 */
export const POST = handler(async (request: NextRequest, context) => {
  const { id } = await (
    context as { params: Promise<{ id: string }> }
  ).params;

  const { lastUserMessageId } = await request.json();
  if (!lastUserMessageId) {
    return Response.json(
      { error: "lastUserMessageId is required" },
      { status: 400 }
    );
  }

  const userMsg = await Message.findOne({
    _id: lastUserMessageId,
    conversationId: id,
  });

  if (!userMsg) {
    return Response.json(
      { error: "User message not found" },
      { status: 404 }
    );
  }

  // Delete all messages created after the user message
  const result = await Message.deleteMany({
    conversationId: id,
    timestamp: { $gt: userMsg.timestamp },
  });

  if (result.deletedCount > 0) {
    await Conversation.findByIdAndUpdate(id, {
      $inc: { messageCount: -result.deletedCount },
      $set: { lastMessageAt: userMsg.timestamp },
    });
  }

  return Response.json({
    success: true,
    deletedCount: result.deletedCount,
  });
});
