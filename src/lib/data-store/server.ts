import { z } from "zod/v4";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { connectDB, DataStore } from "@/lib/db";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

export function createDataStoreMcpServer() {
  const dataStoreTool = tool(
    "agent_data",
    `A tool for managing persistent data stores. Agents write structured data, UI reads it. Supports commands: list_stores, query, get, set, delete.

Usage:
- list_stores: List all distinct store namespaces
- query: List docs in a store (optional key filter, limit)
- get: Get a single doc by store + key
- set: Create or upsert a doc (store, key, data)
- delete: Delete a doc by store + key`,
    {
      command: z.enum(["list_stores", "query", "get", "set", "delete"]),
      store: z.string().optional().describe("Store namespace (required for query, get, set, delete)"),
      key: z.string().optional().describe("Document key within the store"),
      data: z.unknown().optional().describe("Data to store (for set command)"),
      limit: z.number().optional().describe("Max docs to return (for query, default 100)"),
    },
    async (args) => {
      try {
        await connectDB();

        switch (args.command) {
          case "list_stores": {
            const stores = await DataStore.distinct("store");
            if (stores.length === 0) {
              return textResult("No data stores exist yet.");
            }
            return textResult(
              `Data stores:\n${(stores as string[]).map((s) => `- ${s}`).join("\n")}`
            );
          }

          case "query": {
            if (!args.store) return errorResult("store is required for query.");
            const limit = args.limit ?? 100;
            const filter: Record<string, unknown> = { store: args.store };
            if (args.key) {
              if (args.key.endsWith("*")) {
                filter.key = {
                  $regex: `^${args.key.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
                };
              } else {
                filter.key = args.key;
              }
            }
            const docs = await DataStore.find(filter)
              .sort({ createdAt: -1 })
              .limit(limit)
              .lean();
            if (docs.length === 0) {
              return textResult(`No docs found in store "${args.store}".`);
            }
            return textResult(JSON.stringify(docs, null, 2));
          }

          case "get": {
            if (!args.store) return errorResult("store is required for get.");
            if (!args.key) return errorResult("key is required for get.");
            const doc = await DataStore.findOne({
              store: args.store,
              key: args.key,
            }).lean();
            if (!doc) {
              return errorResult(
                `No doc found in store "${args.store}" with key "${args.key}".`
              );
            }
            return textResult(JSON.stringify(doc, null, 2));
          }

          case "set": {
            if (!args.store) return errorResult("store is required for set.");
            if (!args.key) return errorResult("key is required for set.");
            if (args.data === undefined) return errorResult("data is required for set.");
            await DataStore.findOneAndUpdate(
              { store: args.store, key: args.key },
              { store: args.store, key: args.key, data: args.data },
              { upsert: true, new: true }
            );
            return textResult(
              `Saved to store "${args.store}" with key "${args.key}".`
            );
          }

          case "delete": {
            if (!args.store) return errorResult("store is required for delete.");
            if (!args.key) return errorResult("key is required for delete.");
            const result = await DataStore.findOneAndDelete({
              store: args.store,
              key: args.key,
            });
            if (!result) {
              return errorResult(
                `No doc found in store "${args.store}" with key "${args.key}".`
              );
            }
            return textResult(
              `Deleted doc from store "${args.store}" with key "${args.key}".`
            );
          }

          default:
            return errorResult(`Unknown command: ${args.command}`);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "An unexpected error occurred.";
        return errorResult(message);
      }
    }
  );

  return createSdkMcpServer({
    name: "tars-data",
    tools: [dataStoreTool],
  });
}
