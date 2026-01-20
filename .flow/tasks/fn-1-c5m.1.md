# fn-1-c5m.1 Project scaffolding and CLI parser

## Description
Set up the Bun project structure and CLI using **citty** (modern CLI framework from UnJS).

**Size:** S
**Files:** `package.json`, `src/cli.ts`, `src/types.ts`

## Approach
- Use `citty` for CLI definition (subcommands, flags, help)
- Parse: `--raw-json`, `-w <window>`, `-t <tab>`, `-e "<expression>"`
- Route expressions to command handlers
- Use `defineCommand` pattern from citty

## Key context
- citty docs: https://unjs.io/packages/citty
- `defineCommand({ meta, args, run })` pattern
- Bun-compatible, TypeScript-first
## Approach
- Use `util.parseArgs` for CLI flags (no external deps)
- Parse: `--raw-json`, `-w <window>`, `-t <tab>`, `-e "<expression>"`
- Route expressions to command handlers

## Key context
- Bun.argv[0] is 'bun', [1] is script, slice(2) for args
- Use shebang `#!/usr/bin/env bun`
## Acceptance
- [ ] `package.json` with citty, `"type": "module"`, bun types
- [ ] CLI parses `--raw-json`, `-w`, `-t`, `-e` flags using citty
- [ ] Unknown expressions return error with code 1
- [ ] `bun run src/cli.ts --help` shows usage
## Done summary
TBD

## Evidence
- Commits:
- Tests:
- PRs:
