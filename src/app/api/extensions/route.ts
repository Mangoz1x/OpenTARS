import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Extension } from "@/lib/db";

const handler = compose(withAuth, withDatabase);

/**
 * GET /api/extensions
 * List all extensions (metadata only, no source/bundle).
 */
export const GET = handler(async () => {
  const extensions = await Extension.find(
    {},
    { componentSource: 0, compiledBundle: 0 }
  ).sort({ createdAt: -1 }).lean();
  return Response.json({ extensions });
});

/**
 * POST /api/extensions
 * Create or update an extension.
 * Body: { _id, displayName, description, componentSource, props?, scripts?, stores? }
 */
export const POST = handler(async (request) => {
  const body = await request.json();

  if (!body._id || !body.displayName || !body.description || !body.componentSource) {
    return Response.json(
      { error: "_id, displayName, description, and componentSource are required" },
      { status: 400 }
    );
  }

  // Clear compiledBundle on update so it gets recompiled on next bundle request
  const extension = await Extension.findByIdAndUpdate(
    body._id,
    {
      _id: body._id,
      displayName: body.displayName,
      description: body.description,
      componentSource: body.componentSource,
      compiledBundle: null,
      props: body.props,
      scripts: body.scripts ?? [],
      stores: body.stores ?? [],
      createdBy: body.createdBy,
      $inc: { version: 1 },
    },
    { upsert: true, new: true }
  ).lean();

  return Response.json({ extension }, { status: 200 });
});
