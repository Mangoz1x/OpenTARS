import fs from "fs";
import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Script } from "@/lib/db";
import { getScriptSourcePath, getScriptCachePath } from "@/lib/userdata";

const handler = compose(withAuth, withDatabase);

/**
 * GET /api/scripts/[name]
 * Get a script's full details.
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
 * Delete a script and its disk files.
 */
export const DELETE = handler(async (_request, context) => {
  const { name } = await (context as { params: Promise<{ name: string }> }).params;

  const result = await Script.findByIdAndDelete(name);
  if (!result) {
    return Response.json({ error: "Script not found" }, { status: 404 });
  }

  // Clean up disk files
  const sourcePath = getScriptSourcePath(name);
  const cachePath = getScriptCachePath(name);

  if (fs.existsSync(sourcePath)) {
    fs.unlinkSync(sourcePath);
  }
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
  }

  return Response.json({ success: true });
});
