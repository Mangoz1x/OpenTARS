import type { NextRequest } from "next/server";
import { setupAtlasCluster } from "@/lib/atlas/setup";

export async function POST(request: NextRequest) {
  try {
    const { publicKey, privateKey } = await request.json();

    if (!publicKey || !privateKey) {
      return Response.json(
        { error: "Both public and private API keys are required" },
        { status: 400 }
      );
    }

    const result = await setupAtlasCluster({
      publicKey,
      privateKey,
    });

    return Response.json({
      mongodbUri: result.mongodbUri,
      groupId: result.groupId,
    });
  } catch (err) {
    const error = err as Error & { status?: number };

    if (error.status === 401) {
      return Response.json(
        { error: "Invalid Atlas API keys. Check your public and private key and try again." },
        { status: 401 }
      );
    }

    return Response.json(
      { error: error.message || "Atlas cluster setup failed" },
      { status: 500 }
    );
  }
}
