import { z } from "zod/v4";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { connectDB, Script } from "@/lib/db";
import { executeScript } from "./execute";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

export function createScriptsMcpServer() {
  const scriptsTool = tool(
    "scripts",
    `A tool for managing and running shared scripts. Scripts are reusable JavaScript functions stored in the database. Any agent can create, and any agent can invoke. Supports commands: list, create, run, delete.

Usage:
- list: List all scripts (name, description, params)
- create: Create or update a script (name, description, code, params)
- run: Invoke a script with params, returns the result
- delete: Delete a script by name`,
    {
      command: z.enum(["list", "create", "run", "delete"]),
      name: z.string().optional().describe("Script name/ID (required for create, run, delete)"),
      description: z.string().optional().describe("Script description (for create)"),
      code: z.string().optional().describe("JavaScript source code (for create)"),
      params_schema: z
        .array(
          z.object({
            name: z.string(),
            type: z.string().optional(),
            required: z.boolean().optional(),
            description: z.string().optional(),
          })
        )
        .optional()
        .describe("Parameter definitions (for create)"),
      params: z.record(z.string(), z.unknown()).optional().describe("Parameters to pass when running a script"),
    },
    async (args) => {
      try {
        await connectDB();

        switch (args.command) {
          case "list": {
            const scripts = await Script.find({}, { code: 0 })
              .sort({ createdAt: -1 })
              .lean();
            if (scripts.length === 0) {
              return textResult("No scripts exist yet.");
            }
            const list = (
              scripts as Array<{
                _id: string;
                name: string;
                description: string;
                params: Array<{ name: string; type?: string; required?: boolean }>;
              }>
            ).map((s) => {
              const paramStr =
                s.params.length > 0
                  ? ` (params: ${s.params.map((p) => `${p.name}${p.required ? "*" : ""}`).join(", ")})`
                  : "";
              return `- ${s._id}: ${s.description}${paramStr}`;
            });
            return textResult(`Scripts:\n${list.join("\n")}`);
          }

          case "create": {
            if (!args.name) return errorResult("name is required for create.");
            if (!args.description) return errorResult("description is required for create.");
            if (!args.code) return errorResult("code is required for create.");

            await Script.findByIdAndUpdate(
              args.name,
              {
                _id: args.name,
                name: args.name,
                description: args.description,
                code: args.code,
                params: args.params_schema ?? [],
                $inc: { version: 1 },
              },
              { upsert: true, new: true }
            );
            return textResult(`Script "${args.name}" saved.`);
          }

          case "run": {
            if (!args.name) return errorResult("name is required for run.");

            const script = await Script.findById(args.name).lean();
            if (!script) {
              return errorResult(`Script "${args.name}" not found.`);
            }

            const result = await executeScript(
              (script as { code: string }).code,
              args.params ?? {}
            );
            return textResult(
              typeof result === "string" ? result : JSON.stringify(result, null, 2)
            );
          }

          case "delete": {
            if (!args.name) return errorResult("name is required for delete.");

            const result = await Script.findByIdAndDelete(args.name);
            if (!result) {
              return errorResult(`Script "${args.name}" not found.`);
            }
            return textResult(`Script "${args.name}" deleted.`);
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
    name: "tars-scripts",
    tools: [scriptsTool],
  });
}
