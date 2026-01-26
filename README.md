# wdyt

Code review context builder for LLMs - get a second opinion on your code.

A CLI tool that exports code context for AI review, powered by tree-sitter AST analysis and call graph traversal via [llm-tldr](https://github.com/aorwall/llm-tldr). Adaptive review strategies automatically select the best approach for each task.

## What is wdyt?

wdyt is a drop-in replacement for rp-cli (RepoPrompt) that provides:

- **Tree-sitter AST analysis** - Accurate code structure extraction across 16+ languages via llm-tldr
- **Call graph impact analysis** - Knows which files are affected by your changes
- **Semantic search** - Finds behaviorally related code, not just text matches
- **Adaptive review strategies** - Single-pass, multi-pass, or exploration based on task characteristics
- **Smart context building** - Code maps for large files, full content for changed files
- **Complexity-aware decisions** - High cyclomatic complexity automatically triggers deeper review
- **Token budget management** - Stays within Claude's context limits
- **flowctl compatibility** - 100% interface compatibility with rp-cli

## Installation

```bash
# Install globally (provides both wdyt and rp-cli commands)
bun add -g wdyt

# Or run directly with bunx
bunx wdyt -e 'windows'
```

### Prerequisites

wdyt requires [uv](https://docs.astral.sh/uv/) (the Python package runner) to run llm-tldr:

```bash
# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh
```

On first review, wdyt automatically installs llm-tldr via `uvx` and indexes your project. No manual setup needed.

## Analysis Engine: llm-tldr

wdyt delegates all code analysis to [llm-tldr](https://github.com/aorwall/llm-tldr), a Python tool that provides:

| Capability | What it does | tldr command |
|------------|-------------|--------------|
| **Structure** | Tree-sitter AST extraction of functions, classes, types | `tldr structure <file>` |
| **Impact** | Call graph traversal - find all callers/callees of a function | `tldr impact <func>` |
| **Semantic** | Embedding-based search for behaviorally related code | `tldr semantic <query>` |
| **Complexity** | Cyclomatic complexity via control flow graph analysis | `tldr cfg <file> <func>` |

All commands run via `uvx --from llm-tldr tldr` in isolated Python environments. wdyt communicates with tldr over JSON-over-stdout:

```
wdyt (Bun/TypeScript)                    llm-tldr (Python)
━━━━━━━━━━━━━━━━━━━━                    ━━━━━━━━━━━━━━━━━

TldrClient.structure("file.ts")
       │
       ▼
  Bun.spawn(["uvx", "--from",     ────▶  tree-sitter parser
    "llm-tldr", "tldr",                  (16+ language grammars)
    "structure", "file.ts",
    "--json"])
       │
       │◀── stdout: JSON ────────────── [{"name":"foo",
       │                                   "type":"function",
       ▼                                   "line":42,
  JSON.parse() → typed result              "signature":"..."}]
```

### How Analysis Works

**On first run**, wdyt auto-warms the llm-tldr index:

```bash
# Automatic (happens on first review)
wdyt -w 1 -t <tab> -e 'call chat_send {...}'
# stderr: "Warming llm-tldr index (first run)..."

# Or manual
wdyt -e 'tldr warm'
```

This builds tree-sitter ASTs, call graphs, and semantic embeddings for your project. Subsequent runs use the cached index.

**During review**, wdyt runs a multi-stage analysis pipeline:

```
Changed files
     │
     ▼
┌─ Stage 1: Structure ─────────────────────────────────────┐
│  tldr.structure() on each changed file                   │
│  → extracts all functions, classes, types via tree-sitter │
│  → used for code maps AND symbol extraction              │
└──────────────────────────────────────────────────────────┘
     │
     ▼
┌─ Stage 2: Impact Analysis ───────────────────────────────┐
│  tldr.impact() on each symbol from changed files         │
│  → traverses call graph to find all callers              │
│  → callers get +50 priority in file ranking              │
│  → callers become context hints for the reviewer         │
└──────────────────────────────────────────────────────────┘
     │
     ▼
┌─ Stage 3: Semantic Search ───────────────────────────────┐
│  tldr.semantic() with diff-derived query                 │
│  → finds behaviorally related files via embeddings       │
│  → catches relationships that call graphs miss           │
│  → merged with impact results, deduplicated              │
└──────────────────────────────────────────────────────────┘
     │
     ▼
┌─ Stage 4: Context Building ──────────────────────────────┐
│  Files ranked by priority:                               │
│    Changed files:      +100                              │
│    Impact callers:     +50  (NEW - from call graph)      │
│    Entry points:       +30                               │
│    Config files:       +20                               │
│    Small files:        +10                               │
│    Test/large files:   -10                               │
│                                                          │
│  High-priority: full content                             │
│  Low-priority:  code map (signatures only, 70-90% smaller│
│  Over-budget:   excluded                                 │
└──────────────────────────────────────────────────────────┘
     │
     ▼
  RepoPrompt-compatible XML output
```

### Why llm-tldr Instead of Regex?

The previous version used regex patterns to extract code structure. This had fundamental limitations:

| Aspect | Regex (old) | Tree-sitter AST (new) |
|--------|------------|----------------------|
| **Languages** | 5 (TS, Python, Go, Rust, Svelte) | 16+ (adds Java, Ruby, C/C++, C#, Kotlin, Swift, PHP, Scala, Zig, Lua) |
| **Accuracy** | ~80% (misses decorators, nested scopes, complex generics) | ~99% (full AST parse) |
| **References** | `git grep -w` (text matching, no semantic understanding) | Call graph traversal (knows caller/callee relationships) |
| **Related code** | None | Semantic embeddings (FAISS + transformer) |
| **Complexity** | None | Cyclomatic complexity via CFG analysis |
| **Maintenance** | 599 lines of fragile regex per language | Zero - llm-tldr handles all parsing |

## How it Differs from RepoPrompt

| Aspect | rp-cli (RepoPrompt) | wdyt |
|--------|---------------------|------|
| **Philosophy** | Pack everything | Smart selection with AST analysis |
| **Code understanding** | None | Tree-sitter AST + call graphs |
| **File handling** | All files = full content | Changed = full, impacted = prioritized, rest = code maps |
| **Impact awareness** | None | Call graph identifies affected files |
| **Context limit** | Hard fail at ~120k tokens | Adaptive strategies with token budgeting |
| **Review quality** | Depends on context size | Optimized via complexity + impact analysis |
| **Cost** | 1 large API call | Adaptive (1-4 calls) |

## The Adaptive Strategy System

wdyt automatically selects the best review strategy:

```
┌─────────────────────────────────────────────────────────────┐
│                  STRATEGY SELECTION                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Small changes (≤3 files, <500 lines)                       │
│  ┌─────────────────────────────────────┐                    │
│  │ OPTION A: Single-Pass              │                    │
│  │ • Spec + Guidelines + Code          │                    │
│  │ • 1 API call                        │                    │
│  │ • Fast, cheap, good for most cases  │                    │
│  └─────────────────────────────────────┘                    │
│                                                             │
│  Large/Critical changes (>10 files OR security review)      │
│  ┌─────────────────────────────────────┐                    │
│  │ OPTION B: Multi-Pass               │                    │
│  │ • 3 parallel review agents          │                    │
│  │ • Confidence scoring (80+ filter)   │                    │
│  │ • Higher accuracy, catches more     │                    │
│  └─────────────────────────────────────┘                    │
│                                                             │
│  High complexity (avg cyclomatic > 15)          ◀── NEW     │
│  ┌─────────────────────────────────────┐                    │
│  │ OPTION B: Multi-Pass (auto-upgrade)│                    │
│  │ • Complex code has subtle bugs      │                    │
│  │ • Focuses: correctness, edge-cases  │                    │
│  └─────────────────────────────────────┘                    │
│                                                             │
│  Unknown scope (audit, exploration)                         │
│  ┌─────────────────────────────────────┐                    │
│  │ OPTION C: Agentic Exploration      │                    │
│  │ • Agent uses glob/grep/read tools   │                    │
│  │ • Discovers relevant files itself   │                    │
│  │ • No context limit constraints      │                    │
│  └─────────────────────────────────────┘                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### When Each Strategy is Used

| Scenario | Strategy | Why |
|----------|----------|-----|
| Bug fix (1-2 files) | Single-Pass | Fast, focused |
| Feature PR (5 files) | Single-Pass | Spec + changes fit |
| Major refactor (15+ files) | Multi-Pass | Need multiple perspectives |
| Complex logic (cyclomatic > 15) | Multi-Pass | Subtle bugs need deeper analysis |
| Security audit | Multi-Pass | Critical, need confidence scoring |
| "Review this repo" | Exploration | Unknown scope |
| CI/CD quick check | Single-Pass | Speed matters |

## Research-Backed Decisions

wdyt's architecture is based on research findings:

1. **Problem descriptions boost accuracy +22%** ([arxiv 2505.20206](https://arxiv.org/abs/2505.20206))
   - wdyt prioritizes task specs in context

2. **Less context = better reviews** (Claude official code-review)
   - 60 files hurts accuracy; changed files + code maps is better

3. **Multiple perspectives catch more issues** (Claude documentation)
   - Multi-pass for large changes > single pass

4. **Confidence scoring reduces false positives** (Claude official)
   - Filter to 80+ confidence only

5. **Call graph context improves understanding** (llm-tldr)
   - Knowing what calls what reveals the blast radius of changes

## Quick Start

```bash
# List windows
wdyt -e 'windows'

# Create a new tab in window 1
wdyt -w 1 -e 'builder {}'

# Add files to selection
wdyt -w 1 -t <tab-id> -e 'select add src/cli.ts'

# Export context for review (strategy auto-selected)
wdyt -w 1 -t <tab-id> -e 'call chat_send {"mode":"review"}'

# Check llm-tldr status
wdyt -e 'tldr status'

# Manually warm/reindex the project
wdyt -e 'tldr warm'
```

## Commands

### Expressions

| Expression | Description |
|------------|-------------|
| `windows` | List all windows |
| `builder {"summary":"..."}` | Create a new tab |
| `prompt get` | Get current prompt |
| `prompt export <file>` | Export prompt to file |
| `select get` | Get selected files |
| `select add "path"` | Add file to selection |
| `call chat_send {...}` | Export context for review |
| `tldr warm` | Index/reindex project for llm-tldr |
| `tldr status` | Show uvx availability and index state |

### Flags

| Flag | Description |
|------|-------------|
| `--raw-json` | Output raw JSON |
| `-w <id>` | Window ID |
| `-t <id>` | Tab ID |
| `-e <expr>` | Expression to execute |

## flowctl Compatibility

wdyt is a 100% drop-in replacement for rp-cli. No flowctl changes needed.

```
flowctl calls:
  rp-cli -w <window> -t <tab> -e "call chat_send {json}"

wdyt accepts same call:
  wdyt -w <window> -t <tab> -e "call chat_send {json}"
```

The package.json includes both `wdyt` and `rp-cli` bin entries, so installing wdyt globally provides the rp-cli command automatically.

### Payload Format (unchanged)

```json
{
  "message": "Review this code",
  "mode": "chat",
  "new_chat": true,
  "chat_name": "fn-5-review",
  "selected_paths": ["src/file1.ts", "src/file2.ts"]
}
```

### Output Format (unchanged)

```
Chat: `<uuid>`

<review text>

<verdict>SHIP|NEEDS_WORK|MAJOR_RETHINK</verdict>
```

## Architecture

```
src/
├── cli.ts                  # CLI entry point (+ tldr warm/status)
├── tldr/
│   ├── types.ts            # llm-tldr JSON output types
│   ├── client.ts           # TldrClient subprocess wrapper
│   └── index.ts            # Re-exports
├── commands/
│   ├── chat.ts             # chat_send command (creates TldrClient, auto-warms)
│   ├── builder.ts          # Tab creation
│   ├── prompt.ts           # Prompt management
│   ├── select.ts           # File selection
│   └── windows.ts          # Window listing
├── context/
│   ├── strategy.ts         # Adaptive strategy selection (+ complexity awareness)
│   ├── builder.ts          # Context XML building (+ impact-aware ranking)
│   ├── codemap.ts          # Code map extraction via tldr structure
│   ├── symbols.ts          # Symbol extraction via tldr structure
│   ├── references.ts       # Reference finding via tldr impact
│   ├── hints.ts            # Context hints via tldr semantic + impact
│   ├── multipass.ts        # Multi-pass review handler
│   ├── exploration.ts      # Agentic exploration handler
│   ├── rereview.ts         # Re-review cache busting
│   └── index.ts            # Exports (including TldrClient)
├── git/
│   └── diff.ts             # Git diff utilities
├── flow/
│   └── specs.ts            # Flow-Next spec loading
└── state.ts                # Window/tab state management

skills/
└── quality-auditor.md      # Review prompt with chain-of-thought
```

### Data Flow

```
User invokes review
       │
       ▼
  CLI (cli.ts) → chatSendCommand (chat.ts)
       │
       ├── TldrClient created
       │   └── ensureWarmed() → uvx tldr warm (first run only)
       │
       ├── buildOptimizedContext (builder.ts)
       │   ├── Impact analysis: tldr.structure() + tldr.impact()
       │   │   └── Identifies files affected by changes (+50 priority)
       │   ├── rankFiles() with impact-aware scoring
       │   ├── buildContextPlan() with tldr-powered code maps
       │   └── buildContextXml() → RepoPrompt-compatible XML
       │
       ├── Strategy selection (strategy.ts)
       │   └── Complexity from tldr.cfg() can upgrade to multi-pass
       │
       └── Review execution
           ├── Single-pass: Claude CLI with context XML
           ├── Multi-pass: 3 parallel agents, confidence merge
           └── Exploration: Agentic with tools
```

## Supported Languages

Via llm-tldr's tree-sitter grammars:

TypeScript, JavaScript, Python, Go, Rust, Ruby, Java, Kotlin, Swift, C, C++, C#, PHP, Scala, Zig, Lua, Svelte

## Requirements

- [Bun](https://bun.sh) runtime
- [uv](https://docs.astral.sh/uv/) (Python package runner) - for llm-tldr
- [Claude CLI](https://www.anthropic.com/claude) (for actual reviews)

## License

MIT
