import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Conversation, Message } from "@/lib/db";

const handler = compose(withAuth, withDatabase);

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
