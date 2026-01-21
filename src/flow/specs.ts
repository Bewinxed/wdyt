/**
 * Flow-Next spec loading module
 *
 * Loads task specs from the .flow/ directory for inclusion
 * in code review context.
 */

import { join } from "path";

/**
 * Task ID pattern: fn-N.M or fn-N-suffix.M
 * Examples: fn-1.2, fn-2-vth.7, fn-123-abc.45
 */
const TASK_ID_REGEX = /^fn-\d+(?:-[a-z0-9]+)?(?:\.\d+)?$/i;

/**
 * Result of loading a task spec
 */
export interface TaskSpecResult {
  /** Whether the spec was found and loaded */
  found: boolean;
  /** The task ID that was parsed */
  taskId: string;
  /** The spec content (markdown) */
  content?: string;
  /** The file path that was loaded from */
  path?: string;
  /** Error message if loading failed */
  error?: string;
}

/**
 * Options for loading task specs
 */
export interface LoadTaskSpecOptions {
  /** Working directory (defaults to cwd) */
  cwd?: string;
  /** Base path for .flow directory (defaults to cwd/.flow) */
  flowDir?: string;
}

/**
 * Parse and validate a task ID
 *
 * Valid formats:
 * - fn-N (epic only, e.g., fn-1)
 * - fn-N.M (simple task, e.g., fn-1.2)
 * - fn-N-suffix (epic with suffix, e.g., fn-2-vth)
 * - fn-N-suffix.M (task with suffix, e.g., fn-2-vth.7)
 *
 * @param input - The task ID string to parse
 * @returns The validated task ID or null if invalid
 */
export function parseTaskId(input: string): string | null {
  if (!input || typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim().toLowerCase();

  if (TASK_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Extract the epic ID from a task ID
 *
 * Examples:
 * - fn-1.2 -> fn-1
 * - fn-2-vth.7 -> fn-2-vth
 * - fn-1 -> fn-1
 *
 * @param taskId - The full task ID
 * @returns The epic ID portion
 */
export function getEpicId(taskId: string): string {
  // Remove the .M suffix if present
  const dotIndex = taskId.lastIndexOf(".");
  if (dotIndex > 0 && /^\d+$/.test(taskId.slice(dotIndex + 1))) {
    return taskId.slice(0, dotIndex);
  }
  return taskId;
}

/**
 * Determine if an ID is a task (has .M suffix) or an epic
 *
 * @param taskId - The ID to check
 * @returns True if this is a task ID (has .M suffix)
 */
export function isTaskId(taskId: string): boolean {
  const dotIndex = taskId.lastIndexOf(".");
  if (dotIndex > 0) {
    const suffix = taskId.slice(dotIndex + 1);
    return /^\d+$/.test(suffix);
  }
  return false;
}

/**
 * Get the path to a task spec file
 *
 * Task specs are stored at: .flow/tasks/{task-id}.md
 * Epic specs are stored at: .flow/specs/{epic-id}.md
 *
 * @param taskId - The task or epic ID
 * @param options - Loading options
 * @returns The absolute path to the spec file
 */
export function getSpecPath(taskId: string, options: LoadTaskSpecOptions = {}): string {
  const { cwd = process.cwd() } = options;
  const flowDir = options.flowDir || join(cwd, ".flow");

  if (isTaskId(taskId)) {
    // Task spec: .flow/tasks/fn-N.M.md
    return join(flowDir, "tasks", `${taskId}.md`);
  } else {
    // Epic spec: .flow/specs/fn-N.md
    return join(flowDir, "specs", `${taskId}.md`);
  }
}

/**
 * Load a task spec from the .flow directory
 *
 * @param taskId - The task ID to load (e.g., fn-2-vth.7)
 * @param options - Loading options
 * @returns Result containing the spec content or error
 */
export async function loadTaskSpec(
  taskId: string,
  options: LoadTaskSpecOptions = {}
): Promise<TaskSpecResult> {
  // Validate and normalize the task ID
  const parsed = parseTaskId(taskId);

  if (!parsed) {
    return {
      found: false,
      taskId,
      error: `Invalid task ID format: ${taskId}`,
    };
  }

  const specPath = getSpecPath(parsed, options);

  try {
    const file = Bun.file(specPath);

    if (!(await file.exists())) {
      return {
        found: false,
        taskId: parsed,
        path: specPath,
        error: `Spec file not found: ${specPath}`,
      };
    }

    const content = await file.text();

    return {
      found: true,
      taskId: parsed,
      content,
      path: specPath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      found: false,
      taskId: parsed,
      path: specPath,
      error: `Failed to read spec: ${message}`,
    };
  }
}

/**
 * Format a task spec as XML for inclusion in review context
 *
 * Output format:
 * ```xml
 * <task_spec>
 * ## Task: fn-2.3 - Context hints generation
 *
 * ### Requirements
 * ...
 *
 * ### Acceptance Criteria
 * ...
 * </task_spec>
 * ```
 *
 * @param result - The task spec result from loadTaskSpec
 * @returns Formatted XML string, or empty string if no spec found
 */
export function formatSpecXml(result: TaskSpecResult): string {
  if (!result.found || !result.content) {
    return "";
  }

  return `<task_spec>\n${result.content.trim()}\n</task_spec>`;
}

/**
 * Load and format a task spec for inclusion in review context
 *
 * This is the main entry point for getting task spec context.
 * Returns empty string if spec is not found (graceful fallback).
 *
 * @param taskId - The task ID to load (e.g., fn-2-vth.7)
 * @param options - Loading options
 * @returns Formatted XML spec string, or empty string if not found
 */
export async function getTaskSpecContext(
  taskId: string,
  options: LoadTaskSpecOptions = {}
): Promise<string> {
  const result = await loadTaskSpec(taskId, options);
  return formatSpecXml(result);
}

/**
 * Extract task ID from a payload object
 *
 * Looks for task_id field in the payload.
 *
 * @param payload - Payload object that may contain task_id
 * @returns The task ID or null if not found
 */
export function extractTaskIdFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const obj = payload as Record<string, unknown>;

  // Check common field names
  const taskIdFields = ["task_id", "taskId", "task"];

  for (const field of taskIdFields) {
    const value = obj[field];
    if (typeof value === "string") {
      const parsed = parseTaskId(value);
      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
}
