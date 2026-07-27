/*
 * basic-variable-inspector.js - Parse and display Applesoft BASIC variables
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/**
 * Applesoft BASIC Variable Memory Layout:
 * - Simple variables: VARTAB ($69-$6A) to ARYTAB ($6B-$6C)
 * - Arrays: ARYTAB ($6B-$6C) to STREND ($6D-$6E)
 *
 * Variable name format (2 bytes):
 * - First byte: First char (A-Z), bit 7 = integer type if set on BOTH bytes
 * - Second byte: Second char (0-9, A-Z, or null), high bit set for string type
 *
 * Value format:
 * - Real (5 bytes): Applesoft floating point
 * - Integer (2 bytes): Signed 16-bit (high byte, low byte)
 * - String (3 bytes): Length byte + 2-byte pointer to string data
 */


// Mirrors a2e::BasicVarType.
const VAR_TYPES = ["real", "integer", "string"];

// Applesoft simple variables are a fixed 7 bytes: 2 name + 5 value.
const SIMPLE_VAR_SIZE = 7;

export class BasicVariableInspector {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
  }

  /**
   * Get all simple variables from memory
   * @returns {Array<{name: string, type: string, value: any, rawValue: Uint8Array}>}
   */
  async getSimpleVariables() {
    const wasm = this.wasmModule;

    // One call walks VARTAB..ARYTAB in the core and caches the result; the
    // per-variable reads below are metadata only. Previously this decoded the
    // Applesoft layout in JS with a _peekMemory round trip per byte.
    const count = await wasm._refreshBasicVariables();
    if (count <= 0) return [];

    const variables = [];
    for (let i = 0; i < count; i++) {
      const [namePtr, type, addr] = await wasm.batch([
        ["_getBasicVariableName", i],
        ["_getBasicVariableType", i],
        ["_getBasicVariableAddress", i],
      ]);

      const name = await wasm.UTF8ToString(namePtr);
      const typeName = VAR_TYPES[type] ?? "real";

      let value;
      if (typeName === "integer") {
        value = await wasm._getBasicVariableInt(i);
      } else if (typeName === "string") {
        value = await wasm.UTF8ToString(await wasm._getBasicVariableString(i));
      } else {
        value = await wasm._getBasicVariableReal(i);
      }

      variables.push({ name, type: typeName, value, addr, size: SIMPLE_VAR_SIZE });
    }

    return variables;
  }

  /**
   * Get all array variables from memory
   * @returns {Array<{name: string, type: string, dimensions: number[], values: any[]}>}
   */
  async getArrayVariables() {
    const wasm = this.wasmModule;

    const count = await wasm._refreshBasicArrays();
    if (count <= 0) return [];

    const arrays = [];
    for (let i = 0; i < count; i++) {
      const [namePtr, type, addr, numDims, elementCount] = await wasm.batch([
        ["_getBasicArrayName", i],
        ["_getBasicArrayType", i],
        ["_getBasicArrayAddress", i],
        ["_getBasicArrayNumDims", i],
        ["_getBasicArrayElementCount", i],
      ]);

      const name = await wasm.UTF8ToString(namePtr);
      const typeName = VAR_TYPES[type] ?? "real";

      const dimCalls = [];
      for (let d = 0; d < numDims; d++) dimCalls.push(["_getBasicArrayDim", i, d]);
      const dimensions = numDims > 0 ? await wasm.batch(dimCalls) : [];

      const values = await this._readArrayValues(i, typeName, elementCount);

      arrays.push({
        name,
        type: typeName,
        dimensions,
        values,
        totalElements: elementCount,
        addr,
        numDims,
      });
    }

    return arrays;
  }

  /**
   * Read one array's element values in bulk.
   *
   * Values live contiguously in the WASM heap, so each array costs a single
   * heapRead regardless of how many elements it holds — the point of moving the
   * walk into the core. Strings arrive as one NUL-separated blob.
   */
  async _readArrayValues(index, type, elementCount) {
    if (elementCount <= 0) return [];
    const wasm = this.wasmModule;

    if (type === "string") {
      const [ptr, size] = await wasm.batch([
        ["_getBasicArrayStrings", index],
        ["_getBasicArrayStringsSize", index],
      ]);
      if (!ptr || size <= 0) return new Array(elementCount).fill("");

      const blob = await wasm.heapRead(ptr, size);
      const values = [];
      let start = 0;
      for (let i = 0; i < size; i++) {
        if (blob[i] === 0) {
          values.push(String.fromCharCode(...blob.subarray(start, i)));
          start = i + 1;
        }
      }
      // Pad in case the blob ended early — the UI indexes by element.
      while (values.length < elementCount) values.push("");
      return values;
    }

    if (type === "integer") {
      const ptr = await wasm._getBasicArrayInts(index);
      if (!ptr) return new Array(elementCount).fill(0);
      const bytes = await wasm.heapRead(ptr, elementCount * 4);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return Array.from({ length: elementCount }, (_, i) => view.getInt32(i * 4, true));
    }

    const ptr = await wasm._getBasicArrayReals(index);
    if (!ptr) return new Array(elementCount).fill(0);
    const bytes = await wasm.heapRead(ptr, elementCount * 8);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return Array.from({ length: elementCount }, (_, i) => view.getFloat64(i * 8, true));
  }

  /**
   * Write a new value to a simple variable in memory
   * @param {Object} varInfo - Variable info from getSimpleVariables() (must include addr and type)
   * @param {string} newValueStr - New value as a string entered by the user
   * @returns {boolean} true if the write succeeded
   */
  async setVariableValue(varInfo, newValueStr) {
    const { addr, type } = varInfo;
    const valueAddr = addr + 2; // skip 2-byte name

    if (type === "integer") {
      const parsed = parseInt(newValueStr, 10);
      if (isNaN(parsed) || parsed < -32768 || parsed > 32767) return false;
      const unsigned = parsed < 0 ? parsed + 0x10000 : parsed;
      this.wasmModule._writeMemory(valueAddr, (unsigned >> 8) & 0xff);
      this.wasmModule._writeMemory(valueAddr + 1, unsigned & 0xff);
      return true;
    } else if (type === "string") {
      // String editing: write new characters into the existing string buffer
      // We can only write up to the original allocated length
      const [origLen, ptrLo, ptrHi] = await this.wasmModule.batch([
        ['_peekMemory', valueAddr],
        ['_peekMemory', valueAddr + 1],
        ['_peekMemory', valueAddr + 2],
      ]);
      const ptr = ptrLo | (ptrHi << 8);
      // Strip surrounding quotes if present
      let str = newValueStr;
      if (str.startsWith('"') && str.endsWith('"')) str = str.slice(1, -1);
      if (str.length > origLen) str = str.slice(0, origLen);
      // Update length
      this.wasmModule._writeMemory(valueAddr, str.length);
      // Write characters
      for (let i = 0; i < str.length; i++) {
        this.wasmModule._writeMemory(ptr + i, str.charCodeAt(i) | 0x80);
      }
      return true;
    } else {
      // Real number
      const parsed = parseFloat(newValueStr);
      if (isNaN(parsed)) return false;
      // Encoding lives in the core (a2e::ApplesoftVars::encodeFloat).
      this.wasmModule._writeApplesoftFloat(valueAddr, parsed);
      return true;
    }
  }

  /**
   * Write a new value to an array element in memory
   * @param {Object} info - { addr, type, numDims, elementIndex }
   *   addr: start address of the array entry in memory
   *   type: 'real', 'integer', or 'string'
   *   numDims: number of dimensions
   *   elementIndex: flat index of the element
   * @param {string} newValueStr - New value as a string
   * @returns {boolean} true if the write succeeded
   */
  async setArrayElementValue(info, newValueStr) {
    const { addr, type, numDims, elementIndex } = info;
    const elementSize = type === "integer" ? 2 : type === "string" ? 3 : 5;
    const dataStart = addr + 5 + numDims * 2;
    const elemAddr = dataStart + elementIndex * elementSize;

    if (type === "integer") {
      const parsed = parseInt(newValueStr, 10);
      if (isNaN(parsed) || parsed < -32768 || parsed > 32767) return false;
      const unsigned = parsed < 0 ? parsed + 0x10000 : parsed;
      this.wasmModule._writeMemory(elemAddr, (unsigned >> 8) & 0xff);
      this.wasmModule._writeMemory(elemAddr + 1, unsigned & 0xff);
      return true;
    } else if (type === "string") {
      const [origLen, ePtrLo, ePtrHi] = await this.wasmModule.batch([
        ['_peekMemory', elemAddr],
        ['_peekMemory', elemAddr + 1],
        ['_peekMemory', elemAddr + 2],
      ]);
      const ptr = ePtrLo | (ePtrHi << 8);
      let str = newValueStr;
      if (str.startsWith('"') && str.endsWith('"')) str = str.slice(1, -1);
      if (str.length > origLen) str = str.slice(0, origLen);
      this.wasmModule._writeMemory(elemAddr, str.length);
      for (let i = 0; i < str.length; i++) {
        this.wasmModule._writeMemory(ptr + i, str.charCodeAt(i) | 0x80);
      }
      return true;
    } else {
      const parsed = parseFloat(newValueStr);
      if (isNaN(parsed)) return false;
      // Encoding lives in the core (a2e::ApplesoftVars::encodeFloat).
      this.wasmModule._writeApplesoftFloat(elemAddr, parsed);
      return true;
    }
  }

  /**
   * Format a value for display
   */
  formatValue(variable) {
    if (variable.type === "string") {
      return `"${variable.value}"`;
    } else if (variable.type === "integer") {
      return variable.value.toString();
    } else {
      // Real number
      if (Number.isInteger(variable.value)) {
        return variable.value.toString();
      }
      // Format with reasonable precision
      const absVal = Math.abs(variable.value);
      if (absVal === 0) return "0";
      if (absVal >= 0.01 && absVal < 1e7) {
        return variable.value.toPrecision(9).replace(/\.?0+$/, "");
      }
      return variable.value.toExponential(6);
    }
  }
}
