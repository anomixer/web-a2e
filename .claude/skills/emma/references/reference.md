# reference - Load Reference Documentation

Loads important reference documents into context for adherence during code generation and file creation.

## Purpose

When generating code or files, load relevant reference docs to ensure consistency with:
- Coding styles and conventions
- WASM bindings and patterns
- System architecture
- Project structure

## Available References

### styles
**File**: `docs/styles.md`
**Contains**: Coding styles, project styles, naming conventions, file organization
**Use when**: Generating any code or creating new files

### bindings
**File**: `docs/bindings.md`
**Contains**: WASM function signatures, memory operations, string handling
**Use when**: Working with WASM interface, creating tools that call WASM functions

### architecture
**File**: `docs/architecture.md`
**Contains**: System architecture overview, component relationships, data flow
**Use when**: Understanding system structure, making architectural decisions

### app-tools
**File**: `docs/app-tools.md`
**Contains**: Registry of all AG-UI app tools, parameters, usage
**Use when**: Checking existing tools, avoiding duplicates

### agent-tools
**File**: `docs/agent-tools.md`
**Contains**: Registry of all MCP agent tools, schemas, usage
**Use when**: Working with MCP tools, checking what's available

### ag-ui
**File**: `docs/ag-ui-specs.md`
**Contains**: AG-UI protocol specification, 17 event types, frontend tools pattern
**Use when**: Working with AG-UI protocol, understanding event flow, implementing tools

### core-files
**Files**:
- `src/js/agent/agent-manager.js` - Frontend AG-UI client implementation
- `src/js/agent/agent-tools.js` - Tool registry and command handlers

**Contains**: Core agent integration source code, SSE connection management, tool execution
**Use when**: Understanding agent architecture, debugging agent issues, extending agent functionality

### setup
**File**: `docs/setup.md`
**Contains**: Development environment setup instructions for macOS (CMake, Node.js, Emscripten, ROM files, build commands)
**Use when**: Setting up development environment, troubleshooting build issues, helping user configure dev tools

### agent-setup
**File**: `docs/agent-setup.md`
**Contains**: MCP server configuration options in .mcp.json (Bunx auto-install, Bunx specific version, local development)
**Use when**: Configuring agent MCP server, switching between local/published agent, version troubleshooting

### connections
**File**: `docs/connections.md`
**Contains**: Connection architecture and behaviors (App→MCP, MCP↔MCP), version compatibility, reconnection logic, port conflicts, sparkle button states
**Use when**: Modifying connection logic, debugging connection issues, understanding reconnection behavior, changing version requirements

### project-structure
**File**: `docs/project-structure.md`
**Contains**: Directory structure of web-a2e and appleii-agent, file organization, two-repo layout, build outputs
**Use when**: Understanding file organization, navigating codebase, planning structural changes, onboarding new developers

### mcp-ag-ui-integration
**File**: `docs/mcp-ag-ui-integration.md`
**Contains**: MCP + AG-UI integration concepts, tool patterns, implementation examples, design principles
**Use when**: Understanding integration architecture, implementing new tools, learning how MCP and AG-UI work together

## Process

1. **Detect which reference** user wants to load (styles, bindings, architecture, etc.)

2. **Read the document** into context:
   - `docs/styles.md` for coding standards
   - `docs/bindings.md` for WASM interface
   - `docs/architecture.md` for system overview
   - `docs/app-tools.md` for app tool registry
   - `docs/agent-tools.md` for agent tool registry

3. **Keep in context** for remainder of session

4. **Apply when generating code**:
   - Follow naming conventions from styles
   - Use correct patterns from bindings
   - Respect architecture constraints
   - Avoid duplicating existing tools

## Examples

**User**: "reference styles"
**Action**: Read `docs/styles.md` into context, apply conventions to all code generation

**User**: "reference bindings"
**Action**: Read `docs/bindings.md` into context, use correct WASM function signatures

**User**: "reference architecture"
**Action**: Read `docs/architecture.md` into context, understand system structure

**User**: "reference ag-ui"
**Action**: Read `docs/ag-ui-specs.md` into context, understand AG-UI protocol and event types

**User**: "reference core files"
**Action**: Read `src/js/agent/agent-manager.js` and `src/js/agent/agent-tools.js` into context

**User**: "reference setup"
**Action**: Read `docs/setup.md` into context, use for helping with environment configuration

**User**: "reference agent-setup"
**Action**: Read `docs/agent-setup.md` into context, help configure MCP server in .mcp.json

**User**: "reference connections"
**Action**: Read `docs/connections.md` into context, understand connection architecture and behaviors

**User**: "reference project-structure"
**Action**: Read `docs/project-structure.md` into context, understand directory structure and two-repo layout

**User**: "reference mcp-ag-ui-integration"
**Action**: Read `docs/mcp-ag-ui-integration.md` into context, understand integration concepts and tool patterns

## Multiple References

User can request multiple references:
- "reference styles and bindings"
- "reference architecture and app-tools"

Load all requested documents.

## Auto-Reference

Consider auto-loading when:
- Creating new app tool → auto-load styles, bindings, ag-ui, mcp-ag-ui-integration
- Creating new agent tool → auto-load styles, ag-ui, mcp-ag-ui-integration
- Updating architecture → auto-load architecture, core-files, project-structure
- Working with WASM → auto-load bindings
- Debugging agent issues → auto-load core-files, ag-ui, agent-setup, connections
- Extending agent functionality → auto-load core-files, bindings, ag-ui, mcp-ag-ui-integration
- Setting up dev environment → auto-load setup, project-structure
- Build troubleshooting → auto-load setup
- Configuring MCP server → auto-load agent-setup, connections
- Agent connection issues → auto-load agent-setup, connections
- Switching local/published agent → auto-load agent-setup
- Modifying connection logic → auto-load connections, core-files
- Changing version requirements → auto-load connections, agent-setup
- Understanding reconnection behavior → auto-load connections
- Port conflict issues → auto-load connections, agent-setup
- Learning integration patterns → auto-load mcp-ag-ui-integration, project-structure
- Onboarding new developers → auto-load project-structure, mcp-ag-ui-integration

Ask user first before auto-loading unless explicitly requested.
