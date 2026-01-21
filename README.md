# wdyt

Code review context builder for LLMs - get a second opinion on your code.

A CLI tool that exports code context for AI review, compatible with flowctl/flow-next.

## Installation

```bash
# Run directly with bunx (recommended)
bunx wdyt init

# Or install globally
bun add -g wdyt
```

## Quick Start

```bash
# Interactive setup - creates data directory and optionally adds rp-cli alias
bunx wdyt init

# List windows
wdyt -e 'windows'

# Create a new tab in window 1
wdyt -w 1 -e 'builder {}'

# Add files to selection
wdyt -w 1 -t <tab-id> -e 'select add src/cli.ts'

# Export context for review
wdyt -w 1 -t <tab-id> -e 'call chat_send {"mode":"review"}'
```

## Commands

### Setup

```bash
wdyt init              # Interactive setup
wdyt init --global     # Install binary globally
wdyt init --rp-alias   # Create rp-cli alias (for flowctl)
wdyt init --no-alias   # Skip rp-cli alias prompt
```

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

This tool is compatible with [flow-next](https://github.com/gmickel/claude-marketplace) and provides the `rp-cli` interface expected by flowctl.

```bash
# Create the rp-cli alias during init
bunx wdyt init --rp-alias
```

## Requirements

- [Bun](https://bun.sh) runtime

## License

MIT
