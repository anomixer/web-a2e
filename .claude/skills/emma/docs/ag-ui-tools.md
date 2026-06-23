# AG-UI Tools Reference

**Location**: `src/js/agent/*-tools.js`
**Total**: 91 frontend tools
**Purpose**: Agent-callable functions that execute in the browser and control the emulator

---

## Recent Additions

### Screen Capture Tools (v1.0.15)
Added in commit `6b242d1` by Mike Daley:

**captureScreenshot** - Capture visual snapshot
```javascript
// No parameters
{
  success: true,
  imageBase64: "iVBORw0KG...",  // PNG data
  width: 560,
  height: 384,
  message: "Screen captured as 560x384 PNG"
}
```

**captureScreenText** - Extract text from screen
```javascript
// Parameters: startRow, startCol, endRow, endCol (all optional)
{
  success: true,
  text: "CATALOG\n...",
  startRow: 0,
  startCol: 0,
  endRow: 23,
  endCol: 79,
  message: "Screen text captured from (0,0) to (23,79)"
}
```

Use cases:
- Screenshot: Visual debugging, documentation, test verification
- Text capture: Read program output, catalog listings, error messages

---

## Main Tools (8 tools)

**Location**: `src/js/agent/main-tools.js`
**Purpose**: Core emulator control, direct memory access, and keyboard input

### Power Control
- **emulatorPower** - Power on/off/toggle
- **emulatorCtrlReset** - Warm reset (Ctrl+Reset)
- **emulatorReboot** - Cold reset (power cycle)

### Memory Access
- **directLoadBinaryAt** - Load binary data into memory at address
- **directSaveBinaryRangeTo** - Read memory range as base64

### Screen Capture
- **captureScreenshot** - Capture screen as 560x384 PNG (base64)
- **captureScreenText** - Read text from screen region

### Keyboard Input
- **typeKeyboard** - Type text as if at the keyboard; `{token}` syntax for special keys (arrows, `{esc}` `{enter}` `{tab}` `{del}` `{backspace}` `{space}`, ctrl combos `{ctrl-c}`/`{^c}`, raw codes `{chr:N}` = CHR$(N), `{{` literal). Newlines act as Return. Token parsing is on for this tool only — clipboard paste still treats braces literally.

**WASM dependencies**:
- `_isPaused()`, `_setPaused()`
- `_reset()`, `_warmReset()`
- `_readMemory()`, `_writeMemory()`
- `_readScreenText()` - Screen text capture
- `_charToAppleKey()` - Char → Apple key code (typeKeyboard, via input handler paste queue)

---

## BASIC Program Tools (23 tools)

**Location**: `src/js/agent/basic-program-tools.js`
**Purpose**: BASIC program editing, execution, debugging, variable inspection

### Direct Memory Operations (no UI)
- **directReadBasic** - Read BASIC program from memory
- **directWriteBasic** - Write BASIC program to memory
- **directRunBasic** - Execute BASIC program
- **directNewBasic** - Clear BASIC program buffer

### Editor Integration
- **basicProgramLoadFromMemory** - Load from memory into editor
- **basicProgramLoadIntoEmulator** - Load from editor into memory
- **basicProgramGet** - Get editor content
- **basicProgramSet** - Set editor content
- **basicProgramNew** - Clear editor
- **basicProgramLineCount** - Get line/char count

### Execution Control
- **basicProgramRun** - Run program
- **basicProgramPause** - Pause execution
- **basicProgramStepNext** - Step to next line

### Program Manipulation
- **basicProgramRenumber** - Renumber lines
- **basicProgramFormat** - Auto-format code

### Breakpoints
- **basicProgramListBreakpoints** - List all breakpoints
- **basicProgramSetBreakpoint** - Set line/statement breakpoint
- **basicProgramUnsetBreakpoint** - Remove breakpoint
- **basicProgramGetCurrentLine** - Get current line number

### Variable Inspection
- **basicProgramGetVariables** - Get all variables and arrays
- **basicProgramSetVariable** - Set variable value

### File Operations
- **saveBasicInEditorToLocal** - Export from editor (for MCP `save_basic_file`)
- **directSaveBasicInMemoryToLocal** - Export from memory

**WASM dependencies**:
- Zero page pointers: $67 (TXTTAB), $69 (VARTAB), $75 (CURLIN), etc.
- `_readMemory()`, `_writeMemory()` for program manipulation
- `_isPaused()`, `_setPaused()` for execution control
- Breakpoint functions, stepping functions

**Assumptions**:
- Program starts at $0801
- Tokenization format: linked list with 16-bit next-line pointers
- Direct mode flag: $76 = $FF

---

## Assembler Tools (9 tools)

**Location**: `src/js/agent/assembler-tools.js`
**Purpose**: 6502 assembly compilation and execution

### Assembly Operations
- **asmAssemble** - Compile 6502 source code
- **asmWrite** - Load assembled code into memory
- **asmGetStatus** - Get compilation status (origin, size, errors)
- **directExecuteAssemblyAt** - Execute at address

### Editor Operations
- **asmLoadExample** - Load template program
- **asmNew** - Clear editor
- **asmGet** - Get editor content
- **asmSet** - Set editor content
- **saveAsmInEditorToLocal** - Export source (for MCP `save_asm_file`)

**WASM dependencies**:
- `_assembleSource()` - Tokenize and assemble
- `_getAsmOutputBuffer()`, `_getAsmOrigin()` - Get results
- `_loadAsmIntoMemory()` - Load at origin
- `_setRegPC()` - Jump to code

---

## Disk Tools (8 tools)

**Location**: `src/js/agent/disk-tools.js`
**Purpose**: Disk drive operations and recent disk management

### Disk Operations
- **driveInsertDisc** - Insert disk image from filesystem path
- **driveInsertBlank** - Insert a fresh blank, write-enabled WOZ (unformatted) into a drive
- **diskDriveEject** - Eject disk from drive
- **getDiskImageData** - Read a drive's current image bytes (modifications included) → base64; pairs with MCP `save_to` `from:"disk"`

### Recent Disks
- **driveRecentsList** - Get list of recent disks
- **driveInsertRecent** - Insert by name
- **driveLoadRecent** - Load by filename
- **drivesClearRecent** - Clear all recent disks

**MCP dependencies**:
- `load_disk_image` - Returns `{ success, data, filename, error }`
- `data` is base64-encoded disk image

**WASM dependencies**:
- `_insertBlankDisk(driveIdx)` - create+insert blank WOZ (driveInsertBlank)
- `_getDiskData(driveIdx, sizePtr)` - serialize current image to a C++-owned buffer (getDiskImageData)

**Numbering**: Drive 1-2 (user), 0-1 (internal)

**Formats**: .dsk, .do, .po, .nib, .woz

---

## SmartPort Tools (5 tools)

**Location**: `src/js/agent/smartport-tools.js`
**Purpose**: Hard drive image operations

### Image Operations
- **smartportInsertImage** - Insert hard drive image from path
- **smartportEject** - Eject image from device

### Recent Images
- **smartportRecentsList** - Get list of recent images
- **smartportInsertRecent** - Insert by name
- **smartportClearRecent** - Clear all recent images

**MCP dependencies**:
- `load_smartport_image` - Returns `{ success, data, filename, error }`

**Requirements**:
- SmartPort card must be installed (`_isSmartPortCardInstalled()`)

**Numbering**: Device 1-2 (user), 0-1 (internal)

**Formats**: .hdv, .po, .2mg

---

## File Explorer Tools (2 tools)

**Location**: `src/js/agent/file-explorer-tools.js`
**Purpose**: Disk catalog browsing and file extraction

### Operations
- **listDiskFiles** - List files on DOS 3.3 or ProDOS disk
- **getDiskFileContent** - Read file content (binary or text)

**WASM dependencies**:
- `_isDiskInserted()`, `_getDiskSectorData()`
- `_isDOS33Format()`, `_isProDOSFormat()`
- `_getDOS33Catalog()`, `_getProDOSCatalog()`
- File read functions, buffer pointers

**Returns**:
- File metadata: filename, type, size, locked status
- Content: base64 (binary) or plain text

---

## Slot Tools (4 tools)

**Location**: `src/js/agent/slot-tools.js`
**Purpose**: Expansion card management

### Operations
- **slotsListAll** - List all slots with current cards and available options
- **slotsInstallCard** - Install card in slot
- **slotsRemoveCard** - Remove card from slot
- **slotsMoveCard** - Move card to different slot

**WASM dependencies**:
- `_getSlotCard()`, `_setSlotCard()`

**Card IDs**: disk2, mockingboard, smartport, thunderclock, mouse, etc.

**Slot numbers**: 1-7

---

## Printer Tools (23 tools)

**Location**: `src/js/agent/printer-tools.js`
**Purpose**: Drive the virtual dot-matrix printer (ImageWriter I/II, Apple DMP, Epson FX-80) — window, paper, feed, power, model/ribbon/form, raw output, screen dump, and print history

### Window / Paper
- **printerOpen** - Show + focus the Printer window
- **printerClose** - Hide the window (output still captures in the background)
- **printerClear** - Clear the paper (resets glyph state + canvas/text buffer)
- **printerCapturePaper** - Capture the printed paper as a PNG (`imageBase64`, no `data:` prefix)
- **printerSetPaperDimensions** - Set paper width/length in ¼" increments (model clamps to its bounds); `{ widthInch?, lengthInch? }`

### Feed / Motion
- **printerFeed** - Panel feed `{ kind: "up" | "down" | "ff" }` (default `ff`)
- **printerLineFeed** - Advance/reverse N lines `{ direction: "up"|"down", count }`
- **printerFormFeed** - Advance the paper to the next top-of-form

### Power / State
- **printerSetPower** - Mains power `{ on: boolean }` (off ignores bytes, preserves paper)
- **printerSetOnline** - Online/offline `{ online: boolean }`
- **printerSetAutoLineFeed** - Auto Line Feed DIP SW2-1 `{ on: boolean }` (CR-feeds vs overprint register)
- **printerGetState** - Current model, online, ribbon, paper height
- **printerSetup** - Combined config in one call (`power`/`online`/`model`/`ribbon`/`pageSize`, all optional) + returns state & valid options

### Model / Ribbon / Form
- **printerSetModel** - `{ model: "imagewriter-ii" | "imagewriter-i" | "epson-fx80" }`
- **printerSetRibbon** - `{ ribbon: "bw" | "color" }` (affects future ink only)
- **printerSetPageSize** - Form length `{ size: "form11" | "form12" | "legal" | "a4" }`

### Output / Rendering
- **printerSendBytes** - Inject raw bytes/text straight into the active printer, bypassing PR#/CSW; `{ bytes?: number[], text?: string }` (bytes wins)
- **printerDumpScreen** - //e screen → ImageWriter bit-image "screen dump" `{ threshold?, invert? }` (auto-polarity when omitted; ImageWriter model required)
- **printerStrike** - Tune the per-dot ink strike live `{ round?, diaPx? }` (persists to localStorage; re-print to see)
- **printerSuper** - Paper-canvas supersample factor `{ ss: 1–4 }` (rebuilds canvas; re-print after)

### Print History
- **printerListHistory** - List stored print jobs (metadata only, grouped by job)
- **printerGetPage** - One stored page as base64 PNG `{ jobId, pageIndex }`
- **printerReloadJob** - Re-preview a stored job onto the paper `{ jobId }`

**Dependencies**:
- `window.emulator.printerWindow`, `.printerManager`, `.windowManager`
- `printer-manager.js` (`PRINTER_MODELS`, `RIBBONS`), `printer-window.js` (strike/supersample), `printer-page-store.js` (IndexedDB history)

**Window ID**: `printer-output`

**Notes**:
- Screen-dump polarity: `invert:false` = WYSIWYG, `invert:true` = classic white-is-black; omit for auto by lit density
- `printerSendBytes` is the glyph/control-code verification path (host CPU/SSC bypassed)

---

## Window Tools (3 tools)

**Location**: `src/js/agent/window-tools.js`
**Purpose**: Window visibility management

### Operations
- **showWindow** - Show or focus window
- **hideWindow** - Hide window
- **focusWindow** - Bring window to front

**Window IDs**: basic-program, cpu-debugger, file-explorer-window, memory-browser, etc.

---

## Agent Meta Tools (4 tools)

**Location**: `src/js/agent/agent-tools.js`
**Purpose**: Generic tool wrappers and state management

### Operations
- **emma_command** - Generic command wrapper (delegates to actual tool)
- **executeCommand** - Execute command in emulator
- **getState** - Get emulator state (PC, registers, cycles)
- **setState** - Set CPU registers

---

## Agent Version Tools (2 tools)

**Location**: `src/js/agent/agent-version-tools.js`
**Purpose**: Version compatibility checking

### Operations
- **checkAgentCompatibility** - Check if agent version compatible
- **getAgentVersion** - Get agent version info

---

## Tool Naming Conventions

**Prefixes**:
- `direct*` - Direct memory operations (no UI interaction)
- `basicProgram*` - BASIC program window operations
- `asm*` - Assembler operations
- `drive*` - Disk drive operations
- `smartport*` - SmartPort hard drive operations
- `slots*` - Expansion slot operations
- `printer*` - Virtual dot-matrix printer operations
- `emulator*` - Core emulator control
- `typeKeyboard` - Keyboard input (type text + special keys)

**Return format**:
All tools return objects with:
- `success: boolean` - Operation result
- `message: string` - Human-readable description
- Additional fields specific to operation

**Error handling**:
Tools throw `Error` objects with descriptive messages when operations fail.

---

## Integration Contracts

### WASM Interface
- All WASM functions prefixed with `_` (e.g., `_readMemory`)
- Memory allocation via `_malloc()`, `_free()`
- String conversion: `stringToUTF8()`, `UTF8ToString()`
- Pointer lifetimes: Buffers valid until `_free()` or next call

### MCP Tools
- Return format: `{ success, data, error }`
- Base64 encoding for binary data
- Error messages in `error` field when `success: false`

### Window Manager
- Window IDs are kebab-case strings
- Operations: `getWindow(id)`, `showWindow(id)`, `hideWindow(id)`

### Disk/Hard Drive Managers
- Drive/device numbering: 1-2 (user-facing), 0-1 (internal)
- Format detection automatic
- Recent lists stored in IndexedDB

---

## Testing Tools

For each tool category, test key workflows:

**BASIC**: Load program → Run → Pause → Step → Read variables
**Disk**: Insert disk via MCP → List catalog → Extract file
**SmartPort**: Check card → Load image → Verify insertion
**Assembler**: Assemble → Load → Execute
**Screen**: Capture screenshot → Verify PNG / Capture text → Verify content
**Window**: Show window → Verify visible

See `references/impact.md` for detailed testing checklists.
