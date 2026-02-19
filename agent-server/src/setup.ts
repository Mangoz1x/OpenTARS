import readline from "readline/promises";
import chalk from "chalk";
import { bootstrap, type AgentConfig } from "./bootstrap.js";
import { log, printBanner } from "./logger.js";

/**
 * Strip an env-var prefix from a pasted value.
 * Accepts both "VALUE" and "KEY=VALUE" formats.
 */
function stripEnvPrefix(input: string, key: string): string {
  const trimmed = input.trim();
  const prefix = `${key}=`;
  if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length);
  return trimmed;
}

async function main() {
  printBanner();

  // Check if already configured
  let existing: AgentConfig | null = null;
  try {
    existing = await bootstrap({ silent: true });
  } catch {
    // No config — expected, continue to interactive setup
  }

  if (existing) {
    log.success(`Already configured as: ${existing.agentId}`);
    console.log(`  ${chalk.dim("Run")} ${chalk.cyan("npm run dev")} ${chalk.dim("to start the agent.")}`);
    console.log();
    process.exit(0);
  }

  console.log(`  ${chalk.dim("Paste the values from the TARS settings page.")}`);
  console.log(`  ${chalk.dim("Accepts plain values or KEY=VALUE format.")}`);
  console.log();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    while (true) {
      const rawToken = await rl.question(`  ${chalk.cyan("Setup token: ")}`);
      const token = stripEnvPrefix(rawToken, "TARS_SETUP_TOKEN");

      if (!token) {
        log.warn("Setup token cannot be empty.");
        continue;
      }

      const rawUrl = await rl.question(`  ${chalk.cyan("TARS URL:    ")}`);
      const url = stripEnvPrefix(rawUrl, "TARS_URL").replace(/\/$/, "");

      if (!url) {
        log.warn("TARS URL cannot be empty.");
        continue;
      }

      console.log();

      // Set env vars so bootstrap's registration path kicks in
      process.env.TARS_SETUP_TOKEN = token;
      process.env.TARS_URL = url;

      try {
        await bootstrap();
        console.log();
        console.log(`  ${chalk.dim("Run")} ${chalk.cyan("npm run dev")} ${chalk.dim("to start the agent.")}`);
        console.log();
        process.exit(0);
      } catch (err) {
        // Clear env vars so the next attempt goes through interactive again
        delete process.env.TARS_SETUP_TOKEN;
        delete process.env.TARS_URL;

        const msg = err instanceof Error ? err.message : String(err);
        log.error(msg);
        console.log(`  ${chalk.dim("Try again, or press Ctrl+C to exit.")}`);
        console.log();
      }
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
