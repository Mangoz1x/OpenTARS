import fs from "fs";
import path from "path";
import { z } from "zod/v4";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { connectDB, Extension, Message, Conversation } from "@/lib/db";
import { getExtensionSourcePath, getExtensionCachePath } from "@/lib/userdata";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

export function createExtensionsMcpServer(conversationId: string) {
  const extensionsTool = tool(
    "extensions",
    `A tool for managing UI extensions. Extensions are TSX components rendered in sandboxed iframes inside the chat. Source files live on disk at userdata/extensions/{name}/component.tsx. Supports commands: list, create, render, delete.

Usage:
- list: List all extensions with their IDs, names, descriptions, and linked stores/scripts
- create: Create or update an extension. If componentSource is provided, writes it to disk. Otherwise validates the disk file exists.
- render: Display an extension inline in the current conversation
- delete: Delete an extension by name (removes DB record + disk files)`,
    {
      command: z.enum(["list", "create", "render", "delete"]),
      name: z.string().optional().describe("Extension name/ID (required for create, render, delete)"),
      displayName: z.string().optional().describe("Human-readable name (for create)"),
      description: z.string().optional().describe("What the extension does (for create)"),
      componentSource: z.string().optional().describe("TSX source code (for create). If omitted, disk file must exist."),
      stores: z.array(z.string()).optional().describe("Data store namespaces this extension reads from"),
      scripts: z.array(z.string()).optional().describe("Script names this extension uses"),
    },
    async (args) => {
      try {
        await connectDB();

        switch (args.command) {
          case "list": {
            const extensions = await Extension.find(
              {},
              { componentSource: 0 }
            )
              .sort({ createdAt: -1 })
              .lean();

            if (extensions.length === 0) {
              return textResult("No extensions exist yet.");
            }

            const list = (
              extensions as Array<{
                _id: string;
                displayName: string;
                description: string;
                stores: string[];
                scripts: string[];
              }>
            ).map((e) => {
              const parts = [`- ${e._id}: ${e.displayName} — ${e.description}`];
              if (e.stores?.length) parts.push(`  stores: ${e.stores.join(", ")}`);
              if (e.scripts?.length) parts.push(`  scripts: ${e.scripts.join(", ")}`);
              return parts.join("\n");
            });

            return textResult(`Extensions:\n${list.join("\n")}`);
          }

          case "create": {
            if (!args.name) return errorResult("name is required for create.");
            if (!args.displayName) return errorResult("displayName is required for create.");
            if (!args.description) return errorResult("description is required for create.");

            const sourcePath = getExtensionSourcePath(args.name);
            const cachePath = getExtensionCachePath(args.name);

            // Write source to disk if provided
            if (args.componentSource) {
              fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
              fs.writeFileSync(sourcePath, args.componentSource);
            } else if (!fs.existsSync(sourcePath)) {
              return errorResult(
                `No componentSource provided and no disk file at ${sourcePath}. Either provide componentSource or write the file first.`
              );
            }

            // Delete stale cache
            if (fs.existsSync(cachePath)) {
              fs.unlinkSync(cachePath);
            }

            // Save metadata to MongoDB
            await Extension.findByIdAndUpdate(
              args.name,
              {
                _id: args.name,
                displayName: args.displayName,
                description: args.description,
                stores: args.stores ?? [],
                scripts: args.scripts ?? [],
                $inc: { version: 1 },
              },
              { upsert: true, new: true }
            );

            return textResult(`Extension "${args.name}" saved. Use \`render\` to display it in the chat.`);
          }

          case "render": {
            if (!args.name) return errorResult("name is required for render.");

            const extension = await Extension.findById(args.name).lean() as {
              _id: string;
              displayName: string;
            } | null;

            if (!extension) {
              return errorResult(`Extension "${args.name}" not found. Use \`list\` to see available extensions.`);
            }

            // Create an extension message in the conversation
            const msg = await Message.create({
              conversationId,
              role: "extension",
              content: "",
              extensionData: {
                extensionId: extension._id,
                displayName: extension.displayName,
              },
            });

            await Conversation.findByIdAndUpdate(conversationId, {
              $inc: { messageCount: 1 },
              $set: { lastMessageAt: msg.timestamp },
            });

            return textResult(
              `Extension "${extension.displayName}" rendered in the conversation.`
            );
          }

          case "delete": {
            if (!args.name) return errorResult("name is required for delete.");

            const result = await Extension.findByIdAndDelete(args.name);
            if (!result) {
              return errorResult(`Extension "${args.name}" not found.`);
            }

            // Clean up disk files
            const sourcePath = getExtensionSourcePath(args.name);
            const sourceDir = path.dirname(sourcePath);
            const cachePath = getExtensionCachePath(args.name);

            if (fs.existsSync(sourceDir)) {
              fs.rmSync(sourceDir, { recursive: true, force: true });
            }
            if (fs.existsSync(cachePath)) {
              fs.unlinkSync(cachePath);
            }

            return textResult(`Extension "${args.name}" deleted.`);
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
    name: "tars-extensions",
    tools: [extensionsTool],
  });
}
