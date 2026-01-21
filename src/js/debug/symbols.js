/**
 * Apple IIe Symbol Table
 * Maps known addresses to symbolic names for disassembly display
 */

// Zero Page locations
export const ZERO_PAGE_SYMBOLS = {
  0x00: "LOMEM",      // Start of BASIC program
  0x01: "LOMEM+1",
  0x20: "WNDLFT",     // Text window left edge
  0x21: "WNDWDTH",    // Text window width
  0x22: "WNDTOP",     // Text window top
  0x23: "WNDBTM",     // Text window bottom
  0x24: "CH",         // Cursor horizontal position
  0x25: "CV",         // Cursor vertical position
  0x26: "GPTS",       // General use
  0x27: "GBPTS",      // General use
  0x28: "BASL",       // Text base address low
  0x29: "BASH",       // Text base address high
  0x2A: "BAS2L",      // Secondary base low
  0x2B: "BAS2H",      // Secondary base high
  0x2C: "H2",         // Horizontal 2
  0x2D: "V2",         // Vertical 2
  0x2E: "MASK",       // General use
  0x30: "COLOR",      // Lo-res color
  0x32: "INVFLG",     // Inverse flag ($FF=normal, $3F=inverse)
  0x33: "PROMPT",     // Prompt character
  0x36: "CSWL",       // Character output hook low
  0x37: "CSWH",       // Character output hook high
  0x38: "KSWL",       // Character input hook low
  0x39: "KSWH",       // Character input hook high
  0x3C: "A1L",        // General pointer low
  0x3D: "A1H",        // General pointer high
  0x3E: "A2L",        // General pointer low
  0x3F: "A2H",        // General pointer high
  0x40: "A3L",        // General pointer low
  0x41: "A3H",        // General pointer high
  0x42: "A4L",        // General pointer low
  0x43: "A4H",        // General pointer high
  0x45: "ACC",        // Accumulator save
  0x46: "XREG",       // X register save
  0x47: "YREG",       // Y register save
  0x48: "STATUS",     // Status register save
  0x4E: "RNDL",       // Random number low
  0x4F: "RNDH",       // Random number high
  0x50: "LINNUM",     // Line number low
  0x51: "LINNUM+1",   // Line number high
  0x67: "TXTTAB",     // Start of BASIC program low
  0x68: "TXTTAB+1",
  0x69: "VARTAB",     // Start of variables low
  0x6A: "VARTAB+1",
  0x6B: "ARYTAB",     // Start of arrays low
  0x6C: "ARYTAB+1",
  0x6D: "STREND",     // End of arrays low
  0x6E: "STREND+1",
  0x6F: "FRETOP",     // Free string space low
  0x70: "FRETOP+1",
  0x73: "MEMSIZ",     // Top of memory low
  0x74: "MEMSIZ+1",
  0x75: "CURLIN",     // Current line low
  0x76: "CURLIN+1",
  0xAF: "HIMEM",      // High memory low
  0xB0: "HIMEM+1",
};

// Soft Switches ($C000-$C0FF)
export const SOFTSWITCH_SYMBOLS = {
  0xC000: "KBD",          // Keyboard data
  0xC001: "80STOREON",    // Use PAGE2 for aux mem
  0xC002: "RDMAINRAM",    // Read main RAM
  0xC003: "RDAUXRAM",     // Read aux RAM
  0xC004: "WRMAINRAM",    // Write main RAM
  0xC005: "WRAUXRAM",     // Write aux RAM
  0xC006: "SETSLOTCXROM", // Slot ROM enabled
  0xC007: "SETINTCXROM",  // Internal ROM enabled
  0xC008: "SETSTDZP",     // Main zero page/stack
  0xC009: "SETALTZP",     // Aux zero page/stack
  0xC00A: "SETINTC3ROM",  // Internal slot 3 ROM
  0xC00B: "SETSLOTC3ROM", // Slot 3 ROM enabled
  0xC00C: "80COLOFF",     // 40-column mode
  0xC00D: "80COLON",      // 80-column mode
  0xC00E: "ALTCHAROFF",   // Primary char set
  0xC00F: "ALTCHARON",    // Alternate char set
  0xC010: "KBDSTRB",      // Keyboard strobe clear
  0xC011: "RDLCBNK2",     // LC bank 2 status
  0xC012: "RDLCRAM",      // LC RAM status
  0xC013: "RDRAMRD",      // RAMRD status
  0xC014: "RDRAMWRT",     // RAMWRT status
  0xC015: "RDCXROM",      // INTCXROM status
  0xC016: "RDALTZP",      // ALTZP status
  0xC017: "RDC3ROM",      // SLOTC3ROM status
  0xC018: "RD80STORE",    // 80STORE status
  0xC019: "RDVBL",        // Vertical blank status
  0xC01A: "RDTEXT",       // TEXT status
  0xC01B: "RDMIXED",      // MIXED status
  0xC01C: "RDPAGE2",      // PAGE2 status
  0xC01D: "RDHIRES",      // HIRES status
  0xC01E: "RDALTCHAR",    // ALTCHAR status
  0xC01F: "RD80COL",      // 80COL status
  0xC020: "TAPEOUT",      // Cassette output toggle
  0xC030: "SPKR",         // Speaker toggle
  0xC040: "STROBE",       // Utility strobe
  0xC050: "TXTCLR",       // Graphics mode
  0xC051: "TXTSET",       // Text mode
  0xC052: "MIXCLR",       // Full screen
  0xC053: "MIXSET",       // Mixed mode
  0xC054: "LOWSCR",       // Page 1
  0xC055: "HISCR",        // Page 2
  0xC056: "LORES",        // Lo-res mode
  0xC057: "HIRES",        // Hi-res mode
  0xC058: "AN0OFF",       // Annunciator 0 off
  0xC059: "AN0ON",        // Annunciator 0 on
  0xC05A: "AN1OFF",       // Annunciator 1 off
  0xC05B: "AN1ON",        // Annunciator 1 on
  0xC05C: "AN2OFF",       // Annunciator 2 off
  0xC05D: "AN2ON",        // Annunciator 2 on
  0xC05E: "AN3OFF",       // Annunciator 3 off (DHIRES on)
  0xC05F: "AN3ON",        // Annunciator 3 on (DHIRES off)
  0xC060: "TAPEIN",       // Cassette input
  0xC061: "PB0",          // Pushbutton 0 (Open Apple)
  0xC062: "PB1",          // Pushbutton 1 (Closed Apple)
  0xC063: "PB2",          // Pushbutton 2
  0xC064: "PDL0",         // Paddle 0
  0xC065: "PDL1",         // Paddle 1
  0xC066: "PDL2",         // Paddle 2
  0xC067: "PDL3",         // Paddle 3
  0xC070: "PTRIG",        // Paddle trigger
  0xC07F: "IOUDIS",       // IOU disable
  0xC080: "LCRAMRD2",     // LC RAM bank 2, read RAM
  0xC081: "LCROMRD2",     // LC ROM bank 2, write enable
  0xC082: "LCROMRD2",     // LC ROM bank 2, read ROM
  0xC083: "LCRAMRD2",     // LC RAM bank 2, read/write RAM
  0xC088: "LCRAMRD1",     // LC RAM bank 1, read RAM
  0xC089: "LCROMRD1",     // LC ROM bank 1, write enable
  0xC08A: "LCROMRD1",     // LC ROM bank 1, read ROM
  0xC08B: "LCRAMRD1",     // LC RAM bank 1, read/write RAM
};

// Disk II Controller ($C0E0-$C0EF)
export const DISK_SYMBOLS = {
  0xC0E0: "PHASE0OFF",
  0xC0E1: "PHASE0ON",
  0xC0E2: "PHASE1OFF",
  0xC0E3: "PHASE1ON",
  0xC0E4: "PHASE2OFF",
  0xC0E5: "PHASE2ON",
  0xC0E6: "PHASE3OFF",
  0xC0E7: "PHASE3ON",
  0xC0E8: "MOTOROFF",
  0xC0E9: "MOTORON",
  0xC0EA: "DRV0EN",
  0xC0EB: "DRV1EN",
  0xC0EC: "Q6L",
  0xC0ED: "Q6H",
  0xC0EE: "Q7L",
  0xC0EF: "Q7H",
};

// Monitor ROM routines
export const ROM_SYMBOLS = {
  0xF800: "PLOT",       // Plot lo-res point
  0xF819: "HLINE",      // Horizontal line
  0xF828: "VLINE",      // Vertical line
  0xF832: "CLRSCR",     // Clear lo-res screen
  0xF836: "CLRTOP",     // Clear top of screen
  0xF847: "GBASCALC",   // Calculate graphics base
  0xF856: "NXTCOL",     // Next color
  0xF85F: "SETCOL",     // Set color
  0xF864: "SCRN",       // Read lo-res pixel
  0xF871: "INSDS1",     // Disassembler
  0xF882: "INSDS2",     // Disassembler
  0xF88E: "INSTDSP",    // Instruction display
  0xF8D0: "MPTS",       // Mini-assembler
  0xF940: "PRNTYX",     // Print Y,X as hex
  0xF941: "PRNTAX",     // Print A,X as hex
  0xF944: "PRNTX",      // Print X as hex
  0xF948: "PRBLNK",     // Print 3 blanks
  0xF94A: "PRBL2",      // Print X blanks
  0xF953: "PCADJ",      // PC adjust
  0xFA40: "PWRUP",      // Power-up
  0xFA62: "SLOOP",      // Sound loop
  0xFAA6: "REGDSP",     // Register display
  0xFAD7: "RTBL",       // Register table
  0xFADA: "PREAD",      // Read paddle
  0xFB1E: "PREAD4",     // Read paddle done
  0xFB19: "PREAD3",     // Read paddle wait
  0xFB2F: "INIT",       // Initialize machine
  0xFB39: "SETTXT",     // Set text mode
  0xFB40: "SETGR",      // Set graphics mode
  0xFB4B: "SETWND",     // Set window
  0xFB5B: "TABV",       // Tab vertical
  0xFB60: "APPLEII",    // Apple II logo
  0xFBC1: "BASCALC",    // Text base calculate
  0xFBD0: "BELL1",      // Bell routine
  0xFBD9: "BELL2",      // Beep once
  0xFBDD: "STORADV",    // Store and advance
  0xFBE4: "ADVANCE",    // Advance cursor
  0xFBF4: "VIDOUT",     // Video output
  0xFC10: "BS",         // Backspace
  0xFC1A: "UP",         // Cursor up
  0xFC22: "VTAB",       // Vertical tab
  0xFC24: "VTABZ",      // Vertical tab (alt)
  0xFC2C: "ESC",        // Escape
  0xFC42: "CLREOP",     // Clear to end of page
  0xFC58: "HOME",       // Clear screen/home
  0xFC62: "CR",         // Carriage return
  0xFC66: "LF",         // Line feed
  0xFC70: "SCROLL",     // Scroll screen
  0xFC9C: "CLREOL",     // Clear to end of line
  0xFC95: "CLEOL1",     // Clear to EOL (alt)
  0xFCA8: "WAIT",       // Wait routine
  0xFCB4: "NXTA4",      // Next A4
  0xFCBA: "NXTA1",      // Next A1
  0xFCC9: "HEADR",      // Write cassette header
  0xFCEC: "RDBYTE",     // Read cassette byte
  0xFCFA: "RDBYT2",     // Read cassette byte 2
  0xFD0C: "RDKEY",      // Read key
  0xFD18: "KEYIN",      // Key input
  0xFD1B: "KEYIN2",     // Key input loop
  0xFD35: "RDCHAR",     // Read character
  0xFD3D: "NOTCR",      // Not carriage return
  0xFD5A: "NOTCR1",     // Not CR continue
  0xFD5C: "CAPTST",     // Caps test
  0xFD62: "ADTEFN",     // Add to buffer
  0xFD67: "NXTCHAR",    // Next character
  0xFD6A: "TOSUB",      // To subroutine
  0xFD6F: "ZMODE",      // Zero mode
  0xFD75: "SETMDP",     // Set mode positive
  0xFD7E: "SETMD",      // Set mode
  0xFD8B: "LT",         // Less than
  0xFD8E: "GETLN",      // Get line
  0xFD92: "GETLNZ",     // Get line (zero)
  0xFD9A: "BCKSPC",     // Backspace
  0xFDA3: "NXTCHR",     // Next char in buffer
  0xFDB3: "CANCEL",     // Cancel line
  0xFDC6: "GETNUM",     // Get number
  0xFDDA: "CROUT1",     // CR out
  0xFDED: "COUT",       // Character output
  0xFDF0: "COUT1",      // Char out to screen
  0xFDF6: "COUTZ",      // Char out (zero)
  0xFE00: "BLANK",      // Print blank
  0xFE04: "BL1",        // Print blank 1
  0xFE18: "PAUSE",      // Pause
  0xFE1F: "HOME2",      // Home 2
  0xFE22: "VIDWRT",     // Video write
  0xFE2C: "SCRCOMP",    // Screen complete
  0xFE5E: "OLDBRK",     // Old break
  0xFE63: "BREAK",      // Break
  0xFE67: "OLDREST",    // Old restore
  0xFE6C: "RESTART",    // Restart
  0xFE80: "DRAWPNT",    // Draw point
  0xFE84: "HIRES1",     // Hi-res 1
  0xFE89: "HIRES2",     // Hi-res 2
  0xFE93: "HCLR",       // Hi-res clear
  0xFEA9: "BKGND",      // Background
  0xFEB0: "SETHCOL",    // Set hi-res color
  0xFEB3: "HCOLOR1",    // Hi-res color 1
  0xFEC2: "COLORTBL",   // Color table
  0xFECA: "GETCOL",     // Get color
  0xFED4: "HCOUNT",     // Hi-res count
  0xFEE3: "HPOSN",      // Hi-res position
  0xFEF6: "HBARONE",    // Hi-res bar one
  0xFEFB: "HBARONE1",   // Hi-res bar one 1
  0xFF02: "HFIND",      // Hi-res find
  0xFF12: "HGLIN",      // Hi-res get line
  0xFF3A: "HPLOT",      // Hi-res plot (official)
  0xFF3F: "MOVEX",      // Move X
  0xFF44: "MOVEX2",     // Move X 2
  0xFF50: "LFTRT",      // Left/right
  0xFF58: "MONZ",       // Monitor (warm start)
  0xFF59: "MON",        // Monitor entry
  0xFF65: "NXTITM",     // Next item
  0xFF69: "GETNUM2",    // Get number 2
  0xFF73: "NXTBIT",     // Next bit
  0xFF7A: "GETLNZ2",    // Get line z 2
  0xFF8A: "CROUT",      // Carriage return out
  0xFF90: "PRBYTE",     // Print byte as hex
  0xFFA7: "PRHEX",      // Print nibble as hex
  0xFFAD: "PRNTYX2",    // Print Y,X
  0xFFB4: "OLDRST",     // Old reset
  0xFFBE: "NEWRST",     // New reset
  0xFFC7: "SPTS",       // Set points
  0xFFCC: "INPORT",     // Input port
  0xFFCF: "OUTPORT",    // Output port
  0xFFE3: "GO",         // Go (execute)
  0xFFE7: "REGZ",       // Register Z
  0xFFFA: "NMI",        // NMI vector
  0xFFFC: "RESET",      // Reset vector
  0xFFFE: "IRQ",        // IRQ/BRK vector
};

// Applesoft BASIC ROM routines
export const BASIC_SYMBOLS = {
  0xD365: "NEWSTT",     // New statement
  0xD39E: "GONE",       // Gone (execute)
  0xD4F2: "CHRGOT",     // Get current char
  0xD559: "FNDLIN",     // Find line
  0xD61A: "CHKCOM",     // Check for comma
  0xD665: "FRMNUM",     // Get numeric expression
  0xD7D2: "PTRGET",     // Get pointer to variable
  0xDB3A: "CHRGET",     // Get next char
  0xDD67: "FPWR",       // Power function
  0xDDCD: "NEGOP",      // Negate
  0xDDCF: "LOG",        // LOG function
  0xDE5E: "FMULT",      // Multiply
  0xDF7E: "CONUPK",     // Unpack constant
  0xDFE3: "FINLOG",     // Finish LOG
  0xE07A: "FSUB",       // Subtract
  0xE082: "FADD",       // Add
  0xE0F6: "OVERR",      // Overflow error
  0xE10C: "HALF",       // 0.5 constant
  0xE10F: "LOG2",       // LOG(2) constant
  0xE113: "SQRT2",      // SQRT(2) constant
  0xE11E: "NEGHLF",     // -0.5 constant
  0xE120: "LOGCON",     // LOG constant
  0xE131: "SQR",        // SQR function
  0xE941: "COS",        // COS function
  0xE94B: "SIN",        // SIN function
  0xE97E: "TAN",        // TAN function
  0xEA14: "ATN",        // ATN function
};

// Combine all symbols into a single lookup
export const ALL_SYMBOLS = {
  ...ZERO_PAGE_SYMBOLS,
  ...SOFTSWITCH_SYMBOLS,
  ...DISK_SYMBOLS,
  ...ROM_SYMBOLS,
  ...BASIC_SYMBOLS,
};

/**
 * Look up a symbolic name for an address
 * @param {number} addr - The address to look up
 * @returns {string|null} - The symbolic name or null if not found
 */
export function getSymbol(addr) {
  return ALL_SYMBOLS[addr] || null;
}

/**
 * Format an address with its symbol if known
 * @param {number} addr - The address
 * @returns {string} - Formatted as "SYMBOL" or "$XXXX" if no symbol
 */
export function formatAddressWithSymbol(addr) {
  const symbol = ALL_SYMBOLS[addr];
  if (symbol) {
    return symbol;
  }
  return '$' + addr.toString(16).toUpperCase().padStart(4, '0');
}
