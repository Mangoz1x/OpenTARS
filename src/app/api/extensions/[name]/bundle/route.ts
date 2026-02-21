import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Extension } from "@/lib/db";
import { compileExtension } from "@/lib/extensions/compile";

const handler = compose(withAuth, withDatabase);

/**
 * GET /api/extensions/[name]/bundle
 * Serve compiled JS bundle. Compiles on first request and caches.
 */
export const GET = handler(async (_request, context) => {
  const { name } = await (context as { params: Promise<{ name: string }> }).params;

  const extension = await Extension.findById(name);
  if (!extension) {
    return Response.json({ error: "Extension not found" }, { status: 404 });
  }

  const ext = extension as unknown as {
    componentSource: string;
    compiledBundle?: string;
    save: () => Promise<void>;
  };

  // Return cached bundle if available
  if (ext.compiledBundle) {
    return new Response(ext.compiledBundle, {
      headers: { "Content-Type": "application/javascript" },
    });
  }

  // Compile TSX → JS
  try {
    const compiled = await compileExtension(ext.componentSource);
    ext.compiledBundle = compiled;
    await ext.save();

    return new Response(compiled, {
      headers: { "Content-Type": "application/javascript" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Compilation failed";
    return Response.json({ error: message }, { status: 500 });
  }
});
