/**
 * Init command - set up wdyt
 *
 * Usage:
 *   bunx wdyt init              # Interactive setup
 *   bunx wdyt init --rp-alias   # Also create rp-cli alias (skip prompt)
 *   bunx wdyt init --no-alias   # Skip rp-cli alias (no prompt)
 *   bunx wdyt init --global     # Install globally
 */

import { mkdirSync, symlinkSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { $ } from "bun";
import * as readline from "readline";

interface InitOptions {
  rpAlias?: boolean;
  noAlias?: boolean;
  global?: boolean;
}

/**
 * Prompt user for yes/no input
 */
async function promptYesNo(question: string, defaultYes = false): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const hint = defaultYes ? "[Y/n]" : "[y/N]";

  return new Promise((resolve) => {
    rl.question(`${question} ${hint} `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === "") {
        resolve(defaultYes);
      } else {
        resolve(trimmed === "y" || trimmed === "yes");
      }
    });
  });
}

/**
 * Get the data directory path
 */
function getDataDir(): string {
  const xdgDataHome = process.env.XDG_DATA_HOME;
  if (xdgDataHome) {
    return join(xdgDataHome, "wdyt");
  }
  return join(homedir(), ".wdyt");
}

/**
 * Get the bin directory for user installs
 */
function getUserBinDir(): string {
  return join(homedir(), ".local", "bin");
}

/**
 * Check if a command exists in PATH
 */
async function commandExists(cmd: string): Promise<boolean> {
  try {
    await $`which ${cmd}`.quiet();
    return true;
  } catch {
    return false;
  }
}

/**
 * Run the init command
 */
export async function initCommand(options: InitOptions): Promise<{
  success: boolean;
  output?: string;
  error?: string;
}> {
  const lines: string[] = [];
  const dataDir = getDataDir();
  const binDir = getUserBinDir();

  lines.push("🔍 wdyt - Code review context builder for LLMs");
  lines.push("");

  // 1. Create data directory
  lines.push("Setting up data directory...");
  try {
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(join(dataDir, "chats"), { recursive: true });
    lines.push(`  ✓ Created ${dataDir}`);
  } catch (error) {
    return {
      success: false,
      error: `Failed to create data directory: ${error}`,
    };
  }

  // 2. Check if already installed globally
  const alreadyInstalled = await commandExists("wdyt");

  if (alreadyInstalled && !options.global) {
    lines.push("");
    lines.push("✓ wdyt is already available in PATH");
  }

  // 3. Global install if requested
  if (options.global) {
    lines.push("");
    lines.push("Installing globally...");

    try {
      // Ensure bin directory exists
      mkdirSync(binDir, { recursive: true });

      // Get the path to the current executable or script
      const currentExe = process.argv[1];
      const targetPath = join(binDir, "wdyt");

      // Build the binary
      lines.push("  Building binary...");
      const srcDir = join(import.meta.dir, "..");
      await $`bun build ${join(srcDir, "cli.ts")} --compile --outfile ${targetPath}`.quiet();

      lines.push(`  ✓ Installed to ${targetPath}`);

      // Check if ~/.local/bin is in PATH
      const path = process.env.PATH || "";
      if (!path.includes(binDir)) {
        lines.push("");
        lines.push(`⚠️  Add ${binDir} to your PATH:`);
        lines.push(`   echo 'export PATH="${binDir}:$PATH"' >> ~/.bashrc`);
      }
    } catch (error) {
      lines.push(`  ✗ Failed to install: ${error}`);
    }
  }

  // 4. Determine if we should create rp-cli alias
  let shouldCreateAlias = options.rpAlias;

  // If neither --rp-alias nor --no-alias was specified, prompt the user
  if (!options.rpAlias && !options.noAlias) {
    lines.push("");
    console.log(lines.join("\n"));
    lines.length = 0; // Clear lines since we just printed them

    console.log("");
    console.log("The rp-cli alias enables compatibility with flowctl/flow-next.");
    shouldCreateAlias = await promptYesNo("Create rp-cli alias?", true);
  }

  // Create rp-cli alias if requested or confirmed
  if (shouldCreateAlias) {
    lines.push("");
    lines.push("Creating rp-cli alias (for flowctl compatibility)...");

    const rpCliPath = join(binDir, "rp-cli");
    const secondOpinionPath = join(binDir, "wdyt");

    try {
      // Ensure bin directory exists
      mkdirSync(binDir, { recursive: true });

      // Remove existing symlink if present
      if (await Bun.file(rpCliPath).exists()) {
        unlinkSync(rpCliPath);
      }

      // Check if wdyt binary exists
      if (await Bun.file(secondOpinionPath).exists()) {
        symlinkSync(secondOpinionPath, rpCliPath);
        lines.push(`  ✓ Created symlink: rp-cli -> wdyt`);
      } else {
        // If not installed globally, create the binary first
        lines.push("  Building rp-cli binary...");
        const srcDir = join(import.meta.dir, "..");
        await $`bun build ${join(srcDir, "cli.ts")} --compile --outfile ${rpCliPath}`.quiet();
        lines.push(`  ✓ Installed rp-cli to ${rpCliPath}`);
      }
    } catch (error) {
      lines.push(`  ✗ Failed to create alias: ${error}`);
    }
  }

  // 5. Summary
  lines.push("");
  lines.push("Setup complete! 🎉");
  lines.push("");
  lines.push("Usage:");
  lines.push("  wdyt -e 'windows'              # List windows");
  lines.push("  wdyt -w 1 -e 'builder {}'      # Create tab");
  lines.push("  wdyt -w 1 -t <id> -e 'select add file.ts'");
  lines.push("");

  if (!shouldCreateAlias && !options.noAlias) {
    lines.push("Tip: For flowctl/flow-next compatibility, run:");
    lines.push("  bunx wdyt init --rp-alias");
  }

  return {
    success: true,
    output: lines.join("\n"),
  };
}

/**
 * Parse init command arguments
 */
export function parseInitArgs(args: string[]): InitOptions {
  return {
    rpAlias: args.includes("--rp-alias") || args.includes("--rp"),
    noAlias: args.includes("--no-alias") || args.includes("--no-rp"),
    global: args.includes("--global") || args.includes("-g"),
  };
}
