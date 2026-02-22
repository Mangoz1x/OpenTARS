import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Extension } from "@/lib/db";

const handler = compose(withAuth, withDatabase);

/**
 * POST /api/extensions/[name]/error
 * Called by the Error Boundary when an extension crashes at runtime.
 * Updates the Extension doc with error details.
 */
export const POST = handler(async (request, context) => {
  const { name } = await (context as { params: Promise<{ name: string }> }).params;

  const body = await request.json();
  const errorMessage = body?.error || "Unknown error";

  const result = await Extension.findByIdAndUpdate(name, {
    $set: {
      lastError: errorMessage,
      lastErrorAt: new Date(),
    },
  });

  if (!result) {
    return Response.json({ error: "Extension not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
});
