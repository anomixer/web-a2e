# MCP + AG-UI Integration Guide

**Referenced by**: `project-structure.md`

## Overview

This document describes the conceptual integration between MCP (Model Context Protocol) and AG-UI (Agent-User Interaction Protocol) in the Apple //e emulator project.

For actual project structure and file layout, see `project-structure.md`.
For connection behaviors and architecture, see `connections.md`.
For AG-UI protocol specification, see `ag-ui-specs.md`.

---

## Integration Architecture

Building an AG-UI interface to allow Claude to interact with an Apple //e emulator (C++/WASM with JavaScript bindings). This is a **hobby project** - we're keeping it nimble, clean, and focused. No enterprise features, no scaling, no multi-user, no authentication, no databases.

**Goal:** Create a simple framework to map AG-UI commands to existing emulator JavaScript bindings.

---

## MCP Server Dual Mode

The MCP server runs in **dual mode**:
1. **MCP Protocol (stdio)** - Claude Code connects here
2. **HTTP/SSE Server (port 3033)** - Web app connects here via AG-UI spec

Both channels share the same tool execution bridge.

### Technology Stack

- **Runtime:** Node.js (supports TypeScript)
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **HTTP Server:** Express
- **SSE:** Server-Sent Events for AG-UI protocol

---

## AG-UI Type Definitions

The protocol uses these core types:

```typescript
interface ToolCallStart {
  type: 'TOOL_CALL_START';
  tool_call_id: string;
  tool_call_name: string;
}

interface ToolCallArgs {
  type: 'TOOL_CALL_ARGS';
  tool_call_id: string;
  delta: string;
}

interface ToolCallEnd {
  type: 'TOOL_CALL_END';
  tool_call_id: string;
}

interface ToolCallResult {
  type: 'TOOL_CALL_RESULT';
  tool_call_id: string;
  content: string | object;
}
```

See `ag-ui-specs.md` for complete protocol specification.

---

## High-Level Flow

```
Claude Code (MCP Client)
        │
        ├── Calls MCP tools via stdio
        │
    appleii-agent (MCP Server)
        │
        ├── Sends tool calls via SSE (AG-UI)
        │
    web-a2e Browser App (AG-UI Client)
        │
        ├── Executes tools via JavaScript bindings
        │
        └──> Calls WASM emulator functions
                    │
              WASM Emulator Core
```

---

## Key Principle: Thin Wrapper Over Existing Bindings

**DO NOT touch C++/WASM.** The AG-UI layer simply calls existing JavaScript bindings.

The emulator already has bindings like:
```typescript
emulator.getScreenText()
emulator.typeText(text)
emulator.readMemory(address, length)
emulator.writeMemory(address, data)
emulator.getCursorPos()
emulator.getDiskCatalog(drive)
emulator.getRegisterA()
// etc.
```

AG-UI just maps tool calls to these existing functions.

See `bindings.md` for complete list of available WASM bindings.

---

## Essential Tool Categories

### 1. Screen & Display
- `read_screen` - Capture text from Apple //e screen
- `screenshot` - Get base64 PNG of display

### 2. BASIC Programming
- `list_basic` - Get current BASIC program
- `load_basic` - Load BASIC program into memory
- `run_basic` - Execute BASIC program
- `edit_basic_line` - Modify single line

### 3. Assembly/6502
- `assemble` - Assemble 6502 code
- `disassemble` - Disassemble memory range

### 4. Disk Operations
- `catalog` - List files on disk
- `read_file` - Read file from disk
- `write_file` - Write file to disk
- `bload` - Binary load to memory

### 5. Memory & Debugging
- `peek` - Read memory bytes
- `poke` - Write bytes to memory
- `get_registers` - Read CPU state
- `set_breakpoint` - Add breakpoint
- `step` - Execute single instruction

### 6. Emulator Control
- `type_keys` - Send keystrokes
- `press_key` - Send special key
- `reset` - Reset emulator

---

## Implementation Pattern

### Client-Side Tool Executor

The browser executes all tools by calling existing emulator bindings:

```typescript
class EmulatorTools {
  constructor(private emulator: any) {}

  async execute(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'read_screen':
        return {
          text: this.emulator.getScreenText(),
          cursor: this.emulator.getCursorPos(),
          mode: this.emulator.getVideoMode()
        };

      case 'peek':
        const addr = parseInt(args.address, 16);
        const bytes = this.emulator.readMemory(addr, args.length || 16);
        return this.formatHexDump(bytes, addr);

      case 'poke':
        const address = parseInt(args.address, 16);
        this.emulator.writeMemory(address, args.values);
        return { success: true };

      // ... etc
    }
  }
}
```

### Server-Side Tool Registry

MCP server just defines what tools are available. **It doesn't execute them** - the browser does.

```typescript
export const EMULATOR_TOOLS = [
  {
    name: 'read_screen',
    description: 'Capture Apple //e screen text (40x24 grid)',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'peek',
    description: 'Read memory from Apple //e',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Hex address' },
        length: { type: 'number', default: 16 }
      },
      required: ['address']
    }
  },
  // ... etc
];
```

---

## Usage Example

**User (via Claude):** "Show me what's in memory at $0300"

1. Claude calls MCP tool: `peek("0300", 32)`
2. appleii-agent broadcasts AG-UI TOOL_CALL_START event via SSE
3. Browser (web-a2e) receives tool call
4. Browser executes: `wasmModule._readMemory(0x0300, 32)`
5. Browser formats as hex dump
6. Browser sends TOOL_CALL_RESULT back via HTTP POST
7. appleii-agent returns result to Claude via MCP
8. Claude shows formatted memory dump to user

---

## What to SKIP (Keep It Nimble!)

### ❌ Don't Build These

- **No Database** - State lives in emulator WASM memory
- **No Authentication** - It's a local hobby project
- **No User Management** - Single user
- **No Rate Limiting** - Not needed for local use
- **No Session Persistence** - Reload = fresh start
- **No Complex Queue Systems** - Simple command/response
- **No Separate API Layer** - Direct binding calls
- **No Redis/Message Brokers** - Overkill
- **No Load Balancing** - Single instance
- **No Metrics/Analytics** - Keep it simple
- **No Complex State Management** - Emulator has the state

### ✅ Do Build These

- **Simple SSE bridge** - Connect browser to MCP via AG-UI
- **Tool definitions** - Map commands to bindings
- **Error handling** - Basic try/catch
- **Response formatting** - Hex dumps, ASCII, etc.
- **Version compatibility** - Check agent version

---

## Key Takeaways

1. **MCP Server runs dual-mode**: stdio for Claude Code, SSE for browser
2. **Browser executes everything**: Calls existing emulator bindings
3. **Server just defines tools**: Doesn't execute them
4. **Keep it simple**: No enterprise features, just a clean binding mapper
5. **Thin wrapper pattern**: AG-UI layer calls existing WASM APIs
6. **Direct integration**: TypeScript + Node.js, no complex build

This architecture gives Claude full programmatic control over the emulator through simple, well-defined tools that map directly to existing JavaScript/WASM bindings.

---

## Related Documents

- `project-structure.md` - Actual directory layout and file organization
- `connections.md` - Connection behaviors and architecture
- `ag-ui-specs.md` - AG-UI protocol specification
- `bindings.md` - Complete WASM binding reference
