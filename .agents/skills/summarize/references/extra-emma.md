# Extra Reference Files for Apple //e Emulator

When summarizing sessions for this project, load the following reference files to maintain context about the codebase architecture and conventions:

## Core Reference Files

When asked to RESTORE CORE FILES load these files
 - only these files, not others that might be tracked in the summary as part of this request

1. **AG-UI Protocol Specification**
   - Path: `/.claude/agents/ag-ui-specs.md`
   - Content: Complete AG-UI protocol documentation with 17 event types, frontend tools pattern, communication patterns

2. **Adding New App Tools Guide**
   - Path: `/.claude/agents/new-app-tool.md`
   - Content: Step-by-step guide for adding new tools to the agent integration, token-efficient documentation system

3. **WASM Bindings Map**
   - Path: `/.claude/agents/maps/bindings.md`
   - Content: Complete map of 200+ WASM functions exported from C++ to JavaScript

4. **JavaScript File Structure Map**
   - Path: `/.claude/agents/maps/index.md`
   - Content: Overview of all JavaScript files organized by directory (audio, debug, disk-manager, display, etc.)

5. **Coding Style Guide**
   - Path: `/.claude/agents/styles.md`
   - Content: JavaScript and HTML conventions (indentation, naming, patterns, best practices)

## Purpose

These files provide essential context for:
- Understanding the MCP agent integration architecture
- Adding new features following established patterns
- Maintaining consistency with codebase conventions
- Understanding the WASM/JavaScript interface
- Navigating the file structure

## Usage

Load these files when:
- Starting a new session after summarization
- Working on agent integration features
- Adding new tools or capabilities
- Reviewing or modifying existing code
- Need to reference architecture decisions
