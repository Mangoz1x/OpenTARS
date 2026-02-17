import type { NextRequest } from "next/server";

type RouteHandler = (request: NextRequest, context?: unknown) => Promise<Response>;

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
}

interface RateLimitEntry {
  start: number;
  count: number;
}

const store = new Map<string, RateLimitEntry>();

const DEFAULT_OPTIONS: Required<RateLimitOptions> = {
  windowMs: 60 * 1000,
  max: 60,
};

function cleanupExpired(windowMs: number) {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.start > windowMs) {
      store.delete(key);
    }
  }
}

export function withRateLimit(handler: RouteHandler, options: RateLimitOptions = {}): RouteHandler {
  const { windowMs, max } = { ...DEFAULT_OPTIONS, ...options };

  return async (request: NextRequest, context?: unknown) => {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const now = Date.now();
    const key = ip;
    const entry = store.get(key);

    if (!entry || now - entry.start > windowMs) {
      store.set(key, { start: now, count: 1 });
    } else {
      entry.count++;
      if (entry.count > max) {
        return Response.json(
          { error: "Too many requests" },
          { status: 429 }
        );
      }
    }

    if (store.size > 1000) {
      cleanupExpired(windowMs);
    }

    return handler(request, context);
  };
}
