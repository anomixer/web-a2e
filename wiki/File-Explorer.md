# File Explorer

The File Explorer provides a built-in disk image browser that can read and display files stored on DOS 3.3 and ProDOS formatted disk images. It supports viewing Applesoft BASIC, Integer BASIC, text files, binary files (with disassembly), hex dumps, and Merlin assembler source code.

## Table of Contents

- [Opening the File Explorer](#opening-the-file-explorer)
- [Interface Layout](#interface-layout)
- [Supported Disk Formats](#supported-disk-formats)
- [Browsing Files](#browsing-files)
- [File Types](#file-types)
- [View Modes](#view-modes)
- [BASIC Program Viewer](#basic-program-viewer)
- [Disassembler](#disassembler)
- [Hex Dump](#hex-dump)
- [Merlin Assembler Source](#merlin-assembler-source)
- [Text Files](#text-files)

## Opening the File Explorer

Open the File Explorer from the **Tools** menu. When the window opens, it automatically reads the disk currently inserted in the selected drive.

## Interface Layout

The File Explorer window is divided into three areas:

### Toolbar

The toolbar at the top contains:

- **Drive selector** -- Toggle between Drive 1 and Drive 2 to browse disks in either drive
- **Refresh button** -- Re-reads the current disk catalog (useful after the emulator modifies the disk)
- **Disk info** -- Displays the disk filename and detected format (e.g. `MyDisk.dsk (DOS 3.3)` or `Utils.po (ProDOS: UTILITIES)`)

### Catalog Panel (Left)

The left panel shows the file listing for the current disk. Each entry displays:

- **File type** -- A short type code (`A` for Applesoft, `B` for Binary, `T` for Text, etc.)
- **Filename** -- The file's name as stored on disk
- **Size** -- Sector count (DOS 3.3) or block count (ProDOS)
- **Lock indicator** -- An asterisk (`*`) appears before the type code if the file is locked

For ProDOS disks, directories are shown with a `DIR` type indicator and a trailing `/` on the name. Clicking a directory navigates into it.

### File Viewer Panel (Right)

The right panel displays the contents of the currently selected file. The header shows the filename, file type description, and file size. View mode toggle buttons appear when applicable (e.g. Disassemble / HEX / MERLIN for binary files).

## Supported Disk Formats

The File Explorer supports two Apple II disk operating systems:

### DOS 3.3

Standard Apple II disk format with 35 tracks, 16 sectors per track (143,360 bytes). The explorer reads the Volume Table of Contents (VTOC) at track 17, sector 0 and follows the catalog sector chain to list all files.

**Recognized DOS 3.3 file types:**

| Type Code | Hex | Description |
|-----------|-----|-------------|
| T | $00 | Text file |
| I | $01 | Integer BASIC program |
| A | $02 | Applesoft BASIC program |
| B | $04 | Binary file |
| S | $08 | Type S |
| R | $10 | Relocatable object |
| a | $20 | Type a |
| b | $40 | Type b |

### ProDOS

Apple's more advanced disk operating system with hierarchical directory support. The explorer reads the volume directory starting at block 2 and recursively scans all subdirectories.

**Recognized ProDOS file types:**

| Type Code | Hex  | Description |
|-----------|------|-------------|
| TXT | $04 | Text file |
| BIN | $06 | Binary file |
| DIR | $0F | Directory |
| ADB | $19 | AppleWorks Database |
| AWP | $1A | AppleWorks Word Processor |
| ASP | $1B | AppleWorks Spreadsheet |
| SRC | $B0 | Source Code |
| S16 | $B3 | GS/OS Application |
| DOC | $BF | Document |
| PNT | $C0 | Packed HiRes |
| PIC | $C1 | HiRes Picture |
| SHK | $E0 | ShrinkIt Archive |
| PAS | $EF | Pascal |
| CMD | $F0 | Command |
| INT | $FA | Integer BASIC program |
| IVR | $FB | Integer BASIC Variables |
| BAS | $FC | Applesoft BASIC program |
| VAR | $FD | Applesoft Variables |
| REL | $FE | Relocatable object |
| SYS | $FF | System file |

### ProDOS Directory Navigation

When browsing a ProDOS disk, the File Explorer provides full directory navigation:

- **Breadcrumb path bar** -- Appears when inside a subdirectory, showing the full path with clickable segments (e.g. `/UTILITIES/SYSTEM`). Click any path component to jump directly to that directory.
- **Parent directory entry** (`..`) -- Shown at the top of the file list when inside a subdirectory. Click to go up one level.
- **Directories** -- Displayed with a `DIR` type label and a trailing slash. Click to enter the directory.

Files are sorted with directories listed first, then files, both in alphabetical order.

## File Types

The File Explorer automatically selects the appropriate viewer based on the file type:

| File Type | Viewer |
|-----------|--------|
| Applesoft BASIC | Syntax-highlighted BASIC listing with navigable line references |
| Integer BASIC | Syntax-highlighted BASIC listing with navigable line references |
| Text | Plain text display (with optional Merlin detection) |
| Binary | Disassembly view with hex and Merlin alternatives |
| System (ProDOS SYS) | Disassembly view with hex and Merlin alternatives |
| All other types | Hex dump |

## View Modes

### Binary File View Modes

When viewing a binary file (DOS 3.3 type `B`, ProDOS types `BIN` or `SYS`), three view mode buttons appear:

- **Disassemble** -- 65C02 disassembly with flow analysis (default)
- **HEX** -- Color-coded hex dump with ASCII sidebar
- **MERLIN** -- Merlin assembler source view (auto-selected when Merlin source is detected)

### Text File View Modes

When viewing a text file, two view mode buttons appear:

- **TEXT** -- Plain text display (default)
- **MERLIN** -- Merlin assembler source view (auto-selected when Merlin source is detected)

## BASIC Program Viewer

BASIC programs (Applesoft and Integer BASIC) are detokenized using the emulator's C++ BASIC detokenizer (via WASM) and then rendered with syntax highlighting.

### Syntax Highlighting

BASIC listings use color-coded highlighting for different language elements:

- Line numbers
- Keywords (PRINT, FOR, NEXT, IF, THEN, etc.)
- Strings
- Numbers
- Operators
- Comments (REM statements)

### Line Navigation

GOTO, GOSUB, and THEN targets are rendered as clickable references. Clicking a line number reference in a GOTO or GOSUB statement scrolls to and highlights the target line in the listing. The target line is centered in the view and highlighted for easy identification.

## Disassembler

The disassembler provides a 65C02 disassembly view for binary and system files. It uses the emulator's C++ disassembler core with recursive-descent flow analysis to distinguish code from data.

### Features

- **Flow analysis** -- Uses recursive descent from the entry point to trace execution paths through branches and jumps, distinguishing actual code from embedded data
- **ORG directive** -- Shows the load address at the top of the listing
- **Data gaps** -- Bytes not reached by flow analysis are displayed as `.BYTE` data directives (up to 8 bytes per line)
- **Color-coded instruction categories:**
  - Jump/Branch (JMP, JSR, BNE, etc.)
  - Load/Store (LDA, STA, LDX, etc.)
  - Math/Logic (ADC, AND, ORA, etc.)
  - Stack/Register (PHA, TAX, etc.)
  - Addresses and immediates
  - Data bytes

A color legend is displayed above the listing.

### Clickable Branch Targets

Branch and jump target addresses are clickable. Clicking a target scrolls to and highlights the destination instruction. This works for both relative branches (BNE, BEQ, etc.) and absolute jumps (JMP, JSR).

### Virtual Scrolling

For large binary files (500+ disassembled lines), the disassembler uses virtual scrolling to maintain smooth performance. Only the visible portion of the listing is rendered at any time, with a small buffer above and below the viewport.

### Address Format

Each line shows the address, raw bytes, mnemonic, and operand:

```
ORG   $0800
0800: A9 00     LDA #$00
0802: 8D 00 20  STA $2000
0805: 4C 00 08  JMP $0800
```

DOS 3.3 binary files include a 4-byte header (2 bytes load address, 2 bytes length) that is automatically parsed to determine the base address. ProDOS binary files store the load address in the file entry's auxiliary type field.

## Hex Dump

The hex dump view displays raw file data with color coding and an ASCII sidebar.

### Color Coding

Bytes are color-coded by category with a legend displayed above the view:

- **Printable** -- Standard ASCII characters ($20-$7E)
- **Control** -- Control characters ($01-$1F)
- **High Bit** -- Bytes with the high bit set ($80-$FF)
- **Zero** -- Null bytes ($00)

### Layout

Each line shows:

```
ADDR: XX XX XX XX XX XX XX XX  XX XX XX XX XX XX XX XX  |ASCII display...|
```

- **Address** -- 4-digit hex address
- **Hex bytes** -- Bytes displayed in groups of 8, separated by a gap
- **ASCII sidebar** -- Printable characters shown as-is (with high bit stripped), non-printable shown as dots

### Dynamic Column Count

The hex dump automatically adjusts the number of bytes displayed per row based on the window width. Resizing the File Explorer window dynamically recalculates the optimal column count to fill the available space.

## Merlin Assembler Source

The File Explorer can detect and display Merlin assembler source files with full syntax highlighting. Merlin was the most popular macro assembler for the Apple II.

### Auto-Detection

When a binary or text file is selected, the explorer automatically checks whether the content looks like Merlin assembler source. If detected, the view mode automatically switches to the MERLIN view. You can manually switch between views using the toggle buttons.

### Syntax Highlighting

Merlin source files are displayed with syntax highlighting that matches the disassembler's color scheme:

- **Jump/Branch mnemonics** -- JMP, JSR, BNE, BCC, RTS, etc.
- **Load/Store mnemonics** -- LDA, STA, LDX, STY, etc.
- **Math/Logic mnemonics** -- ADC, AND, ORA, ASL, CMP, etc.
- **Stack/Register mnemonics** -- PHA, PLA, TAX, TXA, etc.
- **Flag mnemonics** -- CLC, SEC, SEI, NOP, etc.
- **Directives** -- ORG, EQU, DS, DFB, ASC, HEX, PUT, MAC, and many more
- **Labels** -- Symbols defined at the start of lines
- **Comments** -- Text following semicolons or asterisks
- **Addresses and values** -- Hex values and numeric constants

## Text Files

Text files are displayed with Apple II character encoding properly handled:

- High-bit stripping (Apple II text uses $80-$FF for normal characters)
- Carriage return ($0D) conversion to newlines
- Tab ($09) preservation
- Null byte ($00) filtering

See also: [[Disk-Drives]], [[Getting-Started]]
