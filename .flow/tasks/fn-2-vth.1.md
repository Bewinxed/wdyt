# fn-2-vth.1 Symbol extraction module

## Description
## Symbol Extraction Module

Create `src/context/symbols.ts` that extracts symbols from source files.

### Requirements
- Extract function names, class names, type definitions, interface names
- Support languages: TypeScript/JavaScript, Python, Go, Rust
- Use regex patterns similar to flowctl's `extract_symbols_from_file()` (line 459-576)
- Return array of `{ name: string, type: 'function'|'class'|'type'|'interface', line: number }`

### Implementation Reference (from flowctl.py)
```python
# TypeScript/JavaScript patterns:
r"(?:export\s+)?(?:async\s+)?function\s+(\w+)"
r"(?:export\s+)?class\s+(\w+)"
r"(?:export\s+)?(?:type|interface)\s+(\w+)"
r"(?:export\s+)?const\s+(\w+)\s*="

# Python patterns:
r"^(?:async\s+)?def\s+(\w+)"
r"^class\s+(\w+)"
```

### Acceptance Criteria
- [ ] Extracts symbols from .ts/.js files
- [ ] Extracts symbols from .py files  
- [ ] Extracts symbols from .go files
- [ ] Extracts symbols from .rs files
- [ ] Returns line numbers for each symbol
- [ ] Unit tests pass
## Acceptance
- [ ] TBD

## Done summary
TBD

## Evidence
- Commits:
- Tests:
- PRs:
