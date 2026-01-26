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
  RawExtractResult,
  RawImpactResult,
  RawSemanticResult,
  RawCfgResult,
} from "./types";

const INSTALL_MESSAGE = `llm-tldr requires uv (Python package runner).
Install: curl -LsSf https://astral.sh/uv/install.sh | sh
Then retry your command. wdyt will auto-install llm-tldr via uvx.`;

export class TldrClient {
  private runnerCache: string[] | null = null;
  private languagesCache: Map<string, string[]> = new Map();

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
   * Read indexed languages for a project from .tldr/languages.json.
   * Falls back to ["typescript", "python"] if file doesn't exist.
   */
  private async getLanguages(projectPath: string): Promise<string[]> {
    const cached = this.languagesCache.get(projectPath);
    if (cached) return cached;

    try {
      const file = Bun.file(`${projectPath}/.tldr/languages.json`);
      const data = await file.json() as { languages: string[] };
      if (data.languages?.length) {
        this.languagesCache.set(projectPath, data.languages);
        return data.languages;
      }
    } catch {
      // File doesn't exist or is invalid
    }

    const fallback = ["typescript", "python"];
    this.languagesCache.set(projectPath, fallback);
    return fallback;
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
   * Ensure the project is fully indexed.
   * Runs `tldr warm` for call graph and `tldr semantic index` for embeddings.
   */
  async ensureWarmed(projectPath: string): Promise<void> {
    const callGraphExists = await Bun.file(`${projectPath}/.tldr/cache/call_graph.json`).exists().catch(() => false);
    const semanticExists = await Bun.file(`${projectPath}/.tldr/cache/semantic/index.faiss`).exists().catch(() => false);

    if (callGraphExists && semanticExists) return;

    if (!callGraphExists) {
      console.error("Building call graph index...");
      await this.runRaw(["warm", projectPath], projectPath);
      console.error("Call graph ready.");
    }

    if (!semanticExists) {
      console.error("Building semantic index (downloads embedding model on first run)...");
      await this.runRaw(["semantic", "index", projectPath], projectPath);
      console.error("Semantic index ready.");
    }
  }

  /**
   * Get AST-based structure of a single file.
   * Uses `tldr extract <path>` and converts to TldrStructureEntry[].
   */
  async structure(filePath: string, projectPath?: string): Promise<TldrStructureEntry[]> {
    const raw = await this.run<RawExtractResult>(
      ["extract", filePath],
      projectPath
    );

    const entries: TldrStructureEntry[] = [];
    const file = raw.file_path || filePath;

    // Functions
    if (raw.functions) {
      for (const fn of raw.functions) {
        entries.push({
          name: fn.name,
          type: "function",
          file,
          line: fn.line_number,
          signature: fn.signature,
        });
      }
    }

    // Classes and their methods
    if (raw.classes) {
      for (const cls of raw.classes) {
        entries.push({
          name: cls.name,
          type: "class",
          file,
          line: cls.line_number,
          signature: cls.signature,
        });

        if (cls.methods) {
          for (const method of cls.methods) {
            entries.push({
              name: method.name,
              type: "method",
              file,
              line: method.line_number,
              signature: method.signature,
            });
          }
        }
      }
    }

    return entries;
  }

  /**
   * Get call graph impact for a function.
   * Tries each indexed language since `--lang all` doesn't reliably search across languages.
   */
  async impact(functionName: string, projectPath: string): Promise<TldrImpactResult> {
    const languages = await this.getLanguages(projectPath);
    let lastError: string | null = null;

    for (const lang of languages) {
      const raw = await this.run<RawImpactResult>(
        ["impact", functionName, projectPath, "--lang", lang],
        projectPath
      );

      if (raw.error) {
        lastError = raw.error;
        // Only retry with next language if function wasn't found
        if (raw.error.includes("not found")) continue;
        throw new Error(raw.error);
      }

      // Flatten targets into a single callers list (direct callers only)
      const callers: Array<{ name: string; file: string; line: number }> = [];

      for (const target of Object.values(raw.targets)) {
        for (const caller of target.callers) {
          callers.push({
            name: caller.function,
            file: caller.file,
            line: 0, // impact CLI doesn't provide line numbers
          });
        }
      }

      return {
        function: functionName,
        callers,
        callees: [], // impact CLI only provides callers
      };
    }

    throw new Error(lastError || `Function '${functionName}' not found in call graph`);
  }

  /**
   * Semantic search for related code.
   * Uses `tldr semantic search <query> --path <path>`.
   */
  async semantic(query: string, projectPath: string): Promise<TldrSemanticResult[]> {
    const raw = await this.run<RawSemanticResult[]>(
      ["semantic", "search", query, "--path", projectPath],
      projectPath
    );

    return raw.map((r) => ({
      function: r.name,
      file: r.file,
      line: r.line,
      score: r.score,
    }));
  }

  /**
   * Get rich context for a function (text output).
   * Tries each indexed language since default may not find the right one.
   */
  async context(functionName: string, projectPath: string): Promise<TldrContextResult> {
    const languages = await this.getLanguages(projectPath);

    for (const lang of languages) {
      try {
        const result = await this.runRaw(
          ["context", functionName, "--project", projectPath, "--lang", lang],
          projectPath
        );
        // context without the right language returns minimal output like "?:0"
        // Check for a meaningful result (has file location)
        if (result && !result.includes("(?:0)")) {
          return result;
        }
      } catch {
        continue;
      }
    }

    // Final fallback: try without --lang
    return this.runRaw(
      ["context", functionName, "--project", projectPath],
      projectPath
    );
  }

  /**
   * Get cyclomatic complexity for a function in a file.
   * Uses `tldr cfg <file> <func>`.
   */
  async complexity(file: string, functionName: string, projectPath?: string): Promise<number> {
    const result = await this.run<RawCfgResult>(
      ["cfg", file, functionName],
      projectPath
    );
    return result.cyclomatic_complexity;
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
   * Check if a project has been fully indexed (call graph + semantic).
   */
  async isWarmed(projectPath: string): Promise<boolean> {
    try {
      const callGraph = await Bun.file(`${projectPath}/.tldr/cache/call_graph.json`).exists();
      const semantic = await Bun.file(`${projectPath}/.tldr/cache/semantic/index.faiss`).exists();
      return callGraph && semantic;
    } catch {
      return false;
    }
  }
}
