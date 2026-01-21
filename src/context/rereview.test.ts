/**
 * Tests for re-review cache-busting module
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  buildReReviewPreamble,
  detectReReview,
  recordReview,
  getPreviousReviewState,
  clearReviewState,
  processReReview,
} from "./rereview";

describe("buildReReviewPreamble", () => {
  test("builds preamble with changed files", () => {
    const files = ["src/auth.ts", "src/types.ts"];
    const preamble = buildReReviewPreamble(files, "implementation");

    expect(preamble).toContain("## IMPORTANT: Re-review After Fixes");
    expect(preamble).toContain("This is a RE-REVIEW");
    expect(preamble).toContain("- src/auth.ts");
    expect(preamble).toContain("- src/types.ts");
    expect(preamble).toContain("implementation review");
  });

  test("truncates files list at 30 files", () => {
    const files = Array.from({ length: 40 }, (_, i) => `src/file${i}.ts`);
    const preamble = buildReReviewPreamble(files, "plan");

    expect(preamble).toContain("- src/file0.ts");
    expect(preamble).toContain("- src/file29.ts");
    expect(preamble).not.toContain("- src/file30.ts");
    expect(preamble).toContain("... and 10 more files");
  });

  test("uses correct review type in message", () => {
    const files = ["src/spec.md"];
    const preamble = buildReReviewPreamble(files, "plan");

    expect(preamble).toContain("plan review");
  });
});

describe("detectReReview", () => {
  beforeEach(() => {
    clearReviewState();
  });

  test("returns false when no chatId and no explicit flag", () => {
    const result = detectReReview({});
    expect(result).toBe(false);
  });

  test("returns true when isReReview is explicitly true", () => {
    const result = detectReReview({ isReReview: true });
    expect(result).toBe(true);
  });

  test("returns false when chatId has no previous review", () => {
    const result = detectReReview({ chatId: "new-chat-id" });
    expect(result).toBe(false);
  });

  test("returns true when chatId has previous review", () => {
    recordReview("existing-chat-id", ["file1.ts"]);
    const result = detectReReview({ chatId: "existing-chat-id" });
    expect(result).toBe(true);
  });
});

describe("recordReview and getPreviousReviewState", () => {
  beforeEach(() => {
    clearReviewState();
  });

  test("records and retrieves review state", () => {
    const files = ["src/auth.ts", "src/types.ts"];
    recordReview("test-chat-id", files);

    const state = getPreviousReviewState("test-chat-id");
    expect(state).toBeDefined();
    expect(state?.files).toEqual(files);
    expect(state?.timestamp).toBeGreaterThan(0);
  });

  test("returns undefined for unknown chat id", () => {
    const state = getPreviousReviewState("unknown-chat-id");
    expect(state).toBeUndefined();
  });

  test("clearReviewState removes all state", () => {
    recordReview("chat-1", ["file1.ts"]);
    recordReview("chat-2", ["file2.ts"]);

    clearReviewState();

    expect(getPreviousReviewState("chat-1")).toBeUndefined();
    expect(getPreviousReviewState("chat-2")).toBeUndefined();
  });
});

describe("processReReview", () => {
  beforeEach(() => {
    clearReviewState();
  });

  test("returns isReReview false when not a re-review", async () => {
    const result = await processReReview({});
    expect(result.isReReview).toBe(false);
    expect(result.preamble).toBeUndefined();
  });

  test("returns preamble when is re-review", async () => {
    recordReview("prev-chat", ["file.ts"]);
    const result = await processReReview({
      chatId: "prev-chat",
      reviewType: "implementation",
    });

    expect(result.isReReview).toBe(true);
    expect(result.preamble).toBeDefined();
    expect(result.preamble).toContain("RE-REVIEW");
  });

  test("uses explicit isReReview flag", async () => {
    const result = await processReReview({
      isReReview: true,
      reviewType: "plan",
    });

    expect(result.isReReview).toBe(true);
    expect(result.preamble).toBeDefined();
  });
});
