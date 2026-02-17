import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Conversation, Message } from "@/lib/db";

const handler = compose(withAuth, withDatabase);

export const PATCH = handler(async (request, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const { title } = await request.json();

  if (typeof title !== "string" || title.trim().length === 0) {
    return Response.json({ error: "Title is required" }, { status: 400 });
  }

  const conversation = await Conversation.findByIdAndUpdate(
    id,
    { title: title.trim() },
    { new: true }
  );

  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  return Response.json({ conversation });
});

export const DELETE = handler(async (_request, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  const conversation = await Conversation.findById(id);
  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  await Message.deleteMany({ conversationId: id });
  await Conversation.findByIdAndDelete(id);

  return Response.json({ success: true });
});
