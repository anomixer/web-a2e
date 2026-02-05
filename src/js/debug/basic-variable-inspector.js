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

    const vartab = this._readWord(0x69);
    const arytab = this._readWord(0x6b);

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

    const arytab = this._readWord(0x6b);
    const strend = this._readWord(0x6d);

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
    const byte1 = this._peek(addr);
    const byte2 = this._peek(addr + 1);

    if (byte1 === 0) return null;

    const { name, type } = this._parseVariableName(byte1, byte2);
    let value;
    let rawValue;
    let size;

    if (type === "integer") {
      // Integer: 2 bytes (high, low)
      const high = this._peek(addr + 2);
      const low = this._peek(addr + 3);
      value = (high << 8) | low;
      // Convert to signed
      if (value >= 0x8000) value -= 0x10000;
      rawValue = new Uint8Array([high, low]);
      size = 7; // 2 name + 5 value (padded to match real size)
    } else if (type === "string") {
      // String: length + 2-byte pointer
      const len = this._peek(addr + 2);
      const ptrLow = this._peek(addr + 3);
      const ptrHigh = this._peek(addr + 4);
      const ptr = (ptrHigh << 8) | ptrLow;
      value = this._readString(ptr, len);
      rawValue = new Uint8Array([len, ptrLow, ptrHigh]);
      size = 7; // 2 name + 3 value + 2 padding
    } else {
      // Real: 5-byte Applesoft float
      const floatBytes = new Uint8Array(5);
      for (let i = 0; i < 5; i++) {
        floatBytes[i] = this._peek(addr + 2 + i);
      }
      value = this._decodeApplesoftFloat(floatBytes);
      rawValue = floatBytes;
      size = 7; // 2 name + 5 value
    }

    return { name, type, value, rawValue, size };
  }

  /**
   * Parse an array variable header
   */
  _parseArray(addr) {
    const byte1 = this._peek(addr);
    const byte2 = this._peek(addr + 1);

    if (byte1 === 0) return null;

    const { name, type } = this._parseVariableName(byte1, byte2);

    // Total size of array entry (including header) - stored little-endian
    const sizeLow = this._peek(addr + 2);
    const sizeHigh = this._peek(addr + 3);
    const totalSize = (sizeHigh << 8) | sizeLow;

    // Number of dimensions
    const numDims = this._peek(addr + 4);

    // Read dimension sizes (2 bytes each, stored high-low)
    const dimensions = [];
    let dimAddr = addr + 5;
    for (let i = 0; i < numDims; i++) {
      const dimHigh = this._peek(dimAddr);
      const dimLow = this._peek(dimAddr + 1);
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
        const high = this._peek(valueAddr);
        const low = this._peek(valueAddr + 1);
        elemValue = (high << 8) | low;
        if (elemValue >= 0x8000) elemValue -= 0x10000;
      } else if (type === "string") {
        const len = this._peek(valueAddr);
        const ptrLow = this._peek(valueAddr + 1);
        const ptrHigh = this._peek(valueAddr + 2);
        const ptr = (ptrHigh << 8) | ptrLow;
        elemValue = this._readString(ptr, len);
      } else {
        const floatBytes = new Uint8Array(5);
        for (let j = 0; j < 5; j++) {
          floatBytes[j] = this._peek(valueAddr + j);
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
      const char = this._peek(ptr + i) & 0x7f;
      str += String.fromCharCode(char);
    }
    return str;
  }

  /**
   * Read a 16-bit word from memory (low byte first)
   */
  _readWord(addr) {
    const low = this._peek(addr);
    const high = this._peek(addr + 1);
    return (high << 8) | low;
  }

  /**
   * Read a byte from memory (non-side-effecting)
   */
  _peek(addr) {
    try {
      return this.wasmModule._peekMemory(addr);
    } catch (e) {
      return 0;
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
