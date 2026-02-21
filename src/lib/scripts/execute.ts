import { connectDB, DataStore } from "@/lib/db";

const SCRIPT_TIMEOUT_MS = 10_000;

/**
 * Execute a script with injected context (params, dataStore, fetch).
 * Uses `new Function()` with a timeout race.
 */
export async function executeScript(
  code: string,
  params: Record<string, unknown>
): Promise<unknown> {
  await connectDB();

  const context = {
    params,
    dataStore: {
      async get(store: string, key: string) {
        const doc = await DataStore.findOne({ store, key }).lean();
        return doc ? (doc as { data: unknown }).data : null;
      },
      async set(store: string, key: string, data: unknown) {
        await DataStore.findOneAndUpdate(
          { store, key },
          { store, key, data },
          { upsert: true, new: true }
        );
      },
      async query(store: string, opts?: { limit?: number; sort?: string }) {
        const limit = opts?.limit ?? 100;
        const sortField = opts?.sort ?? "-createdAt";
        const sortObj: Record<string, 1 | -1> = {};
        if (sortField.startsWith("-")) {
          sortObj[sortField.slice(1)] = -1;
        } else {
          sortObj[sortField] = 1;
        }
        const docs = await DataStore.find({ store }).sort(sortObj).limit(limit).lean();
        return (docs as Array<{ key?: string; data: unknown }>).map((d) => ({
          key: d.key,
          data: d.data,
        }));
      },
      async delete(store: string, key: string) {
        await DataStore.findOneAndDelete({ store, key });
      },
    },
    fetch,
  };

  const fn = new Function(
    "ctx",
    `return (async () => { const { params, dataStore, fetch } = ctx; ${code} })()`
  );

  return Promise.race([
    fn(context),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Script timeout")), SCRIPT_TIMEOUT_MS)
    ),
  ]);
}
