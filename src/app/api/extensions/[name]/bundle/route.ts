import fs from "fs";
import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Extension } from "@/lib/db";
import { compileExtension } from "@/lib/extensions/compile";
import { getExtensionSourcePath, getExtensionCachePath } from "@/lib/userdata";

const handler = compose(withAuth, withDatabase);

/**
 * GET /api/extensions/[name]/bundle
 * Serve compiled JS bundle. Reads source from disk first, falls back to MongoDB.
 * Caches compiled output to disk with mtime-based invalidation.
 */
export const GET = handler(async (_request, context) => {
  const { name } = await (context as { params: Promise<{ name: string }> }).params;

  const extension = await Extension.findById(name).lean();
  if (!extension) {
    return Response.json({ error: "Extension not found" }, { status: 404 });
  }

  const sourcePath = getExtensionSourcePath(name);
  const cachePath = getExtensionCachePath(name);

  // Resolve source: disk first, then MongoDB fallback
  let source: string | null = null;
  let sourceMtime: number | null = null;

  if (fs.existsSync(sourcePath)) {
    source = fs.readFileSync(sourcePath, "utf-8");
    sourceMtime = fs.statSync(sourcePath).mtimeMs;
  } else if ((extension as { componentSource?: string }).componentSource) {
    source = (extension as { componentSource: string }).componentSource;
  }

  if (!source) {
    return Response.json(
      { error: "No source found — neither disk file nor componentSource in DB" },
      { status: 404 }
    );
  }

  // Check disk cache — serve if valid
  if (sourceMtime && fs.existsSync(cachePath)) {
    const cacheMtime = fs.statSync(cachePath).mtimeMs;
    if (cacheMtime > sourceMtime) {
      const cached = fs.readFileSync(cachePath, "utf-8");
      return new Response(cached, {
        headers: { "Content-Type": "application/javascript" },
      });
    }
  }

  // Compile TSX → JS
  try {
    const compiled = await compileExtension(source);

    // Write to disk cache
    const cacheDir = cachePath.substring(0, cachePath.lastIndexOf("/"));
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cachePath, compiled);

    return new Response(compiled, {
      headers: { "Content-Type": "application/javascript" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Compilation failed";
    return Response.json({ error: message }, { status: 500 });
  }
});
