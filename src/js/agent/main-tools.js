/*
 * main-tools.js - Main emulator control tools
 *
 * Written by
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

/**
 * Parse address or length value from hex ($xxxx) or decimal format
 * @param {string|number} value - Value to parse
 * @param {string} paramName - Parameter name for error messages
 * @returns {number} Parsed integer value
 */
function parseHexOrDecimal(value, paramName) {
  if (value === undefined || value === null) {
    throw new Error(`${paramName} parameter is required`);
  }

  // If already a number, use it directly
  if (typeof value === "number") {
    return Math.floor(value);
  }

  // If string, check for hex prefix
  if (typeof value === "string") {
    const trimmed = value.trim();

    // Hex format: $xxxx or 0xXXXX
    if (trimmed.startsWith("$")) {
      const parsed = parseInt(trimmed.substring(1), 16);
      if (isNaN(parsed)) {
        throw new Error(`Invalid hex ${paramName}: ${value}`);
      }
      return parsed;
    }

    if (trimmed.toLowerCase().startsWith("0x")) {
      const parsed = parseInt(trimmed, 16);
      if (isNaN(parsed)) {
        throw new Error(`Invalid hex ${paramName}: ${value}`);
      }
      return parsed;
    }

    // Decimal format
    const parsed = parseInt(trimmed, 10);
    if (isNaN(parsed)) {
      throw new Error(`Invalid decimal ${paramName}: ${value}`);
    }
    return parsed;
  }

  throw new Error(`${paramName} must be a number or string`);
}

export const mainTools = {
  /**
   * Power control
   */
  emulatorPower: async (args) => {
    const { action = "toggle" } = args;

    const emulator = window.emulator;
    if (!emulator) {
      throw new Error("Emulator not available");
    }

    if (action === "on" && !emulator.running) {
      await emulator.start();
    } else if (action === "off" && emulator.running) {
      await emulator.stop();
    } else if (action === "toggle") {
      if (emulator.running) {
        await emulator.stop();
      } else {
        await emulator.start();
      }
    }

    return {
      success: true,
      running: emulator.running,
      message: `Emulator is now ${emulator.running ? "running" : "stopped"}`,
    };
  },

  /**
   * Ctrl-Reset (warm reset)
   */
  emulatorCtrlReset: async (args) => {
    const wasmModule = window.emulator?.wasmModule;
    if (!wasmModule) {
      throw new Error("Emulator not available");
    }

    wasmModule._warmReset();

    return {
      success: true,
      message: "Ctrl-Reset executed (warm reset)",
    };
  },

  /**
   * Reboot (cold reset)
   */
  emulatorReboot: async (args) => {
    const wasmModule = window.emulator?.wasmModule;
    if (!wasmModule) {
      throw new Error("Emulator not available");
    }

    wasmModule._reset();

    return {
      success: true,
      message: "Reboot executed (cold reset)",
    };
  },

  /**
   * Load binary data into memory at a specific address
   */
  directLoadBinaryAt: async (args) => {
    const { address, contentBase64 } = args;

    if (!contentBase64) {
      throw new Error("contentBase64 parameter is required");
    }

    const wasmModule = window.emulator?.wasmModule;
    if (!wasmModule) {
      throw new Error("WASM module not available");
    }

    // Parse address (supports $xxxx hex or decimal)
    const addr = parseHexOrDecimal(address, "address");

    // Decode base64 to binary
    const binaryString = atob(contentBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Pause emulator while writing to ensure clean state
    const wasPaused = await wasmModule._isPaused();
    wasmModule._setPaused(true);

    // Write bytes using writeMemory (like assembler does)
    for (let i = 0; i < bytes.length; i++) {
      wasmModule._writeMemory((addr + i) & 0xffff, bytes[i]);
    }

    // Restore paused state
    wasmModule._setPaused(wasPaused);

    const addrHex = "$" + addr.toString(16).toUpperCase().padStart(4, "0");
    const endAddr = (addr + bytes.length - 1) & 0xffff;
    const endHex = "$" + endAddr.toString(16).toUpperCase().padStart(4, "0");

    return {
      success: true,
      address: addr,
      addressHex: addrHex,
      size: bytes.length,
      endAddress: endAddr,
      endAddressHex: endHex,
      message: `Loaded ${bytes.length} bytes to ${addrHex}-${endHex}`,
    };
  },

  /**
   * Save binary data from memory range to base64
   */
  directSaveBinaryRangeTo: async (args) => {
    const { address, length } = args;

    const wasmModule = window.emulator?.wasmModule;
    if (!wasmModule) {
      throw new Error("WASM module not available");
    }

    // Parse address and length (supports $xxxx hex or decimal)
    const addr = parseHexOrDecimal(address, "address");
    const len = parseHexOrDecimal(length, "length");

    if (len <= 0) {
      throw new Error("length must be > 0");
    }

    // Read bytes using peekMemory (no side effects)
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = await wasmModule._peekMemory((addr + i) & 0xffff);
    }

    // Encode to base64
    let binaryString = "";
    for (let i = 0; i < bytes.length; i++) {
      binaryString += String.fromCharCode(bytes[i]);
    }
    const contentBase64 = btoa(binaryString);

    const addrHex = "$" + addr.toString(16).toUpperCase().padStart(4, "0");
    const lengthHex = "$" + len.toString(16).toUpperCase().padStart(4, "0");
    const endAddr = (addr + len - 1) & 0xffff;
    const endHex = "$" + endAddr.toString(16).toUpperCase().padStart(4, "0");

    return {
      success: true,
      address: addr,
      addressHex: addrHex,
      length: len,
      lengthHex: lengthHex,
      endAddress: endAddr,
      endAddressHex: endHex,
      contentBase64: contentBase64,
      message: `Read ${len} bytes (${lengthHex}) from ${addrHex}-${endHex}`,
    };
  },

  /**
   * Capture the current screen as a base64 PNG image
   */
  captureScreenshot: async () => {
    const emulator = window.emulator;
    if (!emulator?.wasmModule) {
      throw new Error("Emulator not available");
    }

    const imageBase64 = emulator.captureScreenshot();

    return {
      success: true,
      imageBase64,
      width: 560,
      height: 384,
      message: "Screen captured as 560x384 PNG",
    };
  },

  /**
   * Read text from the Apple //e screen
   * Parameters: startRow, startCol, endRow, endCol (all optional, default full screen)
   */
  captureScreenText: async (params = {}) => {
    const emulator = window.emulator;
    if (!emulator?.wasmModule) {
      throw new Error("Emulator not available");
    }

    const startRow = params.startRow ?? 0;
    const startCol = params.startCol ?? 0;
    const endRow = params.endRow ?? 23;
    const endCol = params.endCol ?? 79;

    const ptr = await emulator.wasmModule._readScreenText(startRow, startCol, endRow, endCol);
    const text = await emulator.wasmModule.UTF8ToString(ptr);

    return {
      success: true,
      text,
      startRow,
      startCol,
      endRow,
      endCol,
      message: `Screen text captured from (${startRow},${startCol}) to (${endRow},${endCol})`,
    };
  },
};
