import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { transform } from "esbuild";
import { connectDB, DataStore, Script } from "@/lib/db";
import { getScriptSourcePath, getScriptCachePath } from "@/lib/userdata";

const SCRIPT_TIMEOUT_MS = 30_000;

// A require() function anchored to this file's location so scripts can
// load any built-in or installed Node module (e.g. require('os')).
const requireFn = createRequire(import.meta.url);

/**
 * Resolve the executable JS code for a script by name.
 * Disk first (with type stripping + caching), then MongoDB fallback.
 */
export async function resolveScriptCode(name: string): Promise<string> {
  const sourcePath = getScriptSourcePath(name);
  const cachePath = getScriptCachePath(name);

  // Disk-first: read .ts file and strip types
  if (fs.existsSync(sourcePath)) {
    const sourceMtime = fs.statSync(sourcePath).mtimeMs;

    // Check cache
    if (fs.existsSync(cachePath)) {
      const cacheMtime = fs.statSync(cachePath).mtimeMs;
      if (cacheMtime > sourceMtime) {
        return fs.readFileSync(cachePath, "utf-8");
      }
    }

    // Strip types with esbuild — use ESM format so top-level await is
    // allowed (the code will be wrapped in an async IIFE at runtime).
    const tsSource = fs.readFileSync(sourcePath, "utf-8");
    const result = await transform(tsSource, {
      loader: "ts",
      format: "esm",
      target: "es2020",
    });

    // Cache the result
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, result.code);

    return result.code;
  }

  // Fallback: read code from MongoDB
  await connectDB();
  const script = await Script.findById(name).lean();
  if (script && (script as { code?: string }).code) {
    return (script as { code: string }).code;
  }

  throw new Error(`Script "${name}" not found — no disk file or DB code`);
}

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
    require: requireFn,
  };

  const fn = new Function(
    "ctx",
    `return (async () => { const { params, dataStore, fetch, require } = ctx; ${code} })()`
  );

  return Promise.race([
    fn(context),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Script timeout")), SCRIPT_TIMEOUT_MS)
    ),
  ]);
}

/**
 * Resolve and execute a script by name.
 */
export async function executeScriptByName(
  name: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const code = await resolveScriptCode(name);
  return executeScript(code, params);
}
