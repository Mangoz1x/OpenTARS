import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Script } from "@/lib/db";

const handler = compose(withAuth, withDatabase);

/**
 * GET /api/scripts/[name]
 * Get a script's full details (including code).
 */
export const GET = handler(async (_request, context) => {
  const { name } = await (context as { params: Promise<{ name: string }> }).params;

  const script = await Script.findById(name).lean();
  if (!script) {
    return Response.json({ error: "Script not found" }, { status: 404 });
  }

  return Response.json({ script });
});

/**
 * DELETE /api/scripts/[name]
 * Delete a script.
 */
export const DELETE = handler(async (_request, context) => {
  const { name } = await (context as { params: Promise<{ name: string }> }).params;

  const result = await Script.findByIdAndDelete(name);
  if (!result) {
    return Response.json({ error: "Script not found" }, { status: 404 });
  }

  return Response.json({ success: true });
});
