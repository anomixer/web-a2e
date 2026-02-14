# impact - Analyze Change Impact

Checks if proposed changes might impact app tools, agent tools, or MCP agent compatibility.

## What to Guard

Changes to these areas need impact analysis:
- **WASM exports** (`src/bindings/wasm_interface.cpp`, `CMakeLists.txt`)
- **Core emulator** (`src/core/emulator.cpp`, CPU, MMU, disk)
- **Agent protocol** (`src/js/agent/agent-manager.js`, AG-UI events)
- **MCP tools** (`appleii-agent/src/tools/`)
- **Tool schemas** (parameter changes, return value changes)

## Analysis Process

1. **Identify change type**:
   - WASM binding change
   - Core emulator logic change
   - Agent communication protocol change
   - Tool schema change
   - Version compatibility change

2. **Check impacts**:
   - **WASM changes**: Grep for affected function names in `src/js/agent/`
   - **Emulator changes**: Check if state serialization affected
   - **Protocol changes**: Verify MCP version compatibility
   - **Schema changes**: Find all tool callers

3. **Generate checklist**:
   - Which tools need updates
   - Which docs need updates
   - Version compatibility considerations
   - Testing requirements

## Progressive Analysis

1. **Quick scan**: Grep for obvious references
2. **Deep scan**: Read affected tool files if matches found
3. **Cross-reference**: Check docs for outdated information
4. **Version check**: Determine if version bump needed

## Output Format

```
Impact Analysis for: [what changed]

Affected App Tools:
- tool-name (file:line) - Why impacted

Affected Agent Tools:
- tool-name (file:line) - Why impacted

Documentation Updates Needed:
- doc-name - What needs updating

Version Impact:
- [ ] Requires app version bump
- [ ] Requires agent version bump
- [ ] Breaking change (major version)

Testing Checklist:
- [ ] Test affected tools
- [ ] Verify docs updated
- [ ] Check version compatibility
```

## Common Change Patterns

**WASM export removed/renamed**:
- Search for `_functionName` in all tool files
- List affected tools
- Suggest migration path

**State structure changed**:
- Check state serialization code
- Verify save/load compatibility
- Consider migration strategy

**Protocol changed**:
- Check agent version compatibility
- Update version requirements
- Document breaking changes
