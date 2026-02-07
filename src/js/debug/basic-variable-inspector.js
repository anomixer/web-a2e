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

import { peek, readWord } from "../utils/wasm-memory.js";

export class BasicVariableInspector {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
  }

  /**
   * Get all simple variables from memory
   * @returns {Array<{name: string, type: string, value: any, rawValue: Uint8Array}>}
   */
  getSimpleVariables() {
    const variables = [];

    const vartab = readWord(this.wasmModule,0x69);
    const arytab = readWord(this.wasmModule,0x6b);

    // No variables if pointers are invalid or equal (empty variable area)
    if (vartab === 0 || arytab === 0 || vartab >= arytab) {
      return variables;
    }

    // Sanity check - variable area should be in reasonable range
    if (vartab < 0x800 || arytab > 0xC000) {
      return variables;
    }

    let addr = vartab;
    while (addr < arytab) {
      const varInfo = this._parseVariable(addr);
      if (!varInfo) break;

      variables.push(varInfo);
      addr += varInfo.size;
    }

    return variables;
  }

  /**
   * Get all array variables from memory
   * @returns {Array<{name: string, type: string, dimensions: number[], values: any[]}>}
   */
  getArrayVariables() {
    const arrays = [];

    const arytab = readWord(this.wasmModule,0x6b);
    const strend = readWord(this.wasmModule,0x6d);

    if (arytab === 0 || strend === 0 || arytab >= strend) {
      return arrays;
    }

    let addr = arytab;
    while (addr < strend) {
      const arrayInfo = this._parseArray(addr);
      if (!arrayInfo) break;

      arrays.push(arrayInfo);
      addr += arrayInfo.totalSize;
    }

    return arrays;
  }

  /**
   * Parse a single variable at the given address
   */
  _parseVariable(addr) {
    const byte1 = peek(this.wasmModule,addr);
    const byte2 = peek(this.wasmModule,addr + 1);

    if (byte1 === 0) return null;

    const { name, type } = this._parseVariableName(byte1, byte2);
    let value;
    let rawValue;
    let size;

    if (type === "integer") {
      // Integer: 2 bytes (high, low)
      const high = peek(this.wasmModule,addr + 2);
      const low = peek(this.wasmModule,addr + 3);
      value = (high << 8) | low;
      // Convert to signed
      if (value >= 0x8000) value -= 0x10000;
      rawValue = new Uint8Array([high, low]);
      size = 7; // 2 name + 5 value (padded to match real size)
    } else if (type === "string") {
      // String: length + 2-byte pointer
      const len = peek(this.wasmModule,addr + 2);
      const ptrLow = peek(this.wasmModule,addr + 3);
      const ptrHigh = peek(this.wasmModule,addr + 4);
      const ptr = (ptrHigh << 8) | ptrLow;
      value = this._readString(ptr, len);
      rawValue = new Uint8Array([len, ptrLow, ptrHigh]);
      size = 7; // 2 name + 3 value + 2 padding
    } else {
      // Real: 5-byte Applesoft float
      const floatBytes = new Uint8Array(5);
      for (let i = 0; i < 5; i++) {
        floatBytes[i] = peek(this.wasmModule,addr + 2 + i);
      }
      value = this._decodeApplesoftFloat(floatBytes);
      rawValue = floatBytes;
      size = 7; // 2 name + 5 value
    }

    return { name, type, value, rawValue, size, addr };
  }

  /**
   * Parse an array variable header
   */
  _parseArray(addr) {
    const byte1 = peek(this.wasmModule,addr);
    const byte2 = peek(this.wasmModule,addr + 1);

    if (byte1 === 0) return null;

    const { name, type } = this._parseVariableName(byte1, byte2);

    // Total size of array entry (including header) - stored little-endian
    const sizeLow = peek(this.wasmModule,addr + 2);
    const sizeHigh = peek(this.wasmModule,addr + 3);
    const totalSize = (sizeHigh << 8) | sizeLow;

    // Number of dimensions
    const numDims = peek(this.wasmModule,addr + 4);

    // Read dimension sizes (2 bytes each, stored high-low)
    const dimensions = [];
    let dimAddr = addr + 5;
    for (let i = 0; i < numDims; i++) {
      const dimHigh = peek(this.wasmModule,dimAddr);
      const dimLow = peek(this.wasmModule,dimAddr + 1);
      dimensions.push((dimHigh << 8) | dimLow);
      dimAddr += 2;
    }

    // Calculate total elements
    let totalElements = 1;
    for (const dim of dimensions) {
      totalElements *= dim;
    }

    // Read values
    const values = [];
    let valueAddr = dimAddr;
    const elementSize = type === "integer" ? 2 : type === "string" ? 3 : 5;

    // Read all elements (Applesoft arrays are limited by memory anyway)
    for (let i = 0; i < totalElements && i < 10000; i++) {
      let elemValue;
      if (type === "integer") {
        const high = peek(this.wasmModule,valueAddr);
        const low = peek(this.wasmModule,valueAddr + 1);
        elemValue = (high << 8) | low;
        if (elemValue >= 0x8000) elemValue -= 0x10000;
      } else if (type === "string") {
        const len = peek(this.wasmModule,valueAddr);
        const ptrLow = peek(this.wasmModule,valueAddr + 1);
        const ptrHigh = peek(this.wasmModule,valueAddr + 2);
        const ptr = (ptrHigh << 8) | ptrLow;
        elemValue = this._readString(ptr, len);
      } else {
        const floatBytes = new Uint8Array(5);
        for (let j = 0; j < 5; j++) {
          floatBytes[j] = peek(this.wasmModule,valueAddr + j);
        }
        elemValue = this._decodeApplesoftFloat(floatBytes);
      }
      values.push(elemValue);
      valueAddr += elementSize;
    }

    return {
      name,
      type,
      dimensions,
      values,
      totalSize,
      totalElements,
      addr,
      numDims,
    };
  }

  /**
   * Parse variable name from two bytes
   */
  _parseVariableName(byte1, byte2) {
    // Extract characters (mask off high bits for char value)
    const char1 = String.fromCharCode(byte1 & 0x7f);
    const char2Raw = byte2 & 0x7f;
    const char2 = char2Raw ? String.fromCharCode(char2Raw) : "";

    // Determine type from high bits
    // Integer: both high bits set
    // String: second byte high bit set (but not both)
    const isInteger = (byte1 & 0x80) !== 0 && (byte2 & 0x80) !== 0;
    const isString = !isInteger && (byte2 & 0x80) !== 0;

    let type = "real";
    let suffix = "";
    if (isInteger) {
      type = "integer";
      suffix = "%";
    } else if (isString) {
      type = "string";
      suffix = "$";
    }

    return {
      name: char1 + char2 + suffix,
      type,
    };
  }

  /**
   * Decode Applesoft floating point format
   * Format: exponent (1 byte) + mantissa (4 bytes)
   * Exponent: excess-128 (0 = zero value)
   * Mantissa: normalized with implied leading 1, sign in bit 7 of first mantissa byte
   */
  _decodeApplesoftFloat(bytes) {
    const exp = bytes[0];

    // Zero check
    if (exp === 0) return 0;

    // Sign is in bit 7 of mantissa byte 1
    const sign = bytes[1] & 0x80 ? -1 : 1;

    // Build mantissa as a number between 1 and 2 (normalized 1.xxxxx form)
    // The implied leading 1 is not stored, so we start with 1.0
    // Then add the fractional bits from the mantissa bytes
    let mantissa = 1.0;
    mantissa += (bytes[1] & 0x7F) / 128.0;        // 7 bits: values 0.5, 0.25, 0.125, etc.
    mantissa += bytes[2] / 32768.0;               // next 8 bits
    mantissa += bytes[3] / 8388608.0;             // next 8 bits
    mantissa += bytes[4] / 2147483648.0;          // last 8 bits

    // Applesoft uses excess-129 notation (the implied 1 is at position 2^-1, not 2^0)
    // So the actual exponent is exp - 129
    const actualExp = exp - 129;
    const value = sign * mantissa * Math.pow(2, actualExp);

    return value;
  }

  /**
   * Read a string from memory
   */
  _readString(ptr, len) {
    if (len === 0 || ptr === 0) return "";

    let str = "";
    for (let i = 0; i < len; i++) {
      const char = peek(this.wasmModule,ptr + i) & 0x7f;
      str += String.fromCharCode(char);
    }
    return str;
  }

  /**
   * Write a new value to a simple variable in memory
   * @param {Object} varInfo - Variable info from getSimpleVariables() (must include addr and type)
   * @param {string} newValueStr - New value as a string entered by the user
   * @returns {boolean} true if the write succeeded
   */
  setVariableValue(varInfo, newValueStr) {
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
      const origLen = peek(this.wasmModule, valueAddr);
      const ptr = peek(this.wasmModule, valueAddr + 1) | (peek(this.wasmModule, valueAddr + 2) << 8);
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
      const bytes = this._encodeApplesoftFloat(parsed);
      for (let i = 0; i < 5; i++) {
        this.wasmModule._writeMemory(valueAddr + i, bytes[i]);
      }
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
  setArrayElementValue(info, newValueStr) {
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
      const origLen = peek(this.wasmModule, elemAddr);
      const ptr = peek(this.wasmModule, elemAddr + 1) | (peek(this.wasmModule, elemAddr + 2) << 8);
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
      const bytes = this._encodeApplesoftFloat(parsed);
      for (let i = 0; i < 5; i++) {
        this.wasmModule._writeMemory(elemAddr + i, bytes[i]);
      }
      return true;
    }
  }

  /**
   * Encode a JavaScript number into 5-byte Applesoft floating point format
   */
  _encodeApplesoftFloat(value) {
    const bytes = new Uint8Array(5);
    if (value === 0) return bytes; // all zeros = 0.0

    const sign = value < 0 ? 1 : 0;
    let abs = Math.abs(value);

    // Find exponent: normalize so 1.0 <= mantissa < 2.0
    let exp = Math.floor(Math.log2(abs));
    let mantissa = abs / Math.pow(2, exp);

    // Adjust if mantissa is out of range due to floating point
    if (mantissa < 1.0) { mantissa *= 2; exp--; }
    if (mantissa >= 2.0) { mantissa /= 2; exp++; }

    // Applesoft exponent is excess-129
    const expByte = exp + 129;
    if (expByte <= 0 || expByte > 255) return bytes; // underflow/overflow -> 0

    bytes[0] = expByte;

    // Remove the implicit leading 1
    mantissa -= 1.0;

    // Encode 31 bits of fractional mantissa across bytes[1..4]
    // byte[1] has 7 fraction bits + sign in bit 7
    mantissa *= 128; // 2^7
    bytes[1] = (Math.floor(mantissa) & 0x7f) | (sign << 7);
    mantissa -= Math.floor(mantissa);

    mantissa *= 256;
    bytes[2] = Math.floor(mantissa) & 0xff;
    mantissa -= Math.floor(mantissa);

    mantissa *= 256;
    bytes[3] = Math.floor(mantissa) & 0xff;
    mantissa -= Math.floor(mantissa);

    mantissa *= 256;
    bytes[4] = Math.round(mantissa) & 0xff;

    return bytes;
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
