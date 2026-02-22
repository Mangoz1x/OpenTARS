import { spawn, type ChildProcess } from "child_process";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { connectDB, Agent, Archetype, SiteConfig } from "@/lib/db";
import { extensionBuilderArchetype } from "./seed/extension-builder";

const AGENT_ID = "tars-local";
const AGENT_PORT = 4001;
const AGENT_SERVER_DIR = path.join(process.cwd(), "agent-server");
const PREFIX = "[Local Agent]";

// --- globalThis dedup (same pattern as connection.ts) ---

interface LocalAgentState {
  process: ChildProcess | null;
  pid: number | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __tarsLocalAgent: LocalAgentState | undefined;
}

const state: LocalAgentState = globalThis.__tarsLocalAgent ?? {
  process: null,
  pid: null,
};
globalThis.__tarsLocalAgent = state;

// --- Helpers ---

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getSpawnCommand(): { command: string; args: string[] } {
  const distEntry = path.join(AGENT_SERVER_DIR, "dist", "index.js");
  if (fs.existsSync(distEntry)) {
    return { command: "node", args: [distEntry] };
  }
  // Dev mode — use tsx from agent-server's node_modules
  const tsx = path.join(AGENT_SERVER_DIR, "node_modules", ".bin", "tsx");
  return { command: tsx, args: [path.join(AGENT_SERVER_DIR, "src", "index.ts")] };
}

async function ensureAgentDoc(): Promise<string> {
  const userdataDir =
    process.env.TARS_USERDATA_DIR || path.join(process.cwd(), "userdata");

  // Ensure all userdata directories exist
  fs.mkdirSync(path.join(userdataDir, "extensions"), { recursive: true });
  fs.mkdirSync(path.join(userdataDir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(userdataDir, "cache", "extensions"), { recursive: true });
  fs.mkdirSync(path.join(userdataDir, "cache", "scripts"), { recursive: true });

  let doc = await Agent.findById(AGENT_ID);

  if (!doc) {
    const apiKey = crypto.randomBytes(32).toString("hex");
    doc = await Agent.create({
      _id: AGENT_ID,
      name: "TARS Local Agent",
      url: `http://localhost:${AGENT_PORT}`,
      apiKey,
      archetypes: ["extension-builder"],
      preferredArchetype: "extension-builder",
      capabilities: ["code", "extensions", "frontend", "backend", "integration"],
      isLocal: true,
      autoStart: true,
      defaultCwd: userdataDir,
    });
    console.log(`${PREFIX} Created agent doc (new apiKey generated)`);
  } else {
    // Update fields that may have changed
    await Agent.updateOne(
      { _id: AGENT_ID },
      {
        $set: {
          name: "TARS Local Agent",
          url: `http://localhost:${AGENT_PORT}`,
          archetypes: ["extension-builder"],
          preferredArchetype: "extension-builder",
          capabilities: [
            "code",
            "extensions",
            "frontend",
            "backend",
            "integration",
          ],
          isLocal: true,
          autoStart: true,
          defaultCwd: userdataDir,
        },
      }
    );
  }

  return (doc.apiKey as string) ?? (await Agent.findById(AGENT_ID)).apiKey;
}

async function ensureArchetype(): Promise<void> {
  const existing = await Archetype.findById(extensionBuilderArchetype._id).lean() as { version?: number } | null;
  if (!existing) {
    await Archetype.create(extensionBuilderArchetype);
    console.log(`${PREFIX} Seeded extension-builder archetype`);
  } else if ((existing.version ?? 0) < (extensionBuilderArchetype.version ?? 0)) {
    await Archetype.findByIdAndUpdate(extensionBuilderArchetype._id, {
      $set: {
        systemPrompt: extensionBuilderArchetype.systemPrompt,
        description: extensionBuilderArchetype.description,
        examples: extensionBuilderArchetype.examples,
        defaultMaxTurns: extensionBuilderArchetype.defaultMaxTurns,
        defaultMaxBudgetUsd: extensionBuilderArchetype.defaultMaxBudgetUsd,
        version: extensionBuilderArchetype.version,
      },
    });
    console.log(`${PREFIX} Updated extension-builder archetype to v${extensionBuilderArchetype.version}`);
  }
}

// --- Shutdown ---

let shutdownRegistered = false;

function registerShutdown(): void {
  if (shutdownRegistered) return;
  shutdownRegistered = true;

  const cleanup = () => {
    if (state.process && state.pid && isProcessAlive(state.pid)) {
      console.log(`${PREFIX} Stopping child process (pid: ${state.pid})...`);
      state.process.kill("SIGTERM");

      // Force kill after 5s
      setTimeout(() => {
        if (state.pid && isProcessAlive(state.pid)) {
          console.log(`${PREFIX} Force killing (pid: ${state.pid})`);
          process.kill(state.pid, "SIGKILL");
        }
      }, 5000).unref();
    }
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
  process.on("exit", cleanup);
}

// --- Main ---

export async function startLocalAgent(): Promise<void> {
  // Opt-out
  if (process.env.TARS_LOCAL_AGENT_DISABLED === "true") {
    console.log(`${PREFIX} Disabled via TARS_LOCAL_AGENT_DISABLED`);
    return;
  }

  // Already running (survives hot reload)
  if (state.pid && isProcessAlive(state.pid)) {
    console.log(`${PREFIX} Already running (pid: ${state.pid})`);
    return;
  }

  // Need MONGODB_URI to proceed
  if (!process.env.MONGODB_URI) {
    console.log(`${PREFIX} Skipped — no MONGODB_URI (setup not complete)`);
    return;
  }

  console.log(`${PREFIX} Starting...`);

  try {
    await connectDB();
  } catch (err) {
    console.error(`${PREFIX} Failed to connect to DB:`, err);
    return;
  }

  // Resolve the Anthropic API key: env var first, then SiteConfig in DB
  let anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    try {
      const config = await SiteConfig.findOne();
      anthropicApiKey = config?.anthropicApiKey ?? undefined;
    } catch {
      // SiteConfig may not exist yet
    }
  }

  if (!anthropicApiKey) {
    console.log(`${PREFIX} Skipped — no ANTHROPIC_API_KEY available (setup not complete)`);
    return;
  }

  // Seed DB
  let authToken: string;
  try {
    authToken = await ensureAgentDoc();
    await ensureArchetype();
  } catch (err) {
    console.error(`${PREFIX} Failed to seed DB:`, err);
    return;
  }

  // Spawn child process
  const { command, args } = getSpawnCommand();
  const child = spawn(command, args, {
    cwd: AGENT_SERVER_DIR,
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: anthropicApiKey,
      MONGODB_URI: process.env.MONGODB_URI,
      AGENT_AUTH_TOKEN: authToken,
      AGENT_ID: AGENT_ID,
      AGENT_NAME: "TARS Local Agent",
      PORT: String(AGENT_PORT),
      TARS_URL: "http://localhost:3000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  state.process = child;
  state.pid = child.pid ?? null;

  console.log(`${PREFIX} Spawned (pid: ${state.pid})`);

  // Pipe output with prefix
  child.stdout?.on("data", (data: Buffer) => {
    const lines = data.toString().trimEnd().split("\n");
    for (const line of lines) {
      console.log(`${PREFIX} ${line}`);
    }
  });

  child.stderr?.on("data", (data: Buffer) => {
    const lines = data.toString().trimEnd().split("\n");
    for (const line of lines) {
      console.error(`${PREFIX} ${line}`);
    }
  });

  child.on("exit", (code, signal) => {
    console.log(
      `${PREFIX} Process exited (code: ${code}, signal: ${signal})`
    );
    state.process = null;
    state.pid = null;
  });

  child.on("error", (err) => {
    console.error(`${PREFIX} Spawn error:`, err);
    state.process = null;
    state.pid = null;
  });

  registerShutdown();
}
