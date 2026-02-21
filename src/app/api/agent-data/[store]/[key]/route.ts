import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { DataStore } from "@/lib/db";

const handler = compose(withAuth, withDatabase);

/**
 * GET /api/agent-data/[store]/[key]
 * Get a single doc by store + key.
 */
export const GET = handler(async (_request, context) => {
  const { store, key } = await (
    context as { params: Promise<{ store: string; key: string }> }
  ).params;

  const doc = await DataStore.findOne({ store, key }).lean();
  if (!doc) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ doc });
});

/**
 * PATCH /api/agent-data/[store]/[key]
 * Merge-update the data field.
 */
export const PATCH = handler(async (request, context) => {
  const { store, key } = await (
    context as { params: Promise<{ store: string; key: string }> }
  ).params;
  const body = await request.json();

  if (body.data === undefined) {
    return Response.json({ error: "data is required" }, { status: 400 });
  }

  // Build $set for each key in body.data to merge instead of replace
  const setFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body.data as Record<string, unknown>)) {
    setFields[`data.${k}`] = v;
  }

  const doc = await DataStore.findOneAndUpdate(
    { store, key },
    { $set: setFields },
    { new: true }
  ).lean();

  if (!doc) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ doc });
});

/**
 * DELETE /api/agent-data/[store]/[key]
 * Delete a doc by store + key.
 */
export const DELETE = handler(async (_request, context) => {
  const { store, key } = await (
    context as { params: Promise<{ store: string; key: string }> }
  ).params;

  const result = await DataStore.findOneAndDelete({ store, key });
  if (!result) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ success: true });
});
