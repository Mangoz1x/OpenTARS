import mongoose from "mongoose";
import { getPrivateIps } from "./network.js";
import { log } from "./logger.js";

let intervalId: ReturnType<typeof setInterval> | null = null;

/** Writes network info + heartbeat to the Agent document every 60s. */
export function startHeartbeat(agentId: string, port: number): void {
  const beat = async () => {
    try {
      const ips = getPrivateIps();
      await mongoose.connection.collection("agents").updateOne(
        { _id: agentId } as Record<string, unknown>,
        {
          $set: {
            isOnline: true,
            lastHeartbeat: new Date(),
            "network.privateIps": ips,
            "network.port": port,
          },
        }
      );
    } catch (err) {
      log.warn(
        "Heartbeat failed: " + (err instanceof Error ? err.message : err)
      );
    }
  };

  // Immediate first beat
  beat();
  intervalId = setInterval(beat, 60_000);
}

export async function stopHeartbeat(agentId: string): Promise<void> {
  if (intervalId) clearInterval(intervalId);
  try {
    await mongoose.connection.collection("agents").updateOne(
      { _id: agentId } as Record<string, unknown>,
      { $set: { isOnline: false } }
    );
  } catch {
    // shutting down, best effort
  }
}
