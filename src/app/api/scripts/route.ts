import fs from "fs";
import path from "path";
import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { Script } from "@/lib/db";
import { getScriptSourcePath, getScriptCachePath } from "@/lib/userdata";

const handler = compose(withAuth, withDatabase);

/**
 * GET /api/scripts
 * List all scripts (metadata only, no code).
 */
export const GET = handler(async () => {
  const scripts = await Script.find(
    {},
    { code: 0 }
  ).sort({ createdAt: -1 }).lean();
  return Response.json({ scripts });
});

/**
 * POST /api/scripts
 * Create or update a script.
 * Body: { _id, name, description, code?, params?, createdBy? }
 * Either code in body OR disk file at userdata/scripts/{_id}.ts must exist.
 * If code is provided in body, it gets written to disk.
 */
export const POST = handler(async (request) => {
  const body = await request.json();

  if (!body._id || !body.name || !body.description) {
    return Response.json(
      { error: "_id, name, and description are required" },
      { status: 400 }
    );
  }

  const sourcePath = getScriptSourcePath(body._id);
  const cachePath = getScriptCachePath(body._id);

  // If code provided in body, write it to disk
  if (body.code) {
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, body.code);
  } else if (!fs.existsSync(sourcePath)) {
    return Response.json(
      { error: "No code provided and no disk file found at " + sourcePath },
      { status: 400 }
    );
  }

  // Delete stale cache
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
  }

  // Save metadata to MongoDB (no code stored)
  const script = await Script.findByIdAndUpdate(
    body._id,
    {
      _id: body._id,
      name: body.name,
      description: body.description,
      params: body.params ?? [],
      createdBy: body.createdBy,
      $inc: { version: 1 },
    },
    { upsert: true, new: true }
  ).lean();

  return Response.json({ script }, { status: 200 });
});
