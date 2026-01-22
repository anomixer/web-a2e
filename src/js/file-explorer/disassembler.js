/**
 * 6502 Disassembler
 * Disassembles binary data into 6502 assembly language
 */

// 6502 Addressing modes
const MODE = {
  IMP: 0,   // Implied - no operand
  ACC: 1,   // Accumulator - A
  IMM: 2,   // Immediate - #$nn
  ZP: 3,    // Zero Page - $nn
  ZPX: 4,   // Zero Page,X - $nn,X
  ZPY: 5,   // Zero Page,Y - $nn,Y
  ABS: 6,   // Absolute - $nnnn
  ABX: 7,   // Absolute,X - $nnnn,X
  ABY: 8,   // Absolute,Y - $nnnn,Y
  IND: 9,   // Indirect - ($nnnn)
  IZX: 10,  // Indexed Indirect - ($nn,X)
  IZY: 11,  // Indirect Indexed - ($nn),Y
  REL: 12,  // Relative - $nnnn (branch target)
};

// Instruction size by addressing mode
const MODE_SIZE = {
  [MODE.IMP]: 1,
  [MODE.ACC]: 1,
  [MODE.IMM]: 2,
  [MODE.ZP]: 2,
  [MODE.ZPX]: 2,
  [MODE.ZPY]: 2,
  [MODE.ABS]: 3,
  [MODE.ABX]: 3,
  [MODE.ABY]: 3,
  [MODE.IND]: 3,
  [MODE.IZX]: 2,
  [MODE.IZY]: 2,
  [MODE.REL]: 2,
};

// 6502 Opcode table: [mnemonic, addressing mode]
const OPCODES = {
  0x00: ['BRK', MODE.IMP], 0x01: ['ORA', MODE.IZX], 0x05: ['ORA', MODE.ZP],
  0x06: ['ASL', MODE.ZP], 0x08: ['PHP', MODE.IMP], 0x09: ['ORA', MODE.IMM],
  0x0A: ['ASL', MODE.ACC], 0x0D: ['ORA', MODE.ABS], 0x0E: ['ASL', MODE.ABS],
  0x10: ['BPL', MODE.REL], 0x11: ['ORA', MODE.IZY], 0x15: ['ORA', MODE.ZPX],
  0x16: ['ASL', MODE.ZPX], 0x18: ['CLC', MODE.IMP], 0x19: ['ORA', MODE.ABY],
  0x1D: ['ORA', MODE.ABX], 0x1E: ['ASL', MODE.ABX],
  0x20: ['JSR', MODE.ABS], 0x21: ['AND', MODE.IZX], 0x24: ['BIT', MODE.ZP],
  0x25: ['AND', MODE.ZP], 0x26: ['ROL', MODE.ZP], 0x28: ['PLP', MODE.IMP],
  0x29: ['AND', MODE.IMM], 0x2A: ['ROL', MODE.ACC], 0x2C: ['BIT', MODE.ABS],
  0x2D: ['AND', MODE.ABS], 0x2E: ['ROL', MODE.ABS],
  0x30: ['BMI', MODE.REL], 0x31: ['AND', MODE.IZY], 0x35: ['AND', MODE.ZPX],
  0x36: ['ROL', MODE.ZPX], 0x38: ['SEC', MODE.IMP], 0x39: ['AND', MODE.ABY],
  0x3D: ['AND', MODE.ABX], 0x3E: ['ROL', MODE.ABX],
  0x40: ['RTI', MODE.IMP], 0x41: ['EOR', MODE.IZX], 0x45: ['EOR', MODE.ZP],
  0x46: ['LSR', MODE.ZP], 0x48: ['PHA', MODE.IMP], 0x49: ['EOR', MODE.IMM],
  0x4A: ['LSR', MODE.ACC], 0x4C: ['JMP', MODE.ABS], 0x4D: ['EOR', MODE.ABS],
  0x4E: ['LSR', MODE.ABS],
  0x50: ['BVC', MODE.REL], 0x51: ['EOR', MODE.IZY], 0x55: ['EOR', MODE.ZPX],
  0x56: ['LSR', MODE.ZPX], 0x58: ['CLI', MODE.IMP], 0x59: ['EOR', MODE.ABY],
  0x5D: ['EOR', MODE.ABX], 0x5E: ['LSR', MODE.ABX],
  0x60: ['RTS', MODE.IMP], 0x61: ['ADC', MODE.IZX], 0x65: ['ADC', MODE.ZP],
  0x66: ['ROR', MODE.ZP], 0x68: ['PLA', MODE.IMP], 0x69: ['ADC', MODE.IMM],
  0x6A: ['ROR', MODE.ACC], 0x6C: ['JMP', MODE.IND], 0x6D: ['ADC', MODE.ABS],
  0x6E: ['ROR', MODE.ABS],
  0x70: ['BVS', MODE.REL], 0x71: ['ADC', MODE.IZY], 0x75: ['ADC', MODE.ZPX],
  0x76: ['ROR', MODE.ZPX], 0x78: ['SEI', MODE.IMP], 0x79: ['ADC', MODE.ABY],
  0x7D: ['ADC', MODE.ABX], 0x7E: ['ROR', MODE.ABX],
  0x81: ['STA', MODE.IZX], 0x84: ['STY', MODE.ZP], 0x85: ['STA', MODE.ZP],
  0x86: ['STX', MODE.ZP], 0x88: ['DEY', MODE.IMP], 0x8A: ['TXA', MODE.IMP],
  0x8C: ['STY', MODE.ABS], 0x8D: ['STA', MODE.ABS], 0x8E: ['STX', MODE.ABS],
  0x90: ['BCC', MODE.REL], 0x91: ['STA', MODE.IZY], 0x94: ['STY', MODE.ZPX],
  0x95: ['STA', MODE.ZPX], 0x96: ['STX', MODE.ZPY], 0x98: ['TYA', MODE.IMP],
  0x99: ['STA', MODE.ABY], 0x9A: ['TXS', MODE.IMP], 0x9D: ['STA', MODE.ABX],
  0xA0: ['LDY', MODE.IMM], 0xA1: ['LDA', MODE.IZX], 0xA2: ['LDX', MODE.IMM],
  0xA4: ['LDY', MODE.ZP], 0xA5: ['LDA', MODE.ZP], 0xA6: ['LDX', MODE.ZP],
  0xA8: ['TAY', MODE.IMP], 0xA9: ['LDA', MODE.IMM], 0xAA: ['TAX', MODE.IMP],
  0xAC: ['LDY', MODE.ABS], 0xAD: ['LDA', MODE.ABS], 0xAE: ['LDX', MODE.ABS],
  0xB0: ['BCS', MODE.REL], 0xB1: ['LDA', MODE.IZY], 0xB4: ['LDY', MODE.ZPX],
  0xB5: ['LDA', MODE.ZPX], 0xB6: ['LDX', MODE.ZPY], 0xB8: ['CLV', MODE.IMP],
  0xB9: ['LDA', MODE.ABY], 0xBA: ['TSX', MODE.IMP], 0xBC: ['LDY', MODE.ABX],
  0xBD: ['LDA', MODE.ABX], 0xBE: ['LDX', MODE.ABY],
  0xC0: ['CPY', MODE.IMM], 0xC1: ['CMP', MODE.IZX], 0xC4: ['CPY', MODE.ZP],
  0xC5: ['CMP', MODE.ZP], 0xC6: ['DEC', MODE.ZP], 0xC8: ['INY', MODE.IMP],
  0xC9: ['CMP', MODE.IMM], 0xCA: ['DEX', MODE.IMP], 0xCC: ['CPY', MODE.ABS],
  0xCD: ['CMP', MODE.ABS], 0xCE: ['DEC', MODE.ABS],
  0xD0: ['BNE', MODE.REL], 0xD1: ['CMP', MODE.IZY], 0xD5: ['CMP', MODE.ZPX],
  0xD6: ['DEC', MODE.ZPX], 0xD8: ['CLD', MODE.IMP], 0xD9: ['CMP', MODE.ABY],
  0xDD: ['CMP', MODE.ABX], 0xDE: ['DEC', MODE.ABX],
  0xE0: ['CPX', MODE.IMM], 0xE1: ['SBC', MODE.IZX], 0xE4: ['CPX', MODE.ZP],
  0xE5: ['SBC', MODE.ZP], 0xE6: ['INC', MODE.ZP], 0xE8: ['INX', MODE.IMP],
  0xE9: ['SBC', MODE.IMM], 0xEA: ['NOP', MODE.IMP], 0xEC: ['CPX', MODE.ABS],
  0xED: ['SBC', MODE.ABS], 0xEE: ['INC', MODE.ABS],
  0xF0: ['BEQ', MODE.REL], 0xF1: ['SBC', MODE.IZY], 0xF5: ['SBC', MODE.ZPX],
  0xF6: ['INC', MODE.ZPX], 0xF8: ['SED', MODE.IMP], 0xF9: ['SBC', MODE.ABY],
  0xFD: ['SBC', MODE.ABX], 0xFE: ['INC', MODE.ABX],
};

// Common Apple II ROM/hardware addresses for annotation
const KNOWN_ADDRESSES = {
  0x0000: 'LOC0',
  0x0001: 'LOC1',
  0x0020: 'WNDLFT',
  0x0021: 'WNDWDTH',
  0x0022: 'WNDTOP',
  0x0023: 'WNDBTM',
  0x0024: 'CH',
  0x0025: 'CV',
  0x0026: 'GPTS',
  0x0028: 'BASL',
  0x0029: 'BASH',
  0x002B: 'BOOTSLOT',
  0x0036: 'CSWL',
  0x0037: 'CSWH',
  0x0038: 'KSWL',
  0x0039: 'KSWH',
  0x0067: 'TXTTAB',
  0x0069: 'VARTAB',
  0x006B: 'ARYTAB',
  0x006D: 'STREND',
  0x0073: 'HIMEM',
  0x00AF: 'CURLIN',
  0xC000: 'KBD',
  0xC010: 'KBDSTRB',
  0xC020: 'TAPEOUT',
  0xC030: 'SPKR',
  0xC050: 'TXTCLR',
  0xC051: 'TXTSET',
  0xC052: 'MIXCLR',
  0xC053: 'MIXSET',
  0xC054: 'LOWSCR',
  0xC055: 'HISCR',
  0xC056: 'LORES',
  0xC057: 'HIRES',
  0xC080: 'LC_BANK2_READ',
  0xC081: 'LC_BANK2_WRITE',
  0xF800: 'PLOT',
  0xF819: 'HLINE',
  0xF828: 'VLINE',
  0xF832: 'CLRSCR',
  0xF836: 'CLRTOP',
  0xF847: 'GBASCALC',
  0xF85F: 'NXTCOL',
  0xF864: 'SETCOL',
  0xF871: 'SCRN',
  0xFB1E: 'PREAD',
  0xFB39: 'INIT',
  0xFB40: 'SETGR',
  0xFB4B: 'SETTEXT',
  0xFBDD: 'BELL1',
  0xFC10: 'WAIT',
  0xFC22: 'MON_VTAB',
  0xFC42: 'MON_CLREOP',
  0xFC58: 'HOME',
  0xFC62: 'MON_CLREOL',
  0xFC9C: 'CLRLN',
  0xFCA8: 'WAIT2',
  0xFD0C: 'RDKEY',
  0xFD1B: 'KEYIN',
  0xFD35: 'RDCHAR',
  0xFD6A: 'GETLNZ',
  0xFD6F: 'GETLN',
  0xFD8E: 'CROUT',
  0xFDDA: 'PRBYTE',
  0xFDE3: 'PRHEX',
  0xFDED: 'COUT',
  0xFDF0: 'COUT1',
  0xFE2C: 'MOVE',
  0xFE80: 'SETINV',
  0xFE84: 'SETNORM',
  0xFECD: 'WRITE',
  0xFEFD: 'READ',
  0xFF2D: 'PRERR',
  0xFF3A: 'BELL',
  0xFF59: 'MON_IOSAVE',
  0xFF65: 'MON',
  0xFF69: 'MONZ',
};

/**
 * Format a byte as 2-digit hex
 */
function hexByte(b) {
  return b.toString(16).toUpperCase().padStart(2, '0');
}

/**
 * Format a word as 4-digit hex
 */
function hexWord(w) {
  return w.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Get annotation for an address if known
 */
function getAddressComment(addr) {
  return KNOWN_ADDRESSES[addr] || null;
}

/**
 * Format operand based on addressing mode
 */
function formatOperand(mode, data, offset, pc) {
  switch (mode) {
    case MODE.IMP:
      return '';
    case MODE.ACC:
      return 'A';
    case MODE.IMM:
      return `#$${hexByte(data[offset + 1])}`;
    case MODE.ZP: {
      const addr = data[offset + 1];
      const comment = getAddressComment(addr);
      return comment ? `$${hexByte(addr)}` : `$${hexByte(addr)}`;
    }
    case MODE.ZPX:
      return `$${hexByte(data[offset + 1])},X`;
    case MODE.ZPY:
      return `$${hexByte(data[offset + 1])},Y`;
    case MODE.ABS: {
      const addr = data[offset + 1] | (data[offset + 2] << 8);
      return `$${hexWord(addr)}`;
    }
    case MODE.ABX: {
      const addr = data[offset + 1] | (data[offset + 2] << 8);
      return `$${hexWord(addr)},X`;
    }
    case MODE.ABY: {
      const addr = data[offset + 1] | (data[offset + 2] << 8);
      return `$${hexWord(addr)},Y`;
    }
    case MODE.IND: {
      const addr = data[offset + 1] | (data[offset + 2] << 8);
      return `($${hexWord(addr)})`;
    }
    case MODE.IZX:
      return `($${hexByte(data[offset + 1])},X)`;
    case MODE.IZY:
      return `($${hexByte(data[offset + 1])}),Y`;
    case MODE.REL: {
      // Relative addressing - calculate target
      const rel = data[offset + 1];
      const signedRel = rel > 127 ? rel - 256 : rel;
      const target = (pc + 2 + signedRel) & 0xFFFF;
      return `$${hexWord(target)}`;
    }
    default:
      return '???';
  }
}

/**
 * Disassemble a single instruction
 * @param {Uint8Array} data - Binary data
 * @param {number} offset - Offset into data
 * @param {number} baseAddr - Base address for display
 * @returns {Object} {line, size} - Disassembled line and instruction size
 */
function disassembleInstruction(data, offset, baseAddr) {
  if (offset >= data.length) {
    return null;
  }

  const opcode = data[offset];
  const pc = baseAddr + offset;
  const instruction = OPCODES[opcode];

  if (!instruction) {
    // Unknown opcode - show as data byte
    return {
      line: `${hexWord(pc)}:  ${hexByte(opcode)}        .BYTE $${hexByte(opcode)}`,
      size: 1,
    };
  }

  const [mnemonic, mode] = instruction;
  const size = MODE_SIZE[mode];

  // Check if we have enough bytes
  if (offset + size > data.length) {
    return {
      line: `${hexWord(pc)}:  ${hexByte(opcode)}        .BYTE $${hexByte(opcode)}`,
      size: 1,
    };
  }

  // Format the hex bytes
  let hexBytes = hexByte(opcode);
  for (let i = 1; i < size; i++) {
    hexBytes += ' ' + hexByte(data[offset + i]);
  }
  hexBytes = hexBytes.padEnd(8);

  // Format the instruction
  const operand = formatOperand(mode, data, offset, pc);
  let line = `${hexWord(pc)}:  ${hexBytes}  ${mnemonic}`;
  if (operand) {
    line += ` ${operand}`;
  }

  // Add comment for known addresses
  if (mode === MODE.ABS || mode === MODE.ABX || mode === MODE.ABY) {
    const addr = data[offset + 1] | (data[offset + 2] << 8);
    const comment = getAddressComment(addr);
    if (comment) {
      line = line.padEnd(28) + `; ${comment}`;
    }
  } else if (mode === MODE.ZP || mode === MODE.ZPX || mode === MODE.ZPY) {
    const addr = data[offset + 1];
    const comment = getAddressComment(addr);
    if (comment) {
      line = line.padEnd(28) + `; ${comment}`;
    }
  }

  return { line, size };
}

/**
 * Yield to the event loop to keep UI responsive
 */
function yieldToMain() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Disassemble binary data asynchronously
 * Yields periodically to keep the browser responsive
 * @param {Uint8Array} data - Binary data (including 4-byte header)
 * @param {number} maxLines - Maximum lines to disassemble (0 = all)
 * @returns {Promise<string>} Disassembled code
 */
export async function disassemble(data, maxLines = 0) {
  if (data.length < 4) {
    return '; File too small';
  }

  // Parse binary file header
  const loadAddr = data[0] | (data[1] << 8);
  const length = data[2] | (data[3] << 8);

  const lines = [];
  lines.push(`; Load address: $${hexWord(loadAddr)}`);
  lines.push(`; Length: ${length} bytes ($${hexWord(length)})`);
  lines.push(`;`);
  lines.push(`        .ORG $${hexWord(loadAddr)}`);
  lines.push('');

  // Disassemble the code (skip 4-byte header)
  const codeData = data.slice(4);
  let offset = 0;
  let lineCount = 0;
  const maxOffset = Math.min(codeData.length, length);
  const YIELD_INTERVAL = 500; // Yield every 500 instructions

  while (offset < maxOffset) {
    const result = disassembleInstruction(codeData, offset, loadAddr);
    if (!result) break;

    lines.push(result.line);
    offset += result.size;
    lineCount++;

    // Yield to event loop periodically to keep UI responsive
    if (lineCount % YIELD_INTERVAL === 0) {
      await yieldToMain();
    }

    if (maxLines > 0 && lineCount >= maxLines) {
      lines.push('');
      lines.push(`; ... (${maxOffset - offset} more bytes)`);
      break;
    }
  }

  return lines.join('\n');
}
