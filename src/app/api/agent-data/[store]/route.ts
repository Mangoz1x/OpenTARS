import { compose } from "@/lib/middleware/compose";
import { withAuth } from "@/lib/middleware/withAuth";
import { withDatabase } from "@/lib/middleware/withDatabase";
import { DataStore } from "@/lib/db";

const handler = compose(withAuth, withDatabase);

/**
 * GET /api/agent-data/[store]
 * List docs in a store. Query params: ?limit=N, ?sort=field, ?key=prefix*
 */
export const GET = handler(async (request, context) => {
  const { store } = await (context as { params: Promise<{ store: string }> }).params;
  const url = new URL(request.url);

  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 1000);
  const sort = url.searchParams.get("sort") ?? "-createdAt";
  const keyFilter = url.searchParams.get("key");

  const filter: Record<string, unknown> = { store };
  if (keyFilter) {
    if (keyFilter.endsWith("*")) {
      filter.key = { $regex: `^${keyFilter.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` };
    } else {
      filter.key = keyFilter;
    }
  }

  const sortObj: Record<string, 1 | -1> = {};
  if (sort.startsWith("-")) {
    sortObj[sort.slice(1)] = -1;
  } else {
    sortObj[sort] = 1;
  }

  const docs = await DataStore.find(filter).sort(sortObj).limit(limit).lean();
  return Response.json({ docs });
});

/**
 * POST /api/agent-data/[store]
 * Create or upsert a doc. Body: { key?, data, createdBy? }
 */
export const POST = handler(async (request, context) => {
  const { store } = await (context as { params: Promise<{ store: string }> }).params;
  const body = await request.json();

  if (body.data === undefined) {
    return Response.json({ error: "data is required" }, { status: 400 });
  }

  if (body.key) {
    const doc = await DataStore.findOneAndUpdate(
      { store, key: body.key },
      { store, key: body.key, data: body.data, createdBy: body.createdBy },
      { upsert: true, new: true }
    ).lean();
    return Response.json({ doc }, { status: 200 });
  }

  const doc = await DataStore.create({
    store,
    data: body.data,
    createdBy: body.createdBy,
  });
  return Response.json({ doc }, { status: 201 });
});
