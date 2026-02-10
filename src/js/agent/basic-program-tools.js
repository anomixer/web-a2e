/*
 * basic-program-tools.js - BASIC program window tools
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { BasicProgramParser } from "../debug/basic-program-parser.js";
import { tokenizeProgram } from "../utils/basic-tokenizer.js";

export const basicProgramTools = {
  /**
   * Direct read of BASIC program from memory (no UI interaction required)
   */
  directReadBasic: async (args) => {
    const wasmModule = window.emulator?.wasmModule;
    if (!wasmModule) {
      throw new Error("WASM module not available");
    }

    // Create parser instance to read from memory
    const parser = new BasicProgramParser(wasmModule);
    const lines = parser.getLines();

    if (lines.length === 0) {
      return {
        success: true,
        program: "",
        lines: 0,
        message: "No BASIC program in memory",
      };
    }

    // Format as program text (line number + text)
    const programText = lines
      .map((line) => `${line.lineNumber} ${line.text}`)
      .join("\n");

    return {
      success: true,
      program: programText,
      lines: lines.length,
      message: `Read ${lines.length} lines from memory`,
    };
  },

  /**
   * Direct write of BASIC program to memory (no UI interaction required)
   */
  directWriteBasic: async (args) => {
    const { program } = args;

    if (program === undefined) {
      throw new Error("program parameter is required");
    }

    const wasmModule = window.emulator?.wasmModule;
    if (!wasmModule) {
      throw new Error("WASM module not available");
    }

    const emulator = window.emulator;
    if (!emulator || !emulator.running) {
      throw new Error("Emulator must be powered on");
    }

    // Parse program text into lines (matches window's parseProgram method)
    let text = program.trim();
    if (!text) {
      throw new Error("No program text provided");
    }

    // Sanitize to pure ASCII: convert to ASCII and strip non-ASCII characters
    // Replace any Unicode spaces with regular ASCII space (0x20)
    text = text
      .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]/g, ' ') // Unicode spaces → ASCII space
      .replace(/[^\x00-\x7F]/g, ''); // Remove any non-ASCII characters

    // Debug: Log the character codes to detect encoding issues
    console.log("[directWriteBasic] Input text:", text);
    console.log("[directWriteBasic] First 50 char codes:",
      text.substring(0, 50).split('').map((c, i) =>
        `[${i}]=${c}:0x${c.charCodeAt(0).toString(16)}`
      ).join(' ')
    );

    const lines = [];
    const rawLines = text.split(/\r?\n/);

    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim().toUpperCase();
      if (!trimmed) continue;

      const match = trimmed.match(/^(\d+)\s*(.*)/);
      if (!match) {
        console.warn("Skipping line without line number:", rawLine);
        continue;
      }

      const lineNum = parseInt(match[1], 10);
      if (lineNum < 0 || lineNum > 63999) {
        console.warn("Invalid line number:", lineNum);
        continue;
      }

      // Normalize whitespace: replace multiple spaces with single space
      // This matches ROM tokenizer behavior
      const normalizedContent = (match[2] || "").replace(/\s+/g, " ");

      lines.push({
        lineNumber: lineNum,
        content: normalizedContent,
      });
    }

    // Sort lines by line number (critical for proper BASIC program order)
    lines.sort((a, b) => a.lineNumber - b.lineNumber);

    if (lines.length === 0) {
      throw new Error("No valid BASIC lines found");
    }

    // Tokenize the program
    const txttab = 0x0801;
    const { bytes, endAddr } = tokenizeProgram(lines, txttab);

    // Write tokenized program bytes into emulator memory
    for (let i = 0; i < bytes.length; i++) {
      wasmModule._writeMemory(txttab + i, bytes[i]);
    }

    // Helper to write a 16-bit little-endian pointer to zero page
    const writePtr = (zpAddr, value) => {
      wasmModule._writeMemory(zpAddr, value & 0xff);
      wasmModule._writeMemory(zpAddr + 1, (value >> 8) & 0xff);
    };

    // Read MEMSIZE ($73) - the ROM sets FRETOP to this on CLR/NEW
    const memsizeLo = wasmModule._readMemory(0x73);
    const memsizeHi = wasmModule._readMemory(0x74);
    const memsize = memsizeLo | (memsizeHi << 8);

    // Update Applesoft zero page pointers
    writePtr(0x67, txttab); // TXTTAB - start of program
    writePtr(0x69, endAddr); // VARTAB - start of variable space
    writePtr(0x6b, endAddr); // ARYTAB - start of array space
    writePtr(0x6d, endAddr); // STREND - end of numeric storage
    writePtr(0x6f, memsize); // FRETOP - end of string storage
    writePtr(0xaf, endAddr); // PRGEND - end of program
    writePtr(0xb8, txttab - 1); // TXTPTR - interpreter text pointer
    wasmModule._writeMemory(0x76, 0xff); // CURLIN+1 = $FF (direct mode)

    return {
      success: true,
      lines: lines.length,
      bytes: bytes.length,
      message: `Wrote ${lines.length} lines (${bytes.length} bytes) to memory`,
    };
  },

  /**
   * Direct run of BASIC program (no UI interaction required)
   */
  directRunBasic: async (args) => {
    const wasmModule = window.emulator?.wasmModule;
    if (!wasmModule) {
      throw new Error("WASM module not available");
    }

    const emulator = window.emulator;
    if (!emulator || !emulator.running) {
      throw new Error("Emulator must be powered on");
    }

    const inputHandler = window.emulator?.inputHandler;
    if (!inputHandler) {
      throw new Error("Input handler not available");
    }

    // Ensure emulator is not paused
    wasmModule._setPaused(false);

    // Clear BASIC breakpoint hit flag if available
    if (wasmModule._clearBasicBreakpointHit) {
      wasmModule._clearBasicBreakpointHit();
    }

    // Queue RUN command to input handler
    inputHandler.queueTextInput("RUN\r");

    return {
      success: true,
      message: "BASIC program execution started",
    };
  },

  /**
   * Direct NEW command - clears BASIC program buffer (no UI interaction required)
   */
  directNewBasic: async (args) => {
    const wasmModule = window.emulator?.wasmModule;
    if (!wasmModule) {
      throw new Error("WASM module not available");
    }

    const emulator = window.emulator;
    if (!emulator || !emulator.running) {
      throw new Error("Emulator must be powered on");
    }

    // Helper to write a 16-bit little-endian pointer to zero page
    const writePtr = (zpAddr, value) => {
      wasmModule._writeMemory(zpAddr, value & 0xff);
      wasmModule._writeMemory(zpAddr + 1, (value >> 8) & 0xff);
    };

    // Read MEMSIZE ($73)
    const memsizeLo = wasmModule._readMemory(0x73);
    const memsizeHi = wasmModule._readMemory(0x74);
    const memsize = memsizeLo | (memsizeHi << 8);

    // TXTTAB - start of BASIC program area
    const txttab = 0x0801;

    // Write end-of-program marker (0x00, 0x00) at start
    wasmModule._writeMemory(txttab, 0x00);
    wasmModule._writeMemory(txttab + 1, 0x00);

    // Reset all BASIC pointers to empty program state
    writePtr(0x67, txttab); // TXTTAB - start of program
    writePtr(0x69, txttab); // VARTAB - start of variables (same as program start = empty)
    writePtr(0x6b, txttab); // ARYTAB - start of arrays
    writePtr(0x6d, txttab); // STREND - end of arrays
    writePtr(0x6f, memsize); // FRETOP - top of free memory
    writePtr(0xaf, txttab); // PRGEND - end of program
    writePtr(0xb8, txttab - 1); // TXTPTR - interpreter text pointer
    wasmModule._writeMemory(0x76, 0xff); // CURLIN+1 = $FF (direct mode)

    return {
      success: true,
      message: "BASIC program buffer cleared",
    };
  },

  /**
   * Load BASIC program from emulator memory into editor
   */
  basicProgramLoadFromMemory: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    basicWindow.loadFromMemory();

    return {
      success: true,
      message: "BASIC program loaded from memory into editor",
    };
  },

  /**
   * Load BASIC program from editor into emulator memory
   */
  basicProgramLoadIntoEmulator: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    basicWindow.loadIntoMemory();

    return {
      success: true,
      message: "BASIC program loaded from editor into emulator memory",
    };
  },

  /**
   * Run BASIC program
   */
  basicProgramRun: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    basicWindow.handleRun();

    return {
      success: true,
      message: "BASIC program execution started",
    };
  },

  /**
   * Pause BASIC program execution
   */
  basicProgramPause: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    basicWindow.handlePause();

    return {
      success: true,
      message: "BASIC program execution paused",
    };
  },

  /**
   * Clear BASIC program editor
   */
  basicProgramClear: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    if (basicWindow.textarea) {
      basicWindow.textarea.value = "";
      basicWindow.updateGutter();
      basicWindow.updateHighlighting();
      basicWindow.updateStats();
    }

    return {
      success: true,
      message: "BASIC program editor cleared",
    };
  },

  /**
   * Renumber BASIC program lines
   */
  basicProgramRenumber: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    basicWindow.renumberProgram();

    return {
      success: true,
      message: "BASIC program renumbered",
    };
  },

  /**
   * Format BASIC program code
   */
  basicProgramFormat: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    basicWindow.autoFormatCode();

    return {
      success: true,
      message: "BASIC program formatted",
    };
  },

  /**
   * Get BASIC program line and character count
   */
  basicProgramLineCount: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    const text = basicWindow.textarea ? basicWindow.textarea.value : "";
    const lines = text ? text.split(/\r?\n/).filter((l) => l.trim()).length : 0;
    const chars = text.length;

    return {
      success: true,
      lines: lines,
      chars: chars,
      message: `${lines} lines, ${chars} characters`,
    };
  },

  /**
   * Get current BASIC program text
   */
  basicProgramGet: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    const text = basicWindow.textarea ? basicWindow.textarea.value : "";

    return {
      success: true,
      program: text,
      message: "BASIC program retrieved",
    };
  },

  /**
   * Edit BASIC program (find and replace text)
   */
  basicProgramEdit: async (args) => {
    const { oldText, newText } = args;

    if (oldText === undefined) {
      throw new Error("oldText parameter is required");
    }

    if (newText === undefined) {
      throw new Error("newText parameter is required");
    }

    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    if (basicWindow.textarea) {
      const currentText = basicWindow.textarea.value;
      const updatedText = currentText.replace(oldText, newText);
      basicWindow.textarea.value = updatedText;
      basicWindow.updateGutter();
      basicWindow.updateHighlighting();
      basicWindow.updateStats();
    }

    return {
      success: true,
      message: "BASIC program edited",
    };
  },

  /**
   * Set BASIC program (replace entire content)
   */
  basicProgramSet: async (args) => {
    const { program } = args;

    if (program === undefined) {
      throw new Error("program parameter is required");
    }

    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const basicWindow = windowManager.getWindow("basic-program");
    if (!basicWindow) {
      throw new Error("BASIC program window not found");
    }

    if (basicWindow.textarea) {
      basicWindow.textarea.value = program;
      basicWindow.updateGutter();
      basicWindow.updateHighlighting();
      basicWindow.updateStats();
    }

    return {
      success: true,
      message: "BASIC program set",
    };
  },
};
