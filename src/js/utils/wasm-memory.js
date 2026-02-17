/*
 * wasm-memory.js - WASM memory access helpers for BASIC subsystem
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/**
 * Read a byte from memory (non-side-effecting)
 * @param {Object} wasmModule - The WASM module instance
 * @param {number} addr - Memory address to read
 * @returns {number} Byte value at address
 */
export async function peek(wasmModule, addr) {
  try {
    return await wasmModule._peekMemory(addr);
  } catch (e) {
    return 0;
  }
}

/**
 * Read a byte directly from main RAM (bypasses ALTZP)
 * Use for BASIC zero page variables which are always in main RAM
 * @param {Object} wasmModule - The WASM module instance
 * @param {number} addr - Memory address to read
 * @returns {number} Byte value at address in main RAM
 */
export async function peekMain(wasmModule, addr) {
  try {
    return await wasmModule._readMainRAM(addr);
  } catch (e) {
    return 0;
  }
}

/**
 * Read a 16-bit word from memory (low byte first)
 * Uses main RAM for zero page/stack (< $200) to bypass ALTZP switch,
 * since BASIC always uses main RAM for its zero page variables.
 * @param {Object} wasmModule - The WASM module instance
 * @param {number} addr - Memory address to read
 * @returns {number} 16-bit word value
 */
export async function readWord(wasmModule, addr) {
  if (addr < 0x200) {
    const [low, high] = await wasmModule.batch([
      ['_readMainRAM', addr],
      ['_readMainRAM', addr + 1],
    ]);
    return (high << 8) | low;
  }
  const [low, high] = await wasmModule.batch([
    ['_peekMemory', addr],
    ['_peekMemory', addr + 1],
  ]);
  return (high << 8) | low;
}
