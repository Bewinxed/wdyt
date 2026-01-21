/**
 * Tests for Flow-Next spec loading module
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import {
  parseTaskId,
  getEpicId,
  isTaskId,
  getSpecPath,
  loadTaskSpec,
  formatSpecXml,
  getTaskSpecContext,
  extractTaskIdFromPayload,
} from "./specs";

// Test fixtures
const TEST_DIR = join(import.meta.dir, "..", "..", ".test-flow");
const TEST_FLOW_DIR = join(TEST_DIR, ".flow");

// Sample spec content - using valid fn-N or fn-N-suffix ID format
const SAMPLE_SPEC = `# fn-99-test.1 Test Task

## Description
This is a test task for unit testing.

### Requirements
- Requirement 1
- Requirement 2

### Acceptance Criteria
- [ ] Criteria 1
- [ ] Criteria 2
`;

const SAMPLE_EPIC_SPEC = `# fn-99-test Test Epic

## Overview
This is a test epic.

## Tasks
- fn-99-test.1 - Test Task
`;

describe("parseTaskId", () => {
  it("parses simple task ID", () => {
    expect(parseTaskId("fn-1.2")).toBe("fn-1.2");
  });

  it("parses task ID with suffix", () => {
    expect(parseTaskId("fn-2-vth.7")).toBe("fn-2-vth.7");
  });

  it("parses epic ID", () => {
    expect(parseTaskId("fn-1")).toBe("fn-1");
  });

  it("parses epic ID with suffix", () => {
    expect(parseTaskId("fn-2-vth")).toBe("fn-2-vth");
  });

  it("handles uppercase", () => {
    expect(parseTaskId("FN-1.2")).toBe("fn-1.2");
  });

  it("handles whitespace", () => {
    expect(parseTaskId("  fn-1.2  ")).toBe("fn-1.2");
  });

  it("rejects invalid formats", () => {
    expect(parseTaskId("invalid")).toBeNull();
    expect(parseTaskId("fn1.2")).toBeNull();
    expect(parseTaskId("fn-")).toBeNull();
    expect(parseTaskId("")).toBeNull();
    expect(parseTaskId(null as unknown as string)).toBeNull();
  });
});

describe("getEpicId", () => {
  it("extracts epic from simple task", () => {
    expect(getEpicId("fn-1.2")).toBe("fn-1");
  });

  it("extracts epic from task with suffix", () => {
    expect(getEpicId("fn-2-vth.7")).toBe("fn-2-vth");
  });

  it("returns epic unchanged", () => {
    expect(getEpicId("fn-1")).toBe("fn-1");
  });

  it("returns epic with suffix unchanged", () => {
    expect(getEpicId("fn-2-vth")).toBe("fn-2-vth");
  });
});

describe("isTaskId", () => {
  it("identifies task IDs", () => {
    expect(isTaskId("fn-1.2")).toBe(true);
    expect(isTaskId("fn-2-vth.7")).toBe(true);
  });

  it("identifies epic IDs", () => {
    expect(isTaskId("fn-1")).toBe(false);
    expect(isTaskId("fn-2-vth")).toBe(false);
  });
});

describe("getSpecPath", () => {
  it("returns task spec path", () => {
    const path = getSpecPath("fn-1.2", { cwd: "/project" });
    expect(path).toBe("/project/.flow/tasks/fn-1.2.md");
  });

  it("returns epic spec path", () => {
    const path = getSpecPath("fn-1", { cwd: "/project" });
    expect(path).toBe("/project/.flow/specs/fn-1.md");
  });

  it("uses custom flow directory", () => {
    const path = getSpecPath("fn-1.2", { flowDir: "/custom/.flow" });
    expect(path).toBe("/custom/.flow/tasks/fn-1.2.md");
  });
});

describe("loadTaskSpec", () => {
  beforeAll(() => {
    // Create test directory structure
    mkdirSync(join(TEST_FLOW_DIR, "tasks"), { recursive: true });
    mkdirSync(join(TEST_FLOW_DIR, "specs"), { recursive: true });

    // Write test spec files
    Bun.write(join(TEST_FLOW_DIR, "tasks", "fn-99-test.1.md"), SAMPLE_SPEC);
    Bun.write(join(TEST_FLOW_DIR, "specs", "fn-99-test.md"), SAMPLE_EPIC_SPEC);
  });

  afterAll(() => {
    // Clean up test directory
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("loads existing task spec", async () => {
    const result = await loadTaskSpec("fn-99-test.1", { flowDir: TEST_FLOW_DIR });

    expect(result.found).toBe(true);
    expect(result.taskId).toBe("fn-99-test.1");
    expect(result.content).toBe(SAMPLE_SPEC);
    expect(result.path).toContain("fn-99-test.1.md");
  });

  it("loads existing epic spec", async () => {
    const result = await loadTaskSpec("fn-99-test", { flowDir: TEST_FLOW_DIR });

    expect(result.found).toBe(true);
    expect(result.taskId).toBe("fn-99-test");
    expect(result.content).toBe(SAMPLE_EPIC_SPEC);
    expect(result.path).toContain("fn-99-test.md");
  });

  it("returns not found for missing spec", async () => {
    const result = await loadTaskSpec("fn-88.99", { flowDir: TEST_FLOW_DIR });

    expect(result.found).toBe(false);
    expect(result.taskId).toBe("fn-88.99");
    expect(result.error).toContain("not found");
  });

  it("returns error for invalid task ID", async () => {
    const result = await loadTaskSpec("invalid", { flowDir: TEST_FLOW_DIR });

    expect(result.found).toBe(false);
    expect(result.error).toContain("Invalid task ID");
  });
});

describe("formatSpecXml", () => {
  it("formats found spec as XML", () => {
    const result = {
      found: true,
      taskId: "fn-99-test.1",
      content: SAMPLE_SPEC,
    };

    const xml = formatSpecXml(result);

    expect(xml).toContain("<task_spec>");
    expect(xml).toContain("</task_spec>");
    expect(xml).toContain("# fn-99-test.1 Test Task");
  });

  it("returns empty string for not found", () => {
    const result = {
      found: false,
      taskId: "fn-99-test.1",
      error: "Not found",
    };

    const xml = formatSpecXml(result);
    expect(xml).toBe("");
  });
});

describe("getTaskSpecContext", () => {
  beforeAll(() => {
    // Create test directory structure
    mkdirSync(join(TEST_FLOW_DIR, "tasks"), { recursive: true });
    Bun.write(join(TEST_FLOW_DIR, "tasks", "fn-99-test.1.md"), SAMPLE_SPEC);
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("returns formatted XML for existing spec", async () => {
    const xml = await getTaskSpecContext("fn-99-test.1", { flowDir: TEST_FLOW_DIR });

    expect(xml).toContain("<task_spec>");
    expect(xml).toContain("# fn-99-test.1 Test Task");
  });

  it("returns empty string for missing spec (graceful fallback)", async () => {
    const xml = await getTaskSpecContext("fn-88.99", { flowDir: TEST_FLOW_DIR });

    expect(xml).toBe("");
  });
});

describe("extractTaskIdFromPayload", () => {
  it("extracts task_id field", () => {
    const payload = { task_id: "fn-1.2" };
    expect(extractTaskIdFromPayload(payload)).toBe("fn-1.2");
  });

  it("extracts taskId field", () => {
    const payload = { taskId: "fn-2-vth.7" };
    expect(extractTaskIdFromPayload(payload)).toBe("fn-2-vth.7");
  });

  it("extracts task field", () => {
    const payload = { task: "fn-1.2" };
    expect(extractTaskIdFromPayload(payload)).toBe("fn-1.2");
  });

  it("returns null for missing field", () => {
    const payload = { other: "value" };
    expect(extractTaskIdFromPayload(payload)).toBeNull();
  });

  it("returns null for invalid task ID", () => {
    const payload = { task_id: "invalid" };
    expect(extractTaskIdFromPayload(payload)).toBeNull();
  });

  it("returns null for non-object", () => {
    expect(extractTaskIdFromPayload(null)).toBeNull();
    expect(extractTaskIdFromPayload("string")).toBeNull();
  });
});
