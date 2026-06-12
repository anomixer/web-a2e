# new-app-tool - Create AG-UI App Tool

Creates a new app tool in the emulator frontend that the MCP agent can call.

## Architecture Overview

**Simple flow**: LLM calls `emma_command({ command: "toolName", params: {} })` → MCP forwards via AG-UI protocol → Frontend executes → Result returned.

**Key principle**: New app tools only require frontend changes. MCP server never needs updates.

## Process of Adding a New Tool

1. **Make plan** - Understand requirements
2. **Check for existing tool** - If an existing tool already exists or is close enough to be updated, suggest it and wait for user confirmation
3. **Add the new AG-UI tool** - Implement in frontend (see Implementation below). Reference `.claude/agents/ag-ui-specs.md` if needed
4. **Update screen designs** - If needed (when adding or changing visual elements)
5. **Determine impacts to agent-tools** - Check if any MCP tools need updates (rare). Don't suggest or add new agent tools if not needed
6. **Update agent tool** - Only if impacts identified
7. **Allow user to test** - User tests the changes
8. **Update docs** - Once user confirms tested, allow them to run tools to update docs

## Implementation

### 1. Determine Category

- Emulator control → `main-tools.js`
- BASIC operations → `basic-program-tools.js`
- Assembly operations → `assembler-tools.js`
- Disk drives → `disk-tools.js`
- Hard drives → `smartport-tools.js`
- File browsing → `file-explorer-tools.js`
- Window management → `window-tools.js`
- Slot management → `slot-tools.js`

### 2. Create Tool in Category File

```javascript
export const toolName = {
  name: "toolName",
  description: "What it does for LLM",
  parameters: {
    type: "object",
    properties: {
      paramName: { type: "string", description: "..." }
    },
    required: ["paramName"]
  },
  handler: async (params, context) => {
    const { wasm, emulator } = context;
    // Implementation
    return { success: true, data: result };
  }
};
```

### 3. Register in agent-tools.js

Import from category file and add to tools array.

## Common Patterns

### Window Operations
```javascript
const window = window.emulator?.windowManager.getWindow("window-id");
window.methodName();
```

### WASM Memory
```javascript
wasm._readMemory(addr)
wasm._writeMemory(addr, val)
```

### WASM Strings
```javascript
// JS to WASM
const ptr = wasm._malloc(str.length + 1);
wasm.stringToUTF8(str, ptr, str.length + 1);
wasm._functionTakesString(ptr);
wasm._free(ptr);

// WASM to JS
const str = wasm.UTF8ToString(ptr);
```

## Error Handling

Always return `{ success: false, error: message }` on failure.

## Progressive Loading

Read these only when needed:
- `src/js/agent/main-tools.js` - Simple tool examples
- `src/js/agent/file-explorer-tools.js` - String handling examples
- `.claude/agents/ag-ui-specs.md` - AG-UI protocol details
- `.claude/agents/new-app-tool.md` - Full detailed guide

## Testing

Users test manually. Do NOT auto-call new tools or run test sequences.
