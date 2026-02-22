import fs from "fs";
import path from "path";
import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Extension } from "@/lib/db";
import { getExtensionSourcePath, getExtensionCachePath } from "@/lib/userdata";

const handler = compose(withAuth, withDatabase);

/**
 * GET /api/extensions
 * List all extensions (metadata only, no source/bundle).
 */
export const GET = handler(async () => {
  const extensions = await Extension.find(
    {},
    { componentSource: 0 }
  ).sort({ createdAt: -1 }).lean();
  return Response.json({ extensions });
});

/**
 * POST /api/extensions
 * Create or update an extension.
 * Body: { _id, displayName, description, componentSource?, props?, scripts?, stores? }
 * Either componentSource in body OR disk file at userdata/extensions/{_id}/component.tsx must exist.
 * If componentSource is provided in body, it gets written to disk.
 */
export const POST = handler(async (request) => {
  const body = await request.json();

  if (!body._id || !body.displayName || !body.description) {
    return Response.json(
      { error: "_id, displayName, and description are required" },
      { status: 400 }
    );
  }

  const sourcePath = getExtensionSourcePath(body._id);
  const cachePath = getExtensionCachePath(body._id);

  // If componentSource provided in body, write it to disk
  if (body.componentSource) {
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, body.componentSource);
  } else if (!fs.existsSync(sourcePath)) {
    return Response.json(
      { error: "No source provided and no disk file found at " + sourcePath },
      { status: 400 }
    );
  }

  // Delete stale cache so next bundle request recompiles
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
  }

  // Save metadata to MongoDB (no source code stored)
  const extension = await Extension.findByIdAndUpdate(
    body._id,
    {
      _id: body._id,
      displayName: body.displayName,
      description: body.description,
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
