import { z } from "zod/v4";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { Memory } from "../db/models/Memory.js";

const MAX_FILE_SIZE = 100 * 1024; // 100KB
const MAX_FILES = 200;
const MEMORIES_ROOT = "/memories";

function validatePath(inputPath: string): string {
  if (/\.\.|%2e%2e/i.test(inputPath)) {
    throw new Error("Path traversal is not allowed.");
  }

  const normalized = inputPath.replace(/\/+/g, "/").replace(/\/$/, "") || "/";

  if (normalized !== MEMORIES_ROOT && !normalized.startsWith(MEMORIES_ROOT + "/")) {
    throw new Error(`All paths must be within ${MEMORIES_ROOT}.`);
  }

  return normalized;
}

function addLineNumbers(content: string): string {
  return content
    .split("\n")
    .map((line, i) => `${String(i + 1).padStart(4, " ")}\t${line}`)
    .join("\n");
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

export function createMemoryMcpServer() {
  const memoryTool = tool(
    "memory",
    `A tool for managing persistent memory across conversations. Supports commands: view, create, str_replace, insert, delete, rename.

Usage:
- view: View a file's contents or list a directory's contents (2 levels deep)
- create: Create a new file with content
- str_replace: Replace a specific string in a file
- insert: Insert text at a specific line number in a file
- delete: Delete a file or directory
- rename: Rename/move a file or directory`,
    {
      command: z.enum(["view", "create", "str_replace", "insert", "delete", "rename"]),
      path: z.string().describe("File or directory path (must be within /memories)"),
      content: z.string().optional().describe("File content (for create command)"),
      old_str: z.string().optional().describe("String to replace (for str_replace)"),
      new_str: z.string().optional().describe("Replacement string (for str_replace)"),
      insert_line: z.number().optional().describe("Line number to insert at (for insert)"),
      new_content: z.string().optional().describe("Text to insert (for insert)"),
      new_path: z.string().optional().describe("New path (for rename)"),
    },
    async (args) => {
      try {
        const path = validatePath(args.path);

        switch (args.command) {
          case "view": {
            const file = await Memory.findOne({ path }).lean();
            if (file) {
              const doc = file as { path: string; content: string; size: number };
              return textResult(addLineNumbers(doc.content));
            }

            const prefix = path === MEMORIES_ROOT ? MEMORIES_ROOT + "/" : path + "/";
            const docs = await Memory.find(
              { path: { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` } },
              { path: 1, size: 1 }
            ).lean();

            if (docs.length === 0) {
              return textResult(`Directory ${path} is empty or does not exist.`);
            }

            const depth = path.split("/").filter(Boolean).length;
            const entries = (docs as Array<{ path: string; size: number }>)
              .filter((d) => {
                const parts = d.path.split("/").filter(Boolean);
                return parts.length <= depth + 2;
              })
              .map((d) => `${d.path} (${d.size} bytes)`)
              .join("\n");

            return textResult(entries || `Directory ${path} is empty.`);
          }

          case "create": {
            const content = args.content ?? "";
            const size = Buffer.byteLength(content, "utf-8");

            if (size > MAX_FILE_SIZE) {
              return errorResult(`File exceeds maximum size of ${MAX_FILE_SIZE} bytes.`);
            }

            const count = await Memory.countDocuments();
            if (count >= MAX_FILES) {
              return errorResult(`Maximum number of files (${MAX_FILES}) reached. Delete some files first.`);
            }

            const existing = await Memory.findOne({ path });
            if (existing) {
              return errorResult(`File already exists at ${path}. Use str_replace to modify it.`);
            }

            await Memory.create({ path, content, size });
            return textResult(`Created file at ${path} (${size} bytes).`);
          }

          case "str_replace": {
            if (!args.old_str) return errorResult("old_str is required for str_replace.");
            if (args.new_str === undefined) return errorResult("new_str is required for str_replace.");

            const file = await Memory.findOne({ path });
            if (!file) return errorResult(`File not found: ${path}`);

            const doc = file as unknown as { content: string; size: number; save: () => Promise<void> };
            const occurrences = doc.content.split(args.old_str).length - 1;

            if (occurrences === 0) {
              return errorResult(`old_str not found in ${path}. Make sure it matches exactly, including whitespace.`);
            }
            if (occurrences > 1) {
              return errorResult(`old_str appears ${occurrences} times in ${path}. Include more context to make it unique.`);
            }

            const newContent = doc.content.replace(args.old_str, args.new_str);
            const newSize = Buffer.byteLength(newContent, "utf-8");

            if (newSize > MAX_FILE_SIZE) {
              return errorResult(`Resulting file would exceed maximum size of ${MAX_FILE_SIZE} bytes.`);
            }

            doc.content = newContent;
            doc.size = newSize;
            await doc.save();
            return textResult(`Replaced text in ${path}. New size: ${newSize} bytes.`);
          }

          case "insert": {
            if (args.insert_line === undefined) return errorResult("insert_line is required for insert.");
            if (!args.new_content) return errorResult("new_content is required for insert.");

            const file = await Memory.findOne({ path });
            if (!file) return errorResult(`File not found: ${path}`);

            const doc = file as unknown as { content: string; size: number; save: () => Promise<void> };
            const lines = doc.content.split("\n");
            const line = Math.max(0, Math.min(args.insert_line, lines.length));

            lines.splice(line, 0, args.new_content);
            const newContent = lines.join("\n");
            const newSize = Buffer.byteLength(newContent, "utf-8");

            if (newSize > MAX_FILE_SIZE) {
              return errorResult(`Resulting file would exceed maximum size of ${MAX_FILE_SIZE} bytes.`);
            }

            doc.content = newContent;
            doc.size = newSize;
            await doc.save();
            return textResult(`Inserted text at line ${line} in ${path}. New size: ${newSize} bytes.`);
          }

          case "delete": {
            const file = await Memory.findOneAndDelete({ path });
            if (file) {
              return textResult(`Deleted file: ${path}`);
            }

            const prefix = path + "/";
            const result = await Memory.deleteMany({
              path: { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` },
            });

            if (result.deletedCount > 0) {
              return textResult(`Deleted ${result.deletedCount} file(s) under ${path}.`);
            }

            return errorResult(`Nothing found at ${path}.`);
          }

          case "rename": {
            if (!args.new_path) return errorResult("new_path is required for rename.");

            const newPath = validatePath(args.new_path);

            const existing = await Memory.findOne({ path: newPath });
            if (existing) {
              return errorResult(`Destination already exists: ${newPath}`);
            }

            const file = await Memory.findOne({ path });
            if (!file) return errorResult(`File not found: ${path}`);

            const doc = file as unknown as { path: string; save: () => Promise<void> };
            doc.path = newPath;
            await doc.save();
            return textResult(`Renamed ${path} → ${newPath}`);
          }

          default:
            return errorResult(`Unknown command: ${args.command}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "An unexpected error occurred.";
        return errorResult(message);
      }
    }
  );

  return createSdkMcpServer({
    name: "tars-memory",
    tools: [memoryTool],
  });
}
