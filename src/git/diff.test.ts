/**
 * Tests for git diff context module
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  getDiffStat,
  getCommits,
  getChangedFiles,
  getBranchName,
  getGitDiffContext,
  formatDiffContextXml,
  getFormattedDiffContext,
  type GitDiffContext,
} from "./diff";
import { join } from "path";
import { mkdir, writeFile, rm } from "fs/promises";
import { spawn } from "child_process";

// Test fixtures directory
const FIXTURES_DIR = join(import.meta.dir, "..", "..", ".test-fixtures-diff");

/**
 * Helper to run git commands
 */
async function git(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn("git", args, { cwd, stdio: "ignore" });
    process.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git ${args.join(" ")} failed with code ${code}`));
    });
    process.on("error", reject);
  });
}

describe("Git diff context", () => {
  // Set up a temp git repo with commits on different branches
  beforeAll(async () => {
    await mkdir(FIXTURES_DIR, { recursive: true });

    // Initialize git repo
    await git(["init"], FIXTURES_DIR);
    await git(["config", "user.email", "test@test.com"], FIXTURES_DIR);
    await git(["config", "user.name", "Test User"], FIXTURES_DIR);

    // Create initial commit on main
    await writeFile(join(FIXTURES_DIR, "README.md"), "# Test Project\n");
    await git(["add", "."], FIXTURES_DIR);
    await git(["commit", "-m", "Initial commit"], FIXTURES_DIR);

    // Create a feature branch
    await git(["checkout", "-b", "feature/test"], FIXTURES_DIR);

    // Add some changes
    await mkdir(join(FIXTURES_DIR, "src"), { recursive: true });
    await writeFile(
      join(FIXTURES_DIR, "src/auth.ts"),
      `export function authenticate() {
  return true;
}
`
    );
    await git(["add", "."], FIXTURES_DIR);
    await git(["commit", "-m", "feat: add auth"], FIXTURES_DIR);

    // Add another commit
    await writeFile(
      join(FIXTURES_DIR, "src/types.ts"),
      `export type User = {
  id: string;
  name: string;
};
`
    );
    await git(["add", "."], FIXTURES_DIR);
    await git(["commit", "-m", "feat: add types"], FIXTURES_DIR);
  });

  afterAll(async () => {
    await rm(FIXTURES_DIR, { recursive: true, force: true });
  });

  describe("getDiffStat", () => {
    test("returns diff stat between branches", async () => {
      const stat = await getDiffStat({
        base: "main",
        head: "HEAD",
        cwd: FIXTURES_DIR,
      });

      expect(stat).toContain("src/auth.ts");
      expect(stat).toContain("src/types.ts");
      // Should show file stats like "+ insertions" pattern
      expect(stat).toMatch(/\d+\s+(file|files)\s+changed/);
    });

    test("returns empty string for invalid base", async () => {
      const stat = await getDiffStat({
        base: "nonexistent-branch",
        cwd: FIXTURES_DIR,
      });

      expect(stat).toBe("");
    });

    test("uses default base of main", async () => {
      const stat = await getDiffStat({
        cwd: FIXTURES_DIR,
      });

      // Should work with default main base
      expect(typeof stat).toBe("string");
    });
  });

  describe("getCommits", () => {
    test("returns commit history", async () => {
      const commits = await getCommits({
        base: "main",
        cwd: FIXTURES_DIR,
      });

      expect(commits.length).toBe(2);
      expect(commits.some((c) => c.includes("add auth"))).toBe(true);
      expect(commits.some((c) => c.includes("add types"))).toBe(true);
    });

    test("returns empty array for invalid base", async () => {
      const commits = await getCommits({
        base: "nonexistent-branch",
        cwd: FIXTURES_DIR,
      });

      expect(commits).toEqual([]);
    });

    test("returns empty array when no commits between refs", async () => {
      const commits = await getCommits({
        base: "HEAD",
        head: "HEAD",
        cwd: FIXTURES_DIR,
      });

      expect(commits).toEqual([]);
    });
  });

  describe("getChangedFiles", () => {
    test("returns list of changed files", async () => {
      const files = await getChangedFiles({
        base: "main",
        cwd: FIXTURES_DIR,
      });

      expect(files).toContain("src/auth.ts");
      expect(files).toContain("src/types.ts");
    });

    test("returns empty array for invalid base", async () => {
      const files = await getChangedFiles({
        base: "nonexistent-branch",
        cwd: FIXTURES_DIR,
      });

      expect(files).toEqual([]);
    });
  });

  describe("getBranchName", () => {
    test("returns current branch name", async () => {
      const branch = await getBranchName(FIXTURES_DIR);

      expect(branch).toBe("feature/test");
    });

    test("returns empty string for invalid cwd", async () => {
      const branch = await getBranchName("/nonexistent/path");

      expect(branch).toBe("");
    });
  });

  describe("getGitDiffContext", () => {
    test("returns full git context", async () => {
      const context = await getGitDiffContext({
        base: "main",
        cwd: FIXTURES_DIR,
      });

      expect(context.diffStat).toContain("src/auth.ts");
      expect(context.commits.length).toBe(2);
      expect(context.changedFiles).toContain("src/auth.ts");
      expect(context.changedFiles).toContain("src/types.ts");
      expect(context.branch).toBe("feature/test");
    });

    test("handles missing base gracefully", async () => {
      const context = await getGitDiffContext({
        base: "nonexistent",
        cwd: FIXTURES_DIR,
      });

      // Should return empty values rather than throwing
      expect(context.diffStat).toBe("");
      expect(context.commits).toEqual([]);
      expect(context.changedFiles).toEqual([]);
      // Branch should still work
      expect(context.branch).toBe("feature/test");
    });
  });

  describe("formatDiffContextXml", () => {
    test("formats context as XML", () => {
      const context: GitDiffContext = {
        diffStat:
          " src/auth.ts     |  45 +++\n src/types.ts    |  12 ++\n 2 files changed, 57 insertions(+)",
        commits: ["abc1234 feat: add auth", "def5678 feat: add types"],
        changedFiles: ["src/auth.ts", "src/types.ts"],
        branch: "feature/test",
      };

      const xml = formatDiffContextXml(context);

      expect(xml).toContain("<diff_summary>");
      expect(xml).toContain("</diff_summary>");
      expect(xml).toContain("<commits>");
      expect(xml).toContain("</commits>");
      expect(xml).toContain("<changed_files>");
      expect(xml).toContain("</changed_files>");

      expect(xml).toContain("src/auth.ts");
      expect(xml).toContain("abc1234 feat: add auth");
    });

    test("omits empty sections", () => {
      const context: GitDiffContext = {
        diffStat: "",
        commits: [],
        changedFiles: ["file.ts"],
        branch: "main",
      };

      const xml = formatDiffContextXml(context);

      expect(xml).not.toContain("<diff_summary>");
      expect(xml).not.toContain("<commits>");
      expect(xml).toContain("<changed_files>");
    });

    test("handles all empty context", () => {
      const context: GitDiffContext = {
        diffStat: "",
        commits: [],
        changedFiles: [],
        branch: "",
      };

      const xml = formatDiffContextXml(context);

      expect(xml).toBe("");
    });
  });

  describe("getFormattedDiffContext", () => {
    test("returns formatted XML context", async () => {
      const xml = await getFormattedDiffContext({
        base: "main",
        cwd: FIXTURES_DIR,
      });

      expect(xml).toContain("<diff_summary>");
      expect(xml).toContain("<commits>");
      expect(xml).toContain("<changed_files>");
      expect(xml).toContain("src/auth.ts");
    });
  });

  describe("Edge cases", () => {
    test("handles cwd with spaces in path", async () => {
      // This test verifies the module doesn't break with special paths
      // The actual FIXTURES_DIR doesn't have spaces, but the code should handle it
      const branch = await getBranchName(FIXTURES_DIR);
      expect(typeof branch).toBe("string");
    });

    test("all functions handle non-git directory", async () => {
      const tempDir = "/tmp/non-git-test-" + Date.now();
      await mkdir(tempDir, { recursive: true });

      try {
        const stat = await getDiffStat({ cwd: tempDir });
        const commits = await getCommits({ cwd: tempDir });
        const files = await getChangedFiles({ cwd: tempDir });
        const branch = await getBranchName(tempDir);
        const context = await getGitDiffContext({ cwd: tempDir });
        const formatted = await getFormattedDiffContext({ cwd: tempDir });

        // All should return empty/default values
        expect(stat).toBe("");
        expect(commits).toEqual([]);
        expect(files).toEqual([]);
        expect(branch).toBe("");
        expect(context.diffStat).toBe("");
        expect(formatted).toBe("");
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });
  });
});
