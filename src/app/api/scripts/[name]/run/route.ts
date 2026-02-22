import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Script } from "@/lib/db";
import { executeScriptByName } from "@/lib/scripts/execute";

const handler = compose(withAuth, withDatabase);

/**
 * POST /api/scripts/[name]/run
 * Invoke a script with params. Body: { params: {...} }
 * Reads code from disk first, falls back to MongoDB.
 */
export const POST = handler(async (request, context) => {
  const { name } = await (context as { params: Promise<{ name: string }> }).params;

  // Verify script exists in registry
  const script = await Script.findById(name).lean();
  if (!script) {
    return Response.json({ error: "Script not found" }, { status: 404 });
  }

  const body = await request.json();
  const params = body.params ?? {};

  try {
    const result = await executeScriptByName(name, params);
    return Response.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Script execution failed";
    return Response.json({ error: message }, { status: 500 });
  }
});
