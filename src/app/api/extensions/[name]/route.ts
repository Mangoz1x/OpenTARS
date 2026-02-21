import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Extension } from "@/lib/db";

const handler = compose(withAuth, withDatabase);

/**
 * GET /api/extensions/[name]
 * Get extension details.
 */
export const GET = handler(async (_request, context) => {
  const { name } = await (context as { params: Promise<{ name: string }> }).params;

  const extension = await Extension.findById(name).lean();
  if (!extension) {
    return Response.json({ error: "Extension not found" }, { status: 404 });
  }

  return Response.json({ extension });
});

/**
 * DELETE /api/extensions/[name]
 * Delete an extension.
 */
export const DELETE = handler(async (_request, context) => {
  const { name } = await (context as { params: Promise<{ name: string }> }).params;

  const result = await Extension.findByIdAndDelete(name);
  if (!result) {
    return Response.json({ error: "Extension not found" }, { status: 404 });
  }

  return Response.json({ success: true });
});
