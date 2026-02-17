import type { NextRequest } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { withRateLimit } from "@/lib/middleware/withRateLimit";

async function handler(request: NextRequest) {
  const body = await request.json();
  const { password } = body;

  if (!password || !verifyPassword(password)) {
    return Response.json(
      { error: "Invalid password" },
      { status: 401 }
    );
  }

  await createSession();

  return Response.json({ success: true });
}

export const POST = withRateLimit(handler, { windowMs: 60 * 1000, max: 5 });
