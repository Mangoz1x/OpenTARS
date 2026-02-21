export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startLocalAgent } = await import("@/lib/agents/local-agent");
    await startLocalAgent();
  }
}
