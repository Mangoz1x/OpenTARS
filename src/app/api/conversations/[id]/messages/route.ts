import type { NextRequest } from "next/server";
import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Conversation, Message } from "@/lib/db";

const handler = compose(withAuth, withDatabase);

export const GET = handler(async (_request, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  const messages = await Message.find({ conversationId: id })
    .sort({ timestamp: 1 })
    .lean();

  return Response.json({ messages });
});

export const POST = handler(async (request: NextRequest, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  const conversation = await Conversation.findById(id);
  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const body = await request.json();
  const { role, content, agentActivity } = body;

  if (!role || !content) {
    return Response.json({ error: "role and content are required" }, { status: 400 });
  }

  const message = await Message.create({
    conversationId: id,
    role,
    content,
    agentActivity,
  });

  // Update conversation metadata
  const update: Record<string, unknown> = {
    $inc: { messageCount: 1 },
    $set: { lastMessageAt: message.timestamp },
  };

  // Auto-generate title from first user message if title is still null
  if (!conversation.title && role === "user") {
    update.$set = {
      ...update.$set as Record<string, unknown>,
      title: content.length > 50 ? content.substring(0, 50) + "..." : content,
    };
  }

  await Conversation.findByIdAndUpdate(id, update);

  return Response.json({ message }, { status: 201 });
});
