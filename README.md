# second-opinion

Code review context builder for LLMs - get a second opinion on your code.

A CLI tool that exports code context for AI review, compatible with flowctl/flow-next.

## Installation

```bash
# Run directly with bunx (recommended)
bunx second-opinion init

# Or install globally
bun add -g second-opinion
```

## Quick Start

```bash
# Interactive setup - creates data directory and optionally adds rp-cli alias
bunx second-opinion init

# List windows
second-opinion -e 'windows'

# Create a new tab in window 1
second-opinion -w 1 -e 'builder {}'

# Add files to selection
second-opinion -w 1 -t <tab-id> -e 'select add src/cli.ts'

# Export context for review
second-opinion -w 1 -t <tab-id> -e 'call chat_send {"mode":"review"}'
```

## Commands

### Setup

```bash
second-opinion init              # Interactive setup
second-opinion init --global     # Install binary globally
second-opinion init --rp-alias   # Create rp-cli alias (for flowctl)
second-opinion init --no-alias   # Skip rp-cli alias prompt
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
bunx second-opinion init --rp-alias
```

## Requirements

- [Bun](https://bun.sh) runtime

## License

MIT
