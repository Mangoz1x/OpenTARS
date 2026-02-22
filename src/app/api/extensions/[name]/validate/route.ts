import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { compileExtension } from "@/lib/extensions/compile";
import { getExtensionSourcePath } from "@/lib/userdata";
import fs from "fs";

const handler = compose(withAuth, withDatabase);

/**
 * POST /api/extensions/[name]/validate
 * Compile-check an extension's source file without registering it.
 * Returns { valid: true } or { valid: false, errors: [...] }.
 */
export const POST = handler(async (_request, context) => {
  const { name } = await (context as { params: Promise<{ name: string }> }).params;

  const sourcePath = getExtensionSourcePath(name);

  if (!fs.existsSync(sourcePath)) {
    return Response.json(
      { valid: false, errors: [`Source file not found: ${sourcePath}`] },
      { status: 400 }
    );
  }

  try {
    await compileExtension(sourcePath);
    return Response.json({ valid: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Compilation failed";
    // esbuild errors often contain multiple lines — split into array
    const errors = message
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return Response.json({ valid: false, errors });
  }
});
