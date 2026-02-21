import chalk from "chalk";

const tag = chalk.bold.cyan("TARS");

let debugEnabled = false;

/** Call once at startup to enable/disable debug logging. */
export function initLogger(debug: boolean) {
  debugEnabled = debug;
}

function timestamp(): string {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

export const log = {
  info: (msg: string) => console.log(`  ${tag} ${msg}`),
  success: (msg: string) => console.log(`  ${tag} ${chalk.green("✓")} ${msg}`),
  warn: (msg: string) => console.log(`  ${tag} ${chalk.yellow("⚠")} ${msg}`),
  error: (msg: string) => console.error(`  ${tag} ${chalk.red("✗")} ${msg}`),
  dim: (msg: string) => console.log(`  ${tag} ${chalk.dim(msg)}`),
  detail: (label: string, value: string) =>
    console.log(`  ${tag}   ${chalk.dim(label)} ${value}`),
  debug: (msg: string) => {
    if (debugEnabled) {
      console.log(`  ${tag} ${chalk.dim(timestamp())} ${chalk.dim(msg)}`);
    }
  },
};

/**
 * Print a clean startup banner.
 */
export function printBanner() {
  console.log();
  console.log(`  ${chalk.bold.cyan("TARS Agent Server")}`);
  console.log();
}

/**
 * Print a nicely-formatted fatal error and exit hints.
 * Replaces raw stack traces for known startup failures.
 */
export function printStartupError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);

  console.log();
  console.log(`  ${chalk.red.bold("Startup failed")}`);
  console.log();

  if (message.includes("No configuration found")) {
    console.log(`  ${chalk.dim("No configuration found. Use one of these methods:")}`);
    console.log();
    console.log(`  ${chalk.white("1.")} ${chalk.bold("Interactive setup")} ${chalk.dim("(recommended)")}`);
    console.log(`     Run ${chalk.cyan("npm run setup")} and paste the token from the TARS settings page.`);
    console.log();
    console.log(`  ${chalk.white("2.")} ${chalk.bold("Environment variables")}`);
    console.log(`     Set ${chalk.cyan("TARS_SETUP_TOKEN")} and ${chalk.cyan("TARS_URL")}, then restart.`);
    console.log();
    console.log(`  ${chalk.white("3.")} ${chalk.bold("Manual configuration")}`);
    console.log(`     Set ${chalk.cyan("MONGODB_URI")}, ${chalk.cyan("ANTHROPIC_API_KEY")}, and ${chalk.cyan("AGENT_AUTH_TOKEN")}.`);
  } else if (message.includes("Registration failed")) {
    console.log(`  ${chalk.red(message)}`);
    console.log();
    console.log(`  ${chalk.dim("Check that TARS_URL is correct and the TARS app is running.")}`);
  } else {
    // Unknown error — show message + stack for debugging
    console.log(`  ${chalk.red(message)}`);
    if (err instanceof Error && err.stack) {
      console.log();
      const stackLines = err.stack.split("\n").slice(1, 5);
      for (const line of stackLines) {
        console.log(`  ${chalk.dim(line.trim())}`);
      }
    }
  }

  console.log();
}
