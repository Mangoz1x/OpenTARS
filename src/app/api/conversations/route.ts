import type { NextRequest } from "next/server";
import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Conversation } from "@/lib/db";

const handler = compose(withAuth, withDatabase);

export const GET = handler(async () => {
  const conversations = await Conversation.find({ status: "active" })
    .sort({ lastMessageAt: -1 })
    .select("title lastMessageAt")
    .lean();

  return Response.json({ conversations });
});

export const POST = handler(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));

  const conversation = await Conversation.create({
    title: body.title || null,
    status: "active",
  });

  return Response.json(
    { conversation: { _id: conversation._id, title: conversation.title, status: conversation.status } },
    { status: 201 }
  );
});
