# impact - Validate Integration Contracts

Check if changes break the contract between AG-UI tools and the app/emulator.

## The Question

**"Does this change break what currently works?"**

Works both ways:
- App change → Check if AG-UI tools still work
- AG-UI tool change → Check if app still supports it

## Tool Behavior Catalog

Quick reference for what each tool does and what it assumes from the app:

### BASIC Program Tools
**What they do**: Read/write BASIC programs, run/step execution, read/set variables
**What they assume**:
- Zero page pointers at $67-$AF (TXTTAB, VARTAB, CURLIN, etc.)
- Program starts at $0801
- Tokenization format (linked list with 16-bit next-line pointers)
- `_readMemory()`, `_writeMemory()`, `_isPaused()`, `_setPaused()` work as expected

### File Explorer Tools
**What they do**: List files on disk, read file contents
**What they assume**:
- `_isDiskInserted(drive)`, `_getDiskSectorData(drive, sizePtr)` return valid data
- `_isDOS33Format()`, `_isProDOSFormat()` detect formats correctly
- Catalog functions (`_getDOS33Catalog()`, `_getProDOSCatalog()`) work
- File read functions return buffer pointers that stay valid

### Disk Tools
**What they do**: Insert/eject disks, manage recent disks
**What they assume**:
- MCP `load_disk_image` returns `{ success, data, filename, error }`
- `data` is base64-encoded disk image
- Drive numbering: 1-2 for user, 0-1 for internal calls
- `diskManager.insertDisk(drive, data, filename)` accepts Uint8Array

### SmartPort Tools
**What they do**: Insert/eject hard drive images
**What they assume**:
- `_isSmartPortCardInstalled()` returns true when card present
- MCP `load_smartport_image` returns `{ success, data, filename, error }`
- `hardDriveManager.loadImageFromData(device, filename, data)` works
- Device numbering: 1-2 for user, 0-1 for internal calls

### Assembler Tools
**What they do**: Assemble 6502 code, load into memory, execute
**What they assume**:
- `_assembleSource(source)` tokenizes and assembles
- `_getAsmOutputBuffer()`, `_getAsmOrigin()` return valid data
- `_loadAsmIntoMemory()` loads at origin address
- `_setRegPC(addr)` jumps to code

### Window Tools
**What they do**: Show/hide/focus windows
**What they assume**:
- `windowManager.getWindow(id)`, `showWindow(id)`, `hideWindow(id)` exist
- Window IDs: "basic-program", "cpu-debugger", "file-explorer-window", etc.

### Main Tools
**What they do**: Power on/off, reset, read/write memory directly
**What they assume**:
- `emulator.start()`, `emulator.stop()`, `emulator.running` work
- `_reset()`, `_warmReset()` perform resets
- `_readMemory(addr)`, `_writeMemory(addr, val)` access full 64KB

### Slot Tools
**What they do**: List/install/remove expansion cards
**What they assume**:
- `_getSlotCard(slot)`, `_setSlotCard(slot, cardId)` work
- Card IDs: "disk2", "mockingboard", "smartport", "thunderclock", etc.
- Slot numbers: 1-7

## Impact Analysis Method

### Step 1: Identify What Changed

**App-side changes**:
- WASM function signature or behavior
- Memory layout (zero page, RAM/ROM boundaries)
- State serialization format
- Window manager API
- Disk/hard drive manager API

**AG-UI tool changes**:
- New WASM function calls
- New memory addresses accessed
- New MCP tool dependencies
- Changed return format expectations

### Step 2: Map to Affected Tools

Use the catalog above:
- Changed zero page layout? → Affects BASIC tools
- Changed disk insertion flow? → Affects disk tools
- Changed MCP contract? → Affects disk/smartport tools
- Changed window manager? → Affects window tools

### Step 3: Check Both Directions

**If app changed**:
- Does tool still get what it expects?
- Do function calls still work?
- Is data format still compatible?

**If tool changed**:
- Does app provide what tool now needs?
- Are new function calls available?
- Does app handle new behavior?

### Step 4: Test the Integration

Pick 1-2 key workflows for each affected tool category:
- BASIC: Load program → Run → Pause → Read variable
- Disk: Insert disk via MCP → List catalog → Extract file
- SmartPort: Check card → Load image → Verify insertion
- Assembler: Assemble → Load → Execute
- Window: Show window → Verify visible

## Quick Impact Report

```
Change: [What changed]

Affected Tools: [Which tool categories]

Contract Impact:
- Tool expects X, app now provides Y
- OR: Tool now calls X(), app doesn't have it

Test: [One simple workflow to verify]

Fix: [Update tool OR update app]
```

## Common Patterns

**Zero page pointer moved**:
- Affects: BASIC tools
- Test: Load BASIC program, verify it works
- Fix: Update address constants in BASIC tools

**MCP return format changed**:
- Affects: Disk/SmartPort tools
- Test: Insert disk via agent
- Fix: Update tools to parse new format OR update MCP to return old format

**WASM function renamed**:
- Affects: All tools calling it
- Test: Run affected tool operation
- Fix: Update all call sites

**New window ID**:
- Affects: Window tools
- Test: Show window via agent
- Fix: Add new ID to window tools

## Goal

Fast answer to: **"What integration will break and how do I test it?"**

Not exhaustive analysis - just enough to identify broken contracts and verify fixes.
