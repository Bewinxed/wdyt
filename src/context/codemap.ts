/**
 * Code Map Generation Module
 *
 * Extracts lightweight code maps from source files - function signatures,
 * type definitions, and class structures WITHOUT implementation bodies.
 * This reduces token usage by 70-90% while preserving architectural context.
 *
 * Uses regex-based extraction for maximum compatibility with Bun.
 *
 * Supports:
 * - TypeScript/JavaScript
 * - Python
 * - Svelte
 * - Go, Rust (basic support)
 * - Other languages (generic fallback)
 */

/** Code map entry types */
export type CodeMapEntryType =
  | "import"
  | "export"
  | "function"
  | "class"
  | "interface"
  | "type"
  | "const"
  | "method"
  | "property";

/** A single code map entry */
export interface CodeMapEntry {
  type: CodeMapEntryType;
  signature: string;
  line: number;
}

/** Complete code map for a file */
export interface CodeMap {
  path: string;
  language: string;
  entries: CodeMapEntry[];
  /** Original file size in bytes */
  originalSize: number;
  /** Code map size in bytes (for token estimation) */
  mapSize: number;
  /** Compression ratio (1 - mapSize/originalSize) */
  compressionRatio: number;
}

/** Supported languages */
type SupportedLanguage = "typescript" | "javascript" | "python" | "svelte" | "go" | "rust" | "unknown";

/**
 * Detect language from file path
 */
function detectLanguage(filePath: string): SupportedLanguage {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";

  switch (ext) {
    case "ts":
    case "tsx":
    case "mts":
    case "cts":
      return "typescript";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript";
    case "py":
    case "pyw":
      return "python";
    case "svelte":
      return "svelte";
    case "go":
      return "go";
    case "rs":
      return "rust";
    default:
      return "unknown";
  }
}

/**
 * Get line number for a character index
 */
function getLineNumber(content: string, charIndex: number): number {
  return content.slice(0, charIndex).split("\n").length;
}

/**
 * Extract TypeScript/JavaScript code map using regex
 */
function extractTypeScriptCodeMap(content: string): CodeMapEntry[] {
  const entries: CodeMapEntry[] = [];
  const lines = content.split("\n");

  // Track brace depth to skip function bodies
  let braceDepth = 0;
  let insideFunction = false;

  // Process line by line for better accuracy
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;

    // Track brace depth
    const openBraces = (trimmed.match(/\{/g) || []).length;
    const closeBraces = (trimmed.match(/\}/g) || []).length;

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
      braceDepth += openBraces - closeBraces;
      continue;
    }

    // Skip lines inside function bodies (depth > 1 means we're past the function signature)
    if (insideFunction && braceDepth > 1) {
      braceDepth += openBraces - closeBraces;
      if (braceDepth <= 0) insideFunction = false;
      continue;
    }

    // Imports
    if (trimmed.startsWith("import ")) {
      entries.push({ type: "import", signature: trimmed, line: lineNum });
      continue;
    }

    // Re-exports
    if (trimmed.startsWith("export {") || trimmed.startsWith("export *")) {
      entries.push({ type: "export", signature: trimmed, line: lineNum });
      continue;
    }

    // Interfaces
    const interfaceMatch = trimmed.match(/^(?:export\s+)?interface\s+(\w+)(?:<[^>]+>)?(?:\s+extends\s+[^{]+)?/);
    if (interfaceMatch) {
      // Collect interface body signatures
      const interfaceSig = trimmed.replace(/\s*\{.*$/, "");
      entries.push({ type: "interface", signature: interfaceSig, line: lineNum });

      // Extract interface members until closing brace
      let j = i + 1;
      let braceCount = trimmed.includes("{") ? 1 : 0;
      while (j < lines.length && braceCount >= 0) {
        const memberLine = lines[j].trim();
        if (memberLine.includes("{")) braceCount++;
        if (memberLine.includes("}")) braceCount--;
        if (braceCount > 0 && memberLine && !memberLine.startsWith("//") && !memberLine.startsWith("}")) {
          const cleaned = memberLine.replace(/[,;]$/, "").trim();
          if (cleaned && !cleaned.startsWith("{")) {
            entries.push({ type: "property", signature: `  ${cleaned}`, line: j + 1 });
          }
        }
        if (braceCount === 0) break;
        j++;
      }
      continue;
    }

    // Type aliases
    const typeMatch = trimmed.match(/^(?:export\s+)?type\s+(\w+)(?:<[^>]+>)?\s*=/);
    if (typeMatch) {
      // Get the type value, truncate if too long
      let typeValue = trimmed.slice(trimmed.indexOf("=") + 1).trim();
      if (typeValue.length > 80) typeValue = typeValue.slice(0, 80) + "...";
      entries.push({ type: "type", signature: `type ${typeMatch[1]} = ${typeValue}`, line: lineNum });
      continue;
    }

    // Classes
    const classMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:<[^>]+>)?(?:\s+(?:extends|implements)\s+[^{]+)?/);
    if (classMatch) {
      const classSig = trimmed.replace(/\s*\{.*$/, "");
      entries.push({ type: "class", signature: classSig, line: lineNum });

      // Extract class members
      let j = i + 1;
      let braceCount = trimmed.includes("{") ? 1 : 0;
      while (j < lines.length && braceCount > 0) {
        const memberLine = lines[j].trim();
        if (memberLine.includes("{")) braceCount++;
        if (memberLine.includes("}")) braceCount--;

        // Method signatures (exclude control flow keywords)
        const controlFlowKeywords = /^(if|else|for|while|switch|try|catch|finally|do|return|throw|break|continue|yield|await)\b/;
        const methodMatch = memberLine.match(
          /^(?:(?:public|private|protected|static|async|readonly)\s+)*(\w+)(?:<[^>]+>)?\s*\([^)]*\)(?:\s*:\s*[^{]+)?/
        );
        if (methodMatch && braceCount > 0 && !controlFlowKeywords.test(memberLine)) {
          const sig = memberLine.replace(/\s*\{.*$/, "").trim();
          entries.push({ type: "method", signature: `  ${sig}`, line: j + 1 });
        }

        // Property signatures
        const propMatch = memberLine.match(/^(?:(?:public|private|protected|static|readonly)\s+)*(\w+)(?:\?)?:\s*[^=;]+/);
        if (propMatch && !methodMatch && braceCount > 0) {
          const sig = memberLine.replace(/[;,]$/, "").trim();
          if (!sig.includes("(")) {
            entries.push({ type: "property", signature: `  ${sig}`, line: j + 1 });
          }
        }

        j++;
      }
      continue;
    }

    // Functions (export function, async function, function)
    const funcMatch = trimmed.match(
      /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*(\w+)(?:<[^>]+>)?\s*\([^)]*\)(?:\s*:\s*[^{]+)?/
    );
    if (funcMatch) {
      const sig = trimmed.replace(/\s*\{.*$/, "").trim();
      entries.push({ type: "function", signature: sig, line: lineNum });
      // Mark as inside function if this line opens a brace
      if (openBraces > closeBraces) {
        insideFunction = true;
        braceDepth += openBraces - closeBraces;
      }
      continue;
    }

    // Arrow functions assigned to const/export const
    const arrowMatch = trimmed.match(
      /^(?:export\s+)?const\s+(\w+)(?:\s*:\s*[^=]+)?\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*(?::\s*[^=]+)?\s*=>/
    );
    if (arrowMatch) {
      // Simplify the signature
      const name = arrowMatch[1];
      const hasAsync = trimmed.includes("async");
      const paramsMatch = trimmed.match(/=\s*(?:async\s+)?(\([^)]*\)|\w+)/);
      const params = paramsMatch ? paramsMatch[1] : "()";
      entries.push({
        type: "function",
        signature: `const ${name} = ${hasAsync ? "async " : ""}${params} => ...`,
        line: lineNum,
      });
      // Mark as inside function if this line opens a brace
      if (openBraces > closeBraces) {
        insideFunction = true;
        braceDepth += openBraces - closeBraces;
      }
      continue;
    }

    // Exported const with type annotation (only at top level)
    if (braceDepth === 0) {
      const constMatch = trimmed.match(/^(?:export\s+)?const\s+(\w+)\s*:\s*([^=]+)\s*=/);
      if (constMatch) {
        entries.push({
          type: "const",
          signature: `const ${constMatch[1]}: ${constMatch[2].trim()}`,
          line: lineNum,
        });
        braceDepth += openBraces - closeBraces;
        continue;
      }
    }

    // Update brace depth for unmatched lines
    braceDepth += openBraces - closeBraces;
    if (braceDepth <= 0) {
      insideFunction = false;
      braceDepth = 0;
    }
  }

  return entries;
}

/**
 * Extract Python code map using regex
 */
function extractPythonCodeMap(content: string): CodeMapEntry[] {
  const entries: CodeMapEntry[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;
    const indent = line.match(/^(\s*)/)?.[1] || "";

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Imports
    if (trimmed.startsWith("import ") || trimmed.startsWith("from ")) {
      entries.push({ type: "import", signature: trimmed, line: lineNum });
      continue;
    }

    // Classes
    const classMatch = trimmed.match(/^class\s+(\w+)(?:\([^)]*\))?:/);
    if (classMatch) {
      entries.push({ type: "class", signature: trimmed.replace(/:$/, ""), line: lineNum });

      // Extract methods
      let j = i + 1;
      while (j < lines.length) {
        const memberLine = lines[j];
        const memberTrimmed = memberLine.trim();
        const memberIndent = memberLine.match(/^(\s*)/)?.[1] || "";

        // Stop if we hit something at same or lower indent level
        if (memberTrimmed && memberIndent.length <= indent.length && !memberTrimmed.startsWith("#")) {
          break;
        }

        // Method definition
        const methodMatch = memberTrimmed.match(/^(?:async\s+)?def\s+(\w+)\s*\([^)]*\)(?:\s*->\s*[^:]+)?:/);
        if (methodMatch) {
          const sig = memberTrimmed.replace(/:$/, "");
          entries.push({ type: "method", signature: `    ${sig}`, line: j + 1 });
        }

        j++;
      }
      continue;
    }

    // Top-level functions
    const funcMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)\s*\([^)]*\)(?:\s*->\s*[^:]+)?:/);
    if (funcMatch && indent.length === 0) {
      const sig = trimmed.replace(/:$/, "");
      entries.push({ type: "function", signature: sig, line: lineNum });
      continue;
    }
  }

  return entries;
}

/**
 * Extract Svelte code map
 */
function extractSvelteCodeMap(content: string): CodeMapEntry[] {
  const entries: CodeMapEntry[] = [];

  // Extract script module block
  const moduleMatch = content.match(/<script\s+(?:context="module"|module)[^>]*>([\s\S]*?)<\/script>/);
  if (moduleMatch) {
    const scriptEntries = extractTypeScriptCodeMap(moduleMatch[1]);
    entries.push(
      ...scriptEntries.map((e) => ({
        ...e,
        signature: `[module] ${e.signature}`,
      }))
    );
  }

  // Extract regular script block
  const scriptMatch = content.match(/<script(?:\s+lang="ts")?[^>]*>(?![\s\S]*context="module")([\s\S]*?)<\/script>/);
  if (scriptMatch && (!moduleMatch || scriptMatch.index !== moduleMatch.index)) {
    const scriptEntries = extractTypeScriptCodeMap(scriptMatch[1]);
    entries.push(...scriptEntries);
  }

  // Extract $props rune (Svelte 5)
  const propsMatch = content.match(/let\s*\{([^}]+)\}\s*=\s*\$props\s*<([^>]+)>\s*\(\)/);
  if (propsMatch) {
    entries.push({
      type: "property",
      signature: `$props<${propsMatch[2].trim()}>(): { ${propsMatch[1].trim()} }`,
      line: 1,
    });
  }

  // Extract snippets
  const snippetRegex = /\{#snippet\s+(\w+)\s*\(([^)]*)\)\}/g;
  let match;
  while ((match = snippetRegex.exec(content)) !== null) {
    entries.push({
      type: "function",
      signature: `{#snippet ${match[1]}(${match[2]})}`,
      line: getLineNumber(content, match.index),
    });
  }

  return entries;
}

/**
 * Extract Go code map
 */
function extractGoCodeMap(content: string): CodeMapEntry[] {
  const entries: CodeMapEntry[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;

    // Package
    if (trimmed.startsWith("package ")) {
      entries.push({ type: "import", signature: trimmed, line: lineNum });
      continue;
    }

    // Imports
    if (trimmed.startsWith("import ")) {
      entries.push({ type: "import", signature: trimmed, line: lineNum });
      continue;
    }

    // Functions
    const funcMatch = trimmed.match(/^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\([^)]*\)(?:\s*\([^)]*\)|\s*\w+)?/);
    if (funcMatch) {
      const sig = trimmed.replace(/\s*\{.*$/, "");
      entries.push({ type: "function", signature: sig, line: lineNum });
      continue;
    }

    // Types (struct, interface)
    const typeMatch = trimmed.match(/^type\s+(\w+)\s+(struct|interface)/);
    if (typeMatch) {
      entries.push({
        type: typeMatch[2] === "interface" ? "interface" : "class",
        signature: `type ${typeMatch[1]} ${typeMatch[2]}`,
        line: lineNum,
      });
      continue;
    }
  }

  return entries;
}

/**
 * Extract Rust code map
 */
function extractRustCodeMap(content: string): CodeMapEntry[] {
  const entries: CodeMapEntry[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;

    // Use statements
    if (trimmed.startsWith("use ")) {
      entries.push({ type: "import", signature: trimmed.replace(/;$/, ""), line: lineNum });
      continue;
    }

    // Functions
    const funcMatch = trimmed.match(/^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)(?:<[^>]+>)?\s*\([^)]*\)(?:\s*->\s*[^{]+)?/);
    if (funcMatch) {
      const sig = trimmed.replace(/\s*\{.*$/, "").replace(/\s*where\s+.*$/, "");
      entries.push({ type: "function", signature: sig, line: lineNum });
      continue;
    }

    // Structs
    const structMatch = trimmed.match(/^(?:pub\s+)?struct\s+(\w+)/);
    if (structMatch) {
      entries.push({ type: "class", signature: trimmed.replace(/\s*\{.*$/, ""), line: lineNum });
      continue;
    }

    // Enums
    const enumMatch = trimmed.match(/^(?:pub\s+)?enum\s+(\w+)/);
    if (enumMatch) {
      entries.push({ type: "type", signature: trimmed.replace(/\s*\{.*$/, ""), line: lineNum });
      continue;
    }

    // Traits
    const traitMatch = trimmed.match(/^(?:pub\s+)?trait\s+(\w+)/);
    if (traitMatch) {
      entries.push({ type: "interface", signature: trimmed.replace(/\s*\{.*$/, ""), line: lineNum });
      continue;
    }

    // Impl blocks
    const implMatch = trimmed.match(/^impl(?:<[^>]+>)?\s+(?:(\w+)\s+for\s+)?(\w+)/);
    if (implMatch) {
      entries.push({ type: "class", signature: trimmed.replace(/\s*\{.*$/, ""), line: lineNum });
      continue;
    }
  }

  return entries;
}

/**
 * Generic fallback extraction
 */
function extractFallbackCodeMap(content: string): CodeMapEntry[] {
  const entries: CodeMapEntry[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const lineNum = i + 1;

    // Common import patterns
    if (/^(?:import|from|require|use|include|#include)\s+/.test(trimmed)) {
      entries.push({ type: "import", signature: trimmed.slice(0, 150), line: lineNum });
    }
    // Common function patterns
    else if (/^(?:(?:pub\s+)?(?:async\s+)?(?:fn|func|function|def|sub)\s+\w+)/.test(trimmed)) {
      entries.push({ type: "function", signature: trimmed.slice(0, 150), line: lineNum });
    }
    // Common class patterns
    else if (/^(?:class|struct|enum)\s+\w+/.test(trimmed)) {
      entries.push({ type: "class", signature: trimmed.slice(0, 150), line: lineNum });
    }
  }

  return entries;
}

/**
 * Extract code map from a file
 */
export function extractCodeMap(filePath: string, content: string): CodeMap {
  const language = detectLanguage(filePath);
  let entries: CodeMapEntry[] = [];

  switch (language) {
    case "typescript":
    case "javascript":
      entries = extractTypeScriptCodeMap(content);
      break;
    case "python":
      entries = extractPythonCodeMap(content);
      break;
    case "svelte":
      entries = extractSvelteCodeMap(content);
      break;
    case "go":
      entries = extractGoCodeMap(content);
      break;
    case "rust":
      entries = extractRustCodeMap(content);
      break;
    default:
      entries = extractFallbackCodeMap(content);
  }

  // Calculate sizes
  const originalSize = content.length;
  const mapContent = entries.map((e) => e.signature).join("\n");
  const mapSize = mapContent.length;
  const compressionRatio = originalSize > 0 ? 1 - mapSize / originalSize : 0;

  return {
    path: filePath,
    language,
    entries,
    originalSize,
    mapSize,
    compressionRatio,
  };
}

/**
 * Extract code map from a file path
 */
export async function extractCodeMapFromFile(filePath: string): Promise<CodeMap | null> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return null;
  }

  const content = await file.text();
  return extractCodeMap(filePath, content);
}

/**
 * Format a code map as a string for inclusion in context
 */
export function formatCodeMap(codeMap: CodeMap): string {
  if (codeMap.entries.length === 0) {
    return `// ${codeMap.path} (no extractable signatures)`;
  }

  const lines = [`// ${codeMap.path} (${Math.round(codeMap.compressionRatio * 100)}% smaller)`];

  for (const entry of codeMap.entries) {
    lines.push(entry.signature);
  }

  return lines.join("\n");
}

/**
 * Estimate tokens for a code map
 */
export function estimateCodeMapTokens(codeMap: CodeMap): number {
  return Math.ceil(codeMap.mapSize / 4);
}
