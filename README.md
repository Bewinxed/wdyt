# wdyt

Code review context builder for LLMs - get a second opinion on your code.

A CLI tool that exports code context for AI review, with adaptive review strategies that automatically select the best approach for each task.

## What is wdyt?

wdyt is a drop-in replacement for rp-cli (RepoPrompt) that provides:

- **Adaptive review strategies** - Automatically selects single-pass, multi-pass, or exploration based on task characteristics
- **Smart context building** - Code maps for large files, full content for changed files
- **Token budget management** - Stays within Claude's context limits
- **Confidence scoring** - Filters findings to 80%+ confidence to reduce false positives
- **flowctl compatibility** - 100% interface compatibility with rp-cli

## Installation

```bash
# Install globally (provides both wdyt and rp-cli commands)
bun add -g wdyt

# Or run directly with bunx
bunx wdyt -e 'windows'
```

## How it Differs from RepoPrompt

| Aspect | rp-cli (RepoPrompt) | wdyt |
|--------|---------------------|------|
| **Philosophy** | Pack everything | Smart selection |
| **File handling** | All files = full content | Changed = full, imports = code maps |
| **Context limit** | Hard fail at ~120k tokens | Adaptive strategies |
| **Review quality** | Depends on context size | Optimized for accuracy |
| **Cost** | 1 large API call | Adaptive (1-4 calls) |

## The 3-Pronged Adaptive Approach

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
├── cli.ts                  # CLI entry point
├── commands/
│   ├── chat.ts            # chat_send command (main review logic)
│   ├── builder.ts         # Tab creation
│   ├── prompt.ts          # Prompt management
│   ├── select.ts          # File selection
│   └── windows.ts         # Window listing
├── context/
│   ├── strategy.ts        # Adaptive strategy selection
│   ├── builder.ts         # Context XML building
│   ├── codemap.ts         # Code map extraction (signatures only)
│   ├── multipass.ts       # Multi-pass review handler
│   ├── exploration.ts     # Agentic exploration handler
│   └── index.ts           # Exports
└── state/
    └── index.ts           # Window/tab state management

skills/
└── quality-auditor.md     # Review prompt with chain-of-thought
```

## Requirements

- [Bun](https://bun.sh) runtime
- [Claude CLI](https://www.anthropic.com/claude) (for actual reviews)

## License

MIT
