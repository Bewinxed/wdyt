/**
 * Types for wdyt - Code review context builder for LLMs
 */

/** Tab within a window */
export interface Tab {
  id: string;
  prompt: string;
  selectedFiles: string[];
  createdAt: string;
}

/** Window representation */
export interface Window {
  id: number;
  rootFolderPaths: string[];
  tabs: Tab[];
}

/** Builder configuration for creating a new tab */
export interface BuilderConfig {
  summary?: string;
  path?: string;
  name?: string;
}

/** Selection state for a tab */
export interface SelectionState {
  files: string[];
  folders: string[];
}

/** Prompt data for a tab */
export interface PromptData {
  prompt: string;
}

/** Chat send request */
export interface ChatSendRequest {
  message?: string;
  export_path?: string;
}

/** CLI flags parsed from command line */
export interface CLIFlags {
  rawJson: boolean;
  window?: number;
  tab?: string;
  expression?: string;
}

/** Result of command execution */
export interface CommandResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/** State file structure */
export interface StateFile {
  version: number;
  windows: Window[];
}

/** Tab update data - partial fields that can be updated */
export interface TabUpdate {
  prompt?: string;
  selectedFiles?: string[];
}
