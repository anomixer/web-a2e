/*
 * assembler-tools.js - Assembler window tools
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

export const assemblerTools = {
  /**
   * Assemble the current source code
   */
  asmAssemble: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const asmWindow = windowManager.getWindow("assembler-editor");
    if (!asmWindow) {
      throw new Error("Assembler window not found");
    }

    asmWindow.doAssemble();

    return {
      success: true,
      message: "Assembly completed",
    };
  },

  /**
   * Write assembled code into emulator memory
   */
  asmWrite: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const asmWindow = windowManager.getWindow("assembler-editor");
    if (!asmWindow) {
      throw new Error("Assembler window not found");
    }

    asmWindow.doLoad();

    return {
      success: true,
      message: "Assembled code written to memory",
    };
  },

  /**
   * Load example program into the editor
   */
  asmLoadExample: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const asmWindow = windowManager.getWindow("assembler-editor");
    if (!asmWindow) {
      throw new Error("Assembler window not found");
    }

    asmWindow.loadExample();

    return {
      success: true,
      message: "Example program loaded into editor",
    };
  },

  /**
   * Clear editor and start new file
   * Emulates the newFile() method without confirmation dialog
   */
  asmNew: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const asmWindow = windowManager.getWindow("assembler-editor");
    if (!asmWindow) {
      throw new Error("Assembler window not found");
    }

    // Emulate newFile() behavior without confirmation
    if (asmWindow.textarea) {
      asmWindow.textarea.value = "";
      asmWindow.currentFileName = null;
      asmWindow._fileHandle = null;
      asmWindow.updateTitle("Assembler");
      asmWindow.updateHighlighting();
      asmWindow.updateGutter();
      asmWindow.errors.clear();
      asmWindow.syntaxErrors.clear();
      asmWindow.clearOutputPanels();
      asmWindow.setStatus("", true);
    }

    return {
      success: true,
      message: "Assembler editor cleared",
    };
  },

  /**
   * Get current assembly source code from editor
   */
  asmGet: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const asmWindow = windowManager.getWindow("assembler-editor");
    if (!asmWindow) {
      throw new Error("Assembler window not found");
    }

    const text = asmWindow.textarea ? asmWindow.textarea.value : "";

    return {
      success: true,
      source: text,
      lines: text ? text.split("\n").length : 0,
      message: "Assembly source retrieved",
    };
  },

  /**
   * Set assembly source code in editor (replace entire content)
   */
  asmSet: async (args) => {
    const { source } = args;

    if (source === undefined) {
      throw new Error("source parameter is required");
    }

    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const asmWindow = windowManager.getWindow("assembler-editor");
    if (!asmWindow) {
      throw new Error("Assembler window not found");
    }

    if (asmWindow.textarea) {
      asmWindow.textarea.value = source;
      asmWindow.updateHighlighting();
      asmWindow.validateAllLines();
      asmWindow.encodeAllLineBytes();
      asmWindow.updateGutter();
    }

    return {
      success: true,
      message: "Assembly source set",
    };
  },

  /**
   * Get assembly source content from editor (used with save file MCP tool)
   */
  saveAsmInEditorToLocal: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const asmWindow = windowManager.getWindow("assembler-editor");
    if (!asmWindow) {
      throw new Error("Assembler window not found");
    }

    const content = asmWindow.textarea ? asmWindow.textarea.value : "";
    if (!content.trim()) {
      throw new Error("No source code in editor to save");
    }

    return {
      success: true,
      content: content,
      lines: content.split("\n").length,
      message: "Assembly source content retrieved from editor",
    };
  },

  /**
   * Get assembly status, origin address, and size
   */
  asmGetStatus: async (args) => {
    const windowManager = window.emulator?.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const asmWindow = windowManager.getWindow("assembler-editor");
    if (!asmWindow) {
      throw new Error("Assembler window not found");
    }

    const statusText = asmWindow.statusSpan
      ? asmWindow.statusSpan.textContent
      : "";
    const statusClass = asmWindow.statusSpan
      ? asmWindow.statusSpan.className
      : "";
    const isError = statusClass.includes("asm-status-error");
    const origin = asmWindow.lastOrigin || 0;
    const size = asmWindow.lastAssembledSize || 0;

    // Determine status: none if no assembly, error if failed, ok if successful
    let status;
    if (!statusText.trim() || size === 0) {
      status = "none";
    } else if (isError) {
      status = "error";
    } else {
      status = "ok";
    }

    return {
      success: true,
      status: status,
      statusText: statusText,
      origin: origin,
      originHex: "$" + origin.toString(16).toUpperCase().padStart(4, "0"),
      size: size,
      message: "Assembly status retrieved",
    };
  },

  /**
   * Execute code at a specific address (like monitor's G command)
   * Sets PC to address and optionally resumes execution
   */
  directExecuteAssemblyAt: async (args) => {
    const { paused = false, addr } = args;

    const emulator = window.emulator;
    if (!emulator) {
      throw new Error("Emulator not available");
    }

    const windowManager = emulator.windowManager;
    if (!windowManager) {
      throw new Error("Window manager not available");
    }

    const wasmModule = emulator.wasmModule;
    if (!wasmModule) {
      throw new Error("WASM module not available");
    }

    // Determine address to execute
    let address;
    if (addr !== undefined) {
      // Support hex ($xxxx or 0xXXXX) or decimal
      if (typeof addr === "string") {
        const trimmed = addr.trim();
        if (trimmed.startsWith("$")) {
          address = parseInt(trimmed.substring(1), 16);
        } else if (trimmed.toLowerCase().startsWith("0x")) {
          address = parseInt(trimmed, 16);
        } else {
          address = parseInt(trimmed, 10);
        }
      } else {
        address = addr;
      }
    } else {
      // Use origin from last successful assembly
      const asmWindow = windowManager.getWindow("assembler-editor");
      if (!asmWindow) {
        throw new Error("Assembler window not found");
      }
      address = asmWindow.lastOrigin || 0;
      if (address === 0) {
        throw new Error(
          "No address specified and no assembled program origin available",
        );
      }
    }

    // Pause first to ensure clean state
    wasmModule._setPaused(true);

    // Push return address onto stack if specified
    const { returnTo = "auto" } = args;
    let returnAddr = null;
    if (returnTo !== undefined) {
      const NAMED_RETURNS = {
        "monitor": 0xFF69,
        "basic": 0xE003,
        "auto": wasmModule._getPC(),
      };

      if (typeof returnTo === "string") {
        const lower = returnTo.trim().toLowerCase();
        if (NAMED_RETURNS[lower] !== undefined) {
          returnAddr = NAMED_RETURNS[lower];
        } else if (returnTo.trim().startsWith("$")) {
          returnAddr = parseInt(returnTo.trim().substring(1), 16);
        } else if (returnTo.trim().toLowerCase().startsWith("0x")) {
          returnAddr = parseInt(returnTo.trim(), 16);
        } else {
          returnAddr = parseInt(returnTo.trim(), 10);
        }
      } else {
        returnAddr = returnTo;
      }

      if (isNaN(returnAddr)) {
        throw new Error(`Invalid returnTo address: ${returnTo}`);
      }

      // RTS pops address and adds 1, so push (returnAddr - 1)
      const rtsAddr = (returnAddr - 1) & 0xFFFF;
      const sp = wasmModule._getSP();
      wasmModule._writeMemory(0x0100 + sp, (rtsAddr >> 8) & 0xFF);
      wasmModule._writeMemory(0x0100 + ((sp - 1) & 0xFF), rtsAddr & 0xFF);
      wasmModule._setRegSP((sp - 2) & 0xFF);
    }

    // Set PC to target address
    wasmModule._setRegPC(address);

    // Set final paused state: true = stay paused, false = resume execution
    wasmModule._setPaused(paused);

    const addrHex = "$" + address.toString(16).toUpperCase().padStart(4, "0");
    const returnHex = returnAddr !== null
      ? "$" + returnAddr.toString(16).toUpperCase().padStart(4, "0")
      : null;
    const returnMsg = returnHex ? `, return to ${returnHex}` : "";
    const statusMsg = paused
      ? `PC set to ${addrHex} (paused${returnMsg})`
      : `Executing at ${addrHex}${returnMsg}`;

    return {
      success: true,
      address: address,
      addressHex: addrHex,
      returnTo: returnAddr,
      returnToHex: returnHex,
      paused: paused,
      message: statusMsg,
    };
  },
};
