/**
 * Integration tests for wdyt with flowctl-compatible interface
 *
 * Tests the full pipeline that flowctl uses:
 * 1. builder "summary" -> creates tab
 * 2. select add "path" -> adds files
 * 3. call chat_send {...} -> generates review context
 *
 * Also tests context enrichment features:
 * - Context hints from changed files
 * - Git diff context injection
 * - Verdict parsing from response
 * - Re-review preamble for continuing chats
 * - Flow-Next spec loading
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { join } from "path";
import { mkdirSync, rmSync } from "fs";
import { $ } from "bun";
import { ensureState, createTab, getTab, updateTab, updateWindowPaths } from "./state";
import { builderCommand } from "./commands/builder";
import { selectAddCommand, selectGetCommand } from "./commands/select";
import { chatSendCommand } from "./commands/chat";
import { generateContextHints, formatHints } from "./context/hints";
import { getGitDiffContext, formatDiffContextXml } from "./git/diff";
import { buildReReviewPreamble, clearReviewState } from "./context/rereview";
import { loadTaskSpec, getTaskSpecContext } from "./flow/specs";

// Test fixtures directory
const TEST_DIR = join(import.meta.dir, "..", ".test-integration");
const TEST_FLOW_DIR = join(TEST_DIR, ".flow");

// Sample test files
const SAMPLE_TS_FILE = `/**
 * Sample TypeScript file for testing
 */

export interface User {
  id: string;
  name: string;
  email: string;
}

export function createUser(name: string, email: string): User {
  return {
    id: crypto.randomUUID(),
    name,
    email,
  };
}

export function validateEmail(email: string): boolean {
  return email.includes("@");
}

export class UserService {
  private users: User[] = [];

  addUser(user: User): void {
    this.users.push(user);
  }

  getUser(id: string): User | undefined {
    return this.users.find(u => u.id === id);
  }
}
`;

const SAMPLE_SPEC = `# fn-99-int.1 Integration Test Task

## Description
This is a test task for integration testing.

### Requirements
- Test the full flowctl pipeline
- Verify context hints generation
- Check verdict parsing

### Acceptance Criteria
- [ ] builder command creates tabs
- [ ] select add adds files
- [ ] chat_send generates context
`;

describe("Integration: flowctl-compatible pipeline", () => {
  beforeEach(async () => {
    // Set up test environment
    process.env.XDG_DATA_HOME = TEST_DIR;

    // Create test directories
    mkdirSync(join(TEST_DIR, "src"), { recursive: true });
    mkdirSync(join(TEST_FLOW_DIR, "tasks"), { recursive: true });
    mkdirSync(join(TEST_FLOW_DIR, "specs"), { recursive: true });

    // Write test files
    await Bun.write(join(TEST_DIR, "src", "user.ts"), SAMPLE_TS_FILE);
    await Bun.write(join(TEST_FLOW_DIR, "tasks", "fn-99-int.1.md"), SAMPLE_SPEC);

    // Initialize state
    await ensureState();

    // Set window root path to TEST_DIR so relative paths resolve correctly
    await updateWindowPaths(1, [TEST_DIR]);

    // Clear re-review state between tests
    clearReviewState();
  });

  afterEach(async () => {
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
    delete process.env.XDG_DATA_HOME;
  });

  describe("Step 1: builder command (setup-review)", () => {
    it("creates a new tab and returns Tab: <uuid>", async () => {
      const result = await builderCommand(1, "test review");

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.tabId).toBeDefined();
      expect(result.data?.tabId.length).toBe(36); // UUID format
      expect(result.output).toMatch(/^Tab: [a-f0-9-]{36}$/);
    });

    it("accepts --response-type flag (flowctl compatibility)", async () => {
      const result = await builderCommand(1, "test", { "response-type": "markdown" });

      expect(result.success).toBe(true);
      expect(result.data?.tabId).toBeDefined();
    });
  });

  describe("Step 2: select add command", () => {
    it("adds files to tab selection", async () => {
      // Create tab first
      const tab = await createTab(1);

      // Add a file (using relative path - resolved against TEST_DIR)
      const result = await selectAddCommand(1, tab.id, "src/user.ts");

      expect(result.success).toBe(true);
      expect(result.data?.added).toBe(1);
      expect(result.data?.total).toBe(1);

      // Verify file was added
      const getResult = await selectGetCommand(1, tab.id);
      expect(getResult.success).toBe(true);
      // getResult.data is { files: string[] }, need to check files array
      expect(getResult.data?.files).toBeDefined();
      expect(getResult.data?.files.length).toBe(1);
      expect(getResult.data?.files[0]).toContain("src/user.ts");
    });

    it("handles multiple files", async () => {
      const tab = await createTab(1);

      // Write another test file
      await Bun.write(join(TEST_DIR, "src", "other.ts"), "export const other = 1;");

      // Add multiple files
      await selectAddCommand(1, tab.id, "src/user.ts");
      await selectAddCommand(1, tab.id, "src/other.ts");

      const getResult = await selectGetCommand(1, tab.id);
      expect(getResult.success).toBe(true);
      expect(getResult.data?.files).toBeDefined();
      expect(getResult.data?.files.length).toBe(2);

      // Check that both files are in the list
      const files = getResult.data!.files.join("\n");
      expect(files).toContain("src/user.ts");
      expect(files).toContain("src/other.ts");
    });
  });

  describe("Step 3: chat_send command", () => {
    // Save original PATH and restore after tests
    let originalPath: string | undefined;

    beforeEach(() => {
      // Remove claude from PATH to ensure tests don't depend on Claude CLI
      // This makes tests fast and deterministic
      originalPath = process.env.PATH;
      process.env.PATH = "/nonexistent";
    });

    afterEach(() => {
      if (originalPath) {
        process.env.PATH = originalPath;
      }
    });

    it("generates context XML with prompt and files", async () => {
      // Setup: create tab and add file
      const tab = await createTab(1);
      await updateTab(1, tab.id, {
        prompt: "Review this code",
        selectedFiles: [join(TEST_DIR, "src", "user.ts")],
      });

      // Send chat (without Claude CLI)
      const result = await chatSendCommand(1, tab.id, JSON.stringify({
        message: "Please review this code for issues",
        mode: "review",
        new_chat: true,
      }));

      // Verify response structure
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBeDefined();
      expect(result.data?.id.length).toBe(36); // UUID format
      expect(result.data?.path).toBeDefined();

      // Verify output format matches flowctl expectations
      expect(result.output).toContain(`Chat: \`${result.data?.id}\``);

      // Verify the XML file was created with correct content
      const xmlFile = Bun.file(result.data!.path);
      expect(await xmlFile.exists()).toBe(true);
      const xmlContent = await xmlFile.text();
      expect(xmlContent).toContain('<?xml version="1.0"');
      expect(xmlContent).toContain("<prompt>");
      expect(xmlContent).toContain("Please review this code for issues");
      expect(xmlContent).toContain("<files>");
      expect(xmlContent).toContain("user.ts");
    });

    it("includes selected_paths from payload", async () => {
      const tab = await createTab(1);

      // Send with explicit selected_paths
      const result = await chatSendCommand(1, tab.id, JSON.stringify({
        message: "Review these files",
        mode: "review",
        selected_paths: [join(TEST_DIR, "src", "user.ts")],
      }));

      expect(result.success).toBe(true);
      expect(result.data?.id).toBeDefined();

      // Verify the file was included
      const xmlFile = Bun.file(result.data!.path);
      const xmlContent = await xmlFile.text();
      expect(xmlContent).toContain("user.ts");
    });
  });
});

describe("Integration: Context hints generation", () => {
  it("generates hints from TypeScript symbols", async () => {
    const fileContents = new Map([
      ["src/user.ts", SAMPLE_TS_FILE],
    ]);

    const hints = await generateContextHints({
      changedFiles: ["src/user.ts"],
      fileContents,
      cwd: process.cwd(),
      maxHints: 10,
    });

    // Should return array (may be empty if no external refs)
    expect(Array.isArray(hints)).toBe(true);

    // Each hint should have required fields
    for (const hint of hints) {
      expect(hint).toHaveProperty("file");
      expect(hint).toHaveProperty("line");
      expect(hint).toHaveProperty("symbol");
      expect(hint).toHaveProperty("refCount");
    }
  });

  it("formats hints in flowctl-compatible format", () => {
    const hints = [
      { file: "src/auth.ts", line: 15, symbol: "validateUser", refCount: 3 },
      { file: "src/types.ts", line: 42, symbol: "User", refCount: 5 },
    ];

    const formatted = formatHints(hints);

    expect(formatted).toContain("Consider these related files:");
    expect(formatted).toContain("src/auth.ts:15 - references validateUser");
    expect(formatted).toContain("src/types.ts:42 - references User");
  });
});

describe("Integration: Git diff context", () => {
  it("gets git context from repository", async () => {
    // Use the actual repo for this test
    const context = await getGitDiffContext({
      base: "HEAD~1",
      head: "HEAD",
      cwd: process.cwd(),
    });

    // Should have basic structure
    expect(context).toHaveProperty("diffStat");
    expect(context).toHaveProperty("commits");
    expect(context).toHaveProperty("changedFiles");
    expect(context).toHaveProperty("branch");
  });

  it("formats git context as XML", () => {
    const context = {
      diffStat: "3 files changed, 100 insertions(+), 20 deletions(-)",
      commits: ["abc1234 feat: add user module", "def5678 fix: email validation"],
      changedFiles: ["src/user.ts", "src/types.ts"],
      branch: "feature/users",
    };

    const xml = formatDiffContextXml(context);

    expect(xml).toContain("<diff_summary>");
    expect(xml).toContain("3 files changed");
    expect(xml).toContain("<commits>");
    expect(xml).toContain("feat: add user module");
    expect(xml).toContain("<changed_files>");
    expect(xml).toContain("src/user.ts");
  });
});

describe("Integration: Re-review preamble", () => {
  it("builds re-review preamble with changed files", () => {
    const changedFiles = [
      "src/user.ts",
      "src/auth.ts",
      "src/types.ts",
    ];

    const preamble = buildReReviewPreamble(changedFiles, "implementation");

    expect(preamble).toContain("IMPORTANT: Re-review After Fixes");
    expect(preamble).toContain("This is a RE-REVIEW");
    expect(preamble).toContain("src/user.ts");
    expect(preamble).toContain("src/auth.ts");
    expect(preamble).toContain("implementation review");
  });

  it("truncates file list at 30 files", () => {
    const manyFiles = Array.from({ length: 50 }, (_, i) => `src/file${i}.ts`);

    const preamble = buildReReviewPreamble(manyFiles, "review");

    expect(preamble).toContain("and 20 more files");
  });
});

describe("Integration: Flow-Next spec loading", () => {
  beforeAll(() => {
    mkdirSync(join(TEST_FLOW_DIR, "tasks"), { recursive: true });
    Bun.write(join(TEST_FLOW_DIR, "tasks", "fn-99-int.1.md"), SAMPLE_SPEC);
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("loads task spec from .flow directory", async () => {
    const result = await loadTaskSpec("fn-99-int.1", { flowDir: TEST_FLOW_DIR });

    expect(result.found).toBe(true);
    expect(result.taskId).toBe("fn-99-int.1");
    expect(result.content).toContain("Integration Test Task");
  });

  it("formats spec as XML context", async () => {
    const xml = await getTaskSpecContext("fn-99-int.1", { flowDir: TEST_FLOW_DIR });

    expect(xml).toContain("<task_spec>");
    expect(xml).toContain("# fn-99-int.1");
    expect(xml).toContain("</task_spec>");
  });

  it("returns empty string for missing spec (graceful)", async () => {
    const xml = await getTaskSpecContext("fn-88.99", { flowDir: TEST_FLOW_DIR });

    expect(xml).toBe("");
  });
});

describe("Integration: Verdict parsing", () => {
  // Note: Actual verdict parsing happens in chat.ts parseVerdict()
  // These tests verify the expected format

  it("recognizes SHIP verdict format", () => {
    const response = `
## Review Summary
Code looks good!

<verdict>SHIP</verdict>
`;
    const match = response.match(/<verdict>(SHIP|NEEDS_WORK|MAJOR_RETHINK)<\/verdict>/i);
    expect(match).not.toBeNull();
    expect(match![1].toUpperCase()).toBe("SHIP");
  });

  it("recognizes NEEDS_WORK verdict format", () => {
    const response = `
## Review Summary
Some issues found.

<verdict>NEEDS_WORK</verdict>
`;
    const match = response.match(/<verdict>(SHIP|NEEDS_WORK|MAJOR_RETHINK)<\/verdict>/i);
    expect(match).not.toBeNull();
    expect(match![1].toUpperCase()).toBe("NEEDS_WORK");
  });

  it("recognizes MAJOR_RETHINK verdict format", () => {
    const response = `
## Review Summary
Significant problems.

<verdict>MAJOR_RETHINK</verdict>
`;
    const match = response.match(/<verdict>(SHIP|NEEDS_WORK|MAJOR_RETHINK)<\/verdict>/i);
    expect(match).not.toBeNull();
    expect(match![1].toUpperCase()).toBe("MAJOR_RETHINK");
  });

  it("handles case-insensitive verdict", () => {
    const response = `<verdict>ship</verdict>`;
    const match = response.match(/<verdict>(SHIP|NEEDS_WORK|MAJOR_RETHINK)<\/verdict>/i);
    expect(match).not.toBeNull();
    expect(match![1].toUpperCase()).toBe("SHIP");
  });
});

describe("Integration: Full pipeline simulation", () => {
  let originalPath: string | undefined;

  beforeEach(async () => {
    process.env.XDG_DATA_HOME = TEST_DIR;
    // Remove claude from PATH to ensure tests don't depend on Claude CLI
    originalPath = process.env.PATH;
    process.env.PATH = "/nonexistent";

    mkdirSync(join(TEST_DIR, "src"), { recursive: true });
    await Bun.write(join(TEST_DIR, "src", "user.ts"), SAMPLE_TS_FILE);
    await ensureState();

    // Set window root to TEST_DIR for relative path resolution
    await updateWindowPaths(1, [TEST_DIR]);

    clearReviewState();
  });

  afterEach(async () => {
    if (originalPath) {
      process.env.PATH = originalPath;
    }
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore
    }
    delete process.env.XDG_DATA_HOME;
  });

  it("runs complete flowctl-like workflow", async () => {
    // Step 1: builder (setup-review)
    // This is what flowctl calls with: rp-cli -w $W -e 'builder "summary"'
    const builderResult = await builderCommand(1, "integration test");
    expect(builderResult.success).toBe(true);
    expect(builderResult.output).toMatch(/^Tab: [a-f0-9-]{36}$/);
    const tabId = builderResult.data!.tabId;

    // Step 2: select add (add files to review)
    // This is what flowctl calls with: rp-cli -w $W -t $T -e 'select add "path"'
    const selectResult = await selectAddCommand(1, tabId, "src/user.ts");
    expect(selectResult.success).toBe(true);
    expect(selectResult.data?.added).toBe(1);

    // Step 3: chat_send (trigger review)
    // This is what flowctl calls with: rp-cli -w $W -t $T -e 'call chat_send {...}'
    const chatResult = await chatSendCommand(1, tabId, JSON.stringify({
      message: "Review this user module for security and correctness",
      mode: "review",
      new_chat: true,
    }));

    expect(chatResult.success).toBe(true);
    expect(chatResult.data?.id).toBeDefined();
    expect(chatResult.output).toContain("Chat:");

    // Verify the XML context was generated correctly
    const xmlFile = Bun.file(chatResult.data!.path);
    expect(await xmlFile.exists()).toBe(true);
    const xmlContent = await xmlFile.text();

    // Verify the context contains expected elements
    expect(xmlContent).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xmlContent).toContain("<context>");
    expect(xmlContent).toContain("<prompt>");
    expect(xmlContent).toContain("Review this user module");
    expect(xmlContent).toContain("<files>");
    expect(xmlContent).toContain("user.ts");
    expect(xmlContent).toContain("</context>");
  });

  it("supports re-review workflow with preamble", async () => {
    // First review
    const tab = await createTab(1);
    await updateTab(1, tab.id, {
      selectedFiles: [join(TEST_DIR, "src", "user.ts")],
    });

    const firstReview = await chatSendCommand(1, tab.id, JSON.stringify({
      message: "Initial review",
      mode: "review",
      new_chat: true,
    }));
    expect(firstReview.success).toBe(true);
    const firstChatId = firstReview.data!.id;

    // Second review (re-review) - continuing same chat
    const reReview = await chatSendCommand(1, tab.id, JSON.stringify({
      message: "Please re-review after fixes",
      mode: "review",
      chat_id: firstChatId, // Continue from first chat
      new_chat: false,
    }));

    expect(reReview.success).toBe(true);
    expect(reReview.data?.isReReview).toBe(true);

    // Verify re-review preamble is in the context
    const xmlContent = await Bun.file(reReview.data!.path).text();
    expect(xmlContent).toContain("RE-REVIEW");
  });
});
