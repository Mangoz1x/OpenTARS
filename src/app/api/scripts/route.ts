import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Script } from "@/lib/db";

const handler = compose(withAuth, withDatabase);

/**
 * GET /api/scripts
 * List all scripts (metadata only, no code).
 */
export const GET = handler(async () => {
  const scripts = await Script.find(
    {},
    { code: 0 }
  ).sort({ createdAt: -1 }).lean();
  return Response.json({ scripts });
});

/**
 * POST /api/scripts
 * Create or update a script. Body: { _id, name, description, code, params?, createdBy? }
 */
export const POST = handler(async (request) => {
  const body = await request.json();

  if (!body._id || !body.name || !body.description || !body.code) {
    return Response.json(
      { error: "_id, name, description, and code are required" },
      { status: 400 }
    );
  }

  const script = await Script.findByIdAndUpdate(
    body._id,
    {
      _id: body._id,
      name: body.name,
      description: body.description,
      code: body.code,
      params: body.params ?? [],
      createdBy: body.createdBy,
      $inc: { version: 1 },
    },
    { upsert: true, new: true }
  ).lean();

  return Response.json({ script }, { status: 200 });
});
