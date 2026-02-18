import type { NextRequest } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";
import { connectDB } from "@/lib/db/connection";
import { SiteConfig } from "@/lib/db/models/SiteConfig";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { encryptValue } from "@/lib/crypto";

const ENV_PATH = join(process.cwd(), ".env.local");

function classifyMongoError(err: unknown): { code: string; detail: string } {
  const message = (err as Error)?.message ?? "";

  // Dig into the topology description for real server errors.
  // MongooseServerSelectionError wraps a TopologyDescription whose servers
  // map contains the actual per-host error strings.
  const reason = (err as Record<string, unknown>)?.reason as
    | { servers?: Map<string, { error?: Error }> }
    | undefined;

  const serverErrors: string[] = [];
  if (reason?.servers) {
    for (const [, desc] of reason.servers) {
      if (desc.error) serverErrors.push(desc.error.message ?? String(desc.error));
    }
  }
  const combined = [message, ...serverErrors].join(" ");

  // Authentication errors come from the individual server handshakes
  if (/authentication|auth failed|SCRAM/i.test(combined)) {
    return {
      code: "AUTH_FAILED",
      detail: "Database authentication failed. Check the username and password in your connection URI.",
    };
  }

  // DNS resolution failures
  if (/ENOTFOUND|getaddrinfo|querySrv/i.test(combined)) {
    return {
      code: "HOST_NOT_FOUND",
      detail: "Could not resolve the database hostname. Check your connection URI.",
    };
  }

  // Connection refused — server exists but won't accept connections
  if (/ECONNREFUSED/i.test(combined)) {
    return {
      code: "CONNECTION_REFUSED",
      detail: "Connection refused by the database server. Make sure MongoDB is running.",
    };
  }

  // TLS / certificate errors
  if (/certificate|CERT|ssl|tls/i.test(combined)) {
    return {
      code: "TLS_ERROR",
      detail: "TLS/SSL error connecting to the database. Check your URI and cluster TLS settings.",
    };
  }

  // Connection timeout / generic MongooseServerSelectionError
  // The generic Atlas message always mentions "whitelist" but the real cause
  // is often a paused cluster, network issue, or firewall — not necessarily IP.
  if (/ServerSelectionError|ETIMEDOUT|ECONNRESET/i.test(combined)) {
    return {
      code: "CONNECTION_TIMEOUT",
      detail: "Could not reach the database server. If using Atlas, check that your cluster is active (free-tier clusters pause after inactivity), your IP is on the access list, and the URI is correct.",
    };
  }

  return {
    code: "CONNECTION_FAILED",
    detail: `Failed to connect to MongoDB: ${message}`,
  };
}

function setEnvVar(content: string, key: string, value: string): string {
  const regex = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;

  if (regex.test(content)) {
    return content.replace(regex, line);
  }

  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  return content + separator + line + "\n";
}

async function writeEnvFile(uri: string, sessionSecret: string, anthropicApiKey?: string) {
  let envContent = "";
  try {
    envContent = await readFile(ENV_PATH, "utf-8");
  } catch {
    // File doesn't exist yet
  }

  envContent = setEnvVar(envContent, "MONGODB_URI", uri);
  envContent = setEnvVar(envContent, "SESSION_SECRET", sessionSecret);
  if (anthropicApiKey) {
    envContent = setEnvVar(envContent, "ANTHROPIC_API_KEY", anthropicApiKey);
  }
  await writeFile(ENV_PATH, envContent, "utf-8");
}

export async function POST(request: NextRequest) {
  try {
    // Check if already set up
    if (process.env.MONGODB_URI) {
      try {
        await connectDB();
        const existing = await SiteConfig.countDocuments();
        if (existing > 0) {
          return Response.json(
            { error: "Setup has already been completed" },
            { status: 409 }
          );
        }
      } catch {
        // DB unreachable — allow re-setup
      }
    }

    const body = await request.json();
    const { mongodbUri, password, atlasPublicKey, atlasPrivateKey, atlasGroupId, anthropicApiKey } = body;

    // Validate password
    if (!password || typeof password !== "string" || password.length < 8) {
      return Response.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Resolve URI
    const uri = mongodbUri || process.env.MONGODB_URI;
    if (!uri) {
      return Response.json(
        { error: "MongoDB connection URI is required" },
        { status: 400 }
      );
    }

    // Auto-generate SESSION_SECRET if not set
    const sessionSecret =
      process.env.SESSION_SECRET || randomBytes(32).toString("hex");

    // Set in current process for immediate use
    process.env.MONGODB_URI = uri;
    process.env.SESSION_SECRET = sessionSecret;
    if (anthropicApiKey) {
      process.env.ANTHROPIC_API_KEY = anthropicApiKey;
    }

    // Connect to DB — validates the URI works
    try {
      await connectDB();
    } catch (err) {
      console.error("[Setup] DB connection failed:", err);
      const { code, detail } = classifyMongoError(err);
      return Response.json({ error: detail, code }, { status: 503 });
    }

    // Check if this DB already has a TARS instance configured
    const existingConfig = await SiteConfig.countDocuments();
    if (existingConfig > 0) {
      // DB already set up — persist env vars so the app can connect,
      // then send the user to login with their existing password.
      await writeEnvFile(uri, sessionSecret, anthropicApiKey);
      return Response.json(
        { existing: true, message: "This database already has TARS configured. Log in with your existing password." },
        { status: 200 }
      );
    }

    // Build SiteConfig document
    const passwordHash = await hashPassword(password);
    const configData: Record<string, string> = { passwordHash };

    if (atlasPublicKey) {
      configData.atlasPublicKey = await encryptValue(atlasPublicKey);
    }
    if (atlasPrivateKey) {
      configData.atlasPrivateKey = await encryptValue(atlasPrivateKey);
    }
    if (atlasGroupId) {
      configData.atlasGroupId = atlasGroupId;
    }
    if (anthropicApiKey) {
      configData.anthropicApiKey = await encryptValue(anthropicApiKey);
    }

    await SiteConfig.create(configData);

    // Log user in immediately
    await createSession();

    // Write .env.local LAST — in dev mode, this triggers a hot reload,
    // so all DB/session work must complete before this point.
    await writeEnvFile(uri, sessionSecret, anthropicApiKey);

    return Response.json({ success: true });
  } catch (err) {
    console.error("[Setup] Error:", err);
    return Response.json(
      { error: "Setup failed. Please try again." },
      { status: 500 }
    );
  }
}
