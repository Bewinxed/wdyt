/**
 * Symbol extraction module for wdyt
 *
 * Extracts function names, class names, type definitions, and interface names
 * from source files in multiple languages.
 */

/** Symbol types that can be extracted from source code */
export type SymbolType = "function" | "class" | "type" | "interface" | "const";

/** Extracted symbol information */
export interface Symbol {
  name: string;
  type: SymbolType;
  line: number;
}

/** Language-specific regex patterns for symbol extraction */
interface LanguagePatterns {
  patterns: Array<{
    regex: RegExp;
    type: SymbolType;
  }>;
}

/**
 * TypeScript/JavaScript patterns
 * Matches: export function, async function, class, type, interface, const
 */
const TYPESCRIPT_PATTERNS: LanguagePatterns = {
  patterns: [
    {
      regex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
      type: "function",
    },
    {
      regex: /(?:export\s+)?class\s+(\w+)/g,
      type: "class",
    },
    {
      regex: /(?:export\s+)?type\s+(\w+)/g,
      type: "type",
    },
    {
      regex: /(?:export\s+)?interface\s+(\w+)/g,
      type: "interface",
    },
    {
      // Match const with optional type annotation: const FOO: Type = or const FOO =
      regex: /(?:export\s+)?const\s+(\w+)(?:\s*:\s*[^=]+)?\s*=/g,
      type: "const",
    },
  ],
};

/**
 * Python patterns
 * Matches: def, async def, class (including indented methods)
 */
const PYTHON_PATTERNS: LanguagePatterns = {
  patterns: [
    {
      // Match def at any indentation level (for methods inside classes)
      // Use [ \t]* for horizontal whitespace only (not newlines)
      regex: /^[ \t]*(?:async\s+)?def\s+(\w+)/gm,
      type: "function",
    },
    {
      regex: /^class\s+(\w+)/gm,
      type: "class",
    },
  ],
};

/**
 * Go patterns
 * Matches: func, type struct, type interface
 */
const GO_PATTERNS: LanguagePatterns = {
  patterns: [
    {
      regex: /^func\s+(?:\([^)]+\)\s+)?(\w+)/gm,
      type: "function",
    },
    {
      regex: /^type\s+(\w+)\s+struct/gm,
      type: "class",
    },
    {
      regex: /^type\s+(\w+)\s+interface/gm,
      type: "interface",
    },
  ],
};

/**
 * Rust patterns
 * Matches: fn, pub fn, struct, pub struct, trait, pub trait, impl, type alias
 */
const RUST_PATTERNS: LanguagePatterns = {
  patterns: [
    {
      regex: /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g,
      type: "function",
    },
    {
      regex: /(?:pub\s+)?struct\s+(\w+)/g,
      type: "class",
    },
    {
      regex: /(?:pub\s+)?trait\s+(\w+)/g,
      type: "interface",
    },
    {
      // Match type alias with optional generic params: type Foo<T> = or type Foo =
      regex: /(?:pub\s+)?type\s+(\w+)(?:<[^>]*>)?\s*=/g,
      type: "type",
    },
  ],
};

/** File extensions to language pattern mapping */
const EXTENSION_PATTERNS: Record<string, LanguagePatterns> = {
  ".ts": TYPESCRIPT_PATTERNS,
  ".tsx": TYPESCRIPT_PATTERNS,
  ".js": TYPESCRIPT_PATTERNS,
  ".jsx": TYPESCRIPT_PATTERNS,
  ".mjs": TYPESCRIPT_PATTERNS,
  ".cjs": TYPESCRIPT_PATTERNS,
  ".py": PYTHON_PATTERNS,
  ".go": GO_PATTERNS,
  ".rs": RUST_PATTERNS,
};

/**
 * Get the file extension from a file path
 */
function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filePath.slice(lastDot).toLowerCase();
}

/**
 * Get line number for a given character index in content
 */
function getLineNumber(content: string, charIndex: number): number {
  let lineNumber = 1;
  for (let i = 0; i < charIndex && i < content.length; i++) {
    if (content[i] === "\n") {
      lineNumber++;
    }
  }
  return lineNumber;
}

/**
 * Extract symbols from file content
 *
 * @param content - The source file content
 * @param filePath - The file path (used to determine language from extension)
 * @returns Array of extracted symbols with name, type, and line number
 */
export function extractSymbols(content: string, filePath: string): Symbol[] {
  const extension = getExtension(filePath);
  const languagePatterns = EXTENSION_PATTERNS[extension];

  if (!languagePatterns) {
    return [];
  }

  const symbols: Symbol[] = [];
  const seen = new Set<string>();

  for (const { regex, type } of languagePatterns.patterns) {
    // Reset regex lastIndex for global patterns
    regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const key = `${name}:${type}:${match.index}`;

      // Avoid duplicates at the same position
      if (seen.has(key)) continue;
      seen.add(key);

      symbols.push({
        name,
        type,
        line: getLineNumber(content, match.index),
      });
    }
  }

  // Sort by line number
  symbols.sort((a, b) => a.line - b.line);

  return symbols;
}

/**
 * Extract symbols from a file path
 *
 * @param filePath - Absolute path to the source file
 * @returns Array of extracted symbols
 */
export async function extractSymbolsFromFile(
  filePath: string
): Promise<Symbol[]> {
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return [];
  }

  const content = await file.text();
  return extractSymbols(content, filePath);
}

/**
 * Check if a file extension is supported for symbol extraction
 */
export function isSupported(filePath: string): boolean {
  const extension = getExtension(filePath);
  return extension in EXTENSION_PATTERNS;
}

/**
 * Get list of supported file extensions
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(EXTENSION_PATTERNS);
}
