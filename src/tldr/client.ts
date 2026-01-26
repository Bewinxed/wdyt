/**
 * TldrClient — subprocess wrapper for llm-tldr
 *
 * All commands run via `uvx --from llm-tldr tldr <cmd>`.
 * If uvx is unavailable, errors with install instructions.
 * No fallback path — if tldr fails, the operation fails.
 */

import type {
  TldrStructureEntry,
  TldrImpactResult,
  TldrSemanticResult,
  TldrContextResult,
} from "./types";

const INSTALL_MESSAGE = `llm-tldr requires uv (Python package runner).
Install: curl -LsSf https://astral.sh/uv/install.sh | sh
Then retry your command. wdyt will auto-install llm-tldr via uvx.`;

export class TldrClient {
  private runnerCache: string[] | null = null;

  /**
   * Resolve the runner command.
   * Returns ["uvx", "--from", "llm-tldr", "tldr"] or throws with install message.
   */
  private async resolveRunner(): Promise<string[]> {
    if (this.runnerCache) return this.runnerCache;

    try {
      const proc = Bun.spawn(["which", "uvx"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await proc.exited;
      if (proc.exitCode !== 0) throw new Error("uvx not found");
      this.runnerCache = ["uvx", "--from", "llm-tldr", "tldr"];
      return this.runnerCache;
    } catch {
      throw new Error(INSTALL_MESSAGE);
    }
  }

  /**
   * Run a tldr command and return parsed JSON output.
   */
  private async run<T>(args: string[], cwd?: string): Promise<T> {
    const runner = await this.resolveRunner();
    const cmd = [...runner, ...args];

    try {
      const proc = Bun.spawn(cmd, {
        cwd: cwd || process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        throw new Error(
          `tldr ${args[0]} failed (exit ${exitCode}): ${stderr.trim() || stdout.trim()}`
        );
      }

      return JSON.parse(stdout.trim()) as T;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`tldr ${args[0]} returned invalid JSON`);
      }
      throw error;
    }
  }

  /**
   * Run a tldr command and return raw stdout (non-JSON).
   */
  private async runRaw(args: string[], cwd?: string): Promise<string> {
    const runner = await this.resolveRunner();
    const cmd = [...runner, ...args];

    const proc = Bun.spawn(cmd, {
      cwd: cwd || process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      throw new Error(
        `tldr ${args[0]} failed (exit ${exitCode}): ${stderr.trim() || stdout.trim()}`
      );
    }

    return stdout.trim();
  }

  /**
   * Ensure the project is warmed (indexed).
   * Checks for .tldr/ dir; runs `tldr warm` if missing. Shows progress to stderr.
   */
  async ensureWarmed(projectPath: string): Promise<void> {
    try {
      const exists = await Bun.file(`${projectPath}/.tldr/index.json`).exists();
      if (exists) return;
    } catch {
      // Directory doesn't exist, need to warm
    }

    console.error("Warming llm-tldr index (first run)...");
    await this.runRaw(["warm", projectPath], projectPath);
    console.error("llm-tldr index ready.");
  }

  /**
   * Get AST-based structure of a file.
   * Replaces regex-based codemap and symbol extraction.
   *
   * `tldr structure <path> --json`
   */
  async structure(filePath: string, projectPath?: string): Promise<TldrStructureEntry[]> {
    return this.run<TldrStructureEntry[]>(
      ["structure", filePath, "--json"],
      projectPath
    );
  }

  /**
   * Get call graph impact for a function.
   * Replaces git grep reference finding.
   *
   * `tldr impact <func> <path> --json`
   */
  async impact(functionName: string, projectPath: string): Promise<TldrImpactResult> {
    return this.run<TldrImpactResult>(
      ["impact", functionName, projectPath, "--json"],
      projectPath
    );
  }

  /**
   * Semantic search for related code.
   * Replaces the symbol+grep hints pipeline.
   *
   * `tldr semantic <query> <path> --json`
   */
  async semantic(query: string, projectPath: string): Promise<TldrSemanticResult[]> {
    return this.run<TldrSemanticResult[]>(
      ["semantic", query, projectPath, "--json"],
      projectPath
    );
  }

  /**
   * Get rich context for a function (signature, callers, callees, complexity).
   *
   * `tldr context <func> --project <path> --json`
   */
  async context(functionName: string, projectPath: string): Promise<TldrContextResult> {
    return this.run<TldrContextResult>(
      ["context", functionName, "--project", projectPath, "--json"],
      projectPath
    );
  }

  /**
   * Get cyclomatic complexity for a function in a file.
   * Extracted from `tldr cfg <file> <func> --json`.
   */
  async complexity(file: string, functionName: string, projectPath?: string): Promise<number> {
    const result = await this.run<{ complexity: number }>(
      ["cfg", file, functionName, "--json"],
      projectPath
    );
    return result.complexity;
  }

  /**
   * Check if uvx is available (non-throwing).
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.resolveRunner();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a project has been warmed/indexed.
   */
  async isWarmed(projectPath: string): Promise<boolean> {
    try {
      return await Bun.file(`${projectPath}/.tldr/index.json`).exists();
    } catch {
      return false;
    }
  }
}
