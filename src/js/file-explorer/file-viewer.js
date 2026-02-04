/*
 * file-viewer.js - File content viewer for disk images
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/**
 * File Viewer - Formats and displays file contents
 * Supports different Apple II file types
 */

import { disassemble } from "./disassembler.js";
import { escapeHtml } from "../utils/string-utils.js";
import { highlightBasicSource } from "../utils/basic-highlighting.js";
import { highlightMerlinSource, isMerlinSource } from "../utils/merlin-highlighting.js";

let wasmModule = null;

/**
 * Set the WASM module for BASIC detokenization
 * @param {Object} wasm - The WASM module instance
 */
export function setFileViewerWasm(wasm) {
  wasmModule = wasm;
}

/**
 * Detokenize BASIC program using WASM and apply JS syntax highlighting.
 * Returns { html, lineNumToIndex, lineCount }
 */
function detokenizeBasicViaWasm(data, hasLengthHeader, isApplesoft) {
  if (!wasmModule) {
    return { html: '(WASM module not loaded)', lineNumToIndex: new Map(), lineCount: 0 };
  }

  const wasm = wasmModule;

  // Copy data to WASM heap
  const dataPtr = wasm._malloc(data.length);
  wasm.HEAPU8.set(data, dataPtr);

  // Call WASM detokenizer
  const resultPtr = isApplesoft
    ? wasm._detokenizeApplesoft(dataPtr, data.length, hasLengthHeader)
    : wasm._detokenizeIntegerBasic(dataPtr, data.length, hasLengthHeader);

  wasm._free(dataPtr);

  // Read plain text result
  const plainText = resultPtr ? wasm.UTF8ToString(resultPtr) : '';
  if (!plainText) {
    return { html: '', lineNumToIndex: new Map(), lineCount: 0 };
  }

  // Build lineNumToIndex from the plain text (line numbers are at start of each line)
  const lineNumToIndex = new Map();
  const textLines = plainText.split('\n');
  for (let i = 0; i < textLines.length; i++) {
    const match = textLines[i].match(/^\s*(\d+)/);
    if (match) {
      lineNumToIndex.set(parseInt(match[1], 10), i);
    }
  }

  // Apply HTML syntax highlighting
  const highlighted = highlightBasicSource(plainText, { preserveCase: false });

  // Post-process: add bas-lineref data attributes for GOTO/GOSUB/THEN targets
  // The highlighter wraps numbers in <span class="bas-number"> spans.
  // We look for numbers that follow GOTO/GOSUB/THEN keywords and add lineref attributes.
  const html = highlighted.replace(
    /(<span class="bas-(?:flow|misc)">(?:GOTO|GOSUB|THEN)<\/span>\s*)<span class="bas-number">(\d+)<\/span>/g,
    (match, prefix, num) => {
      const lineNum = parseInt(num, 10);
      if (lineNumToIndex.has(lineNum)) {
        return `${prefix}<span class="bas-number bas-lineref" data-target-line="${lineNum}">${num}</span>`;
      }
      return match;
    }
  );

  return {
    html,
    lineNumToIndex,
    lineCount: textLines.length,
  };
}

function detokenizeApplesoft(data, hasLengthHeader = true) {
  return detokenizeBasicViaWasm(data, hasLengthHeader, true);
}

function detokenizeIntegerBasic(data, hasLengthHeader = true) {
  return detokenizeBasicViaWasm(data, hasLengthHeader, false);
}

/**
 * Format binary data as hex dump with ASCII (returns HTML)
 * @param {Uint8Array} data - Binary data
 * @param {number} baseAddress - Starting address for display
 * @param {number} maxBytes - Maximum bytes to show (0 = all)
 * @returns {string} Formatted hex dump as HTML
 */
export function formatHexDump(data, baseAddress = 0, maxBytes = 0, bytesPerRow = 16) {
  const lines = [];
  const bytesToShow =
    maxBytes > 0 ? Math.min(data.length, maxBytes) : data.length;
  const groupSize = 8;

  for (let i = 0; i < bytesToShow; i += bytesPerRow) {
    const addr = (baseAddress + i).toString(16).toUpperCase().padStart(4, "0");

    let hexBytes = "";
    let ascii = "";

    for (let j = 0; j < bytesPerRow; j++) {
      // Add group gap every 8 bytes (not at start)
      if (j > 0 && j % groupSize === 0) {
        hexBytes += `<span class="hex-group-gap"></span>`;
      }

      if (i + j < bytesToShow) {
        const byte = data[i + j];
        const hexStr = byte.toString(16).toUpperCase().padStart(2, "0");

        // Style based on byte value
        let byteClass = "hex-byte";
        if (byte === 0x00) {
          byteClass += " hex-zero";
        } else if (byte >= 0x20 && byte < 0x7f) {
          byteClass += " hex-printable";
        } else if (byte >= 0x80) {
          byteClass += " hex-highbit";
        }

        hexBytes += `<span class="${byteClass}">${hexStr}</span> `;

        // ASCII representation (printable chars only)
        const ch = byte & 0x7f;
        if (ch >= 0x20 && ch < 0x7f) {
          const escaped = ch === 0x26 ? "&amp;" : ch === 0x3c ? "&lt;" : ch === 0x3e ? "&gt;" : String.fromCharCode(ch);
          ascii += `<span class="hex-ascii-printable">${escaped}</span>`;
        } else {
          ascii += `<span class="hex-ascii-dot">.</span>`;
        }
      } else {
        hexBytes += "   ";
        ascii += " ";
      }
    }

    lines.push(
      `<span class="hex-line">` +
      `<span class="hex-addr">${addr}</span>` +
      `<span class="hex-separator">:</span> ` +
      `<span class="hex-bytes">${hexBytes}</span>` +
      `<span class="hex-ascii-separator">│</span>` +
      `<span class="hex-ascii">${ascii}</span>` +
      `<span class="hex-ascii-separator">│</span>` +
      `</span>`
    );
  }

  if (maxBytes > 0 && data.length > maxBytes) {
    lines.push(`<span class="hex-truncated">... (${data.length - maxBytes} more bytes)</span>`);
  }

  return lines.join("\n");
}

/**
 * Format text file (strip high bits, convert to readable text)
 * @param {Uint8Array} data - Raw file data
 * @returns {string} Formatted text
 */
export function formatTextFile(data) {
  let text = "";

  for (let i = 0; i < data.length; i++) {
    const byte = data[i] & 0x7f; // Strip high bit

    if (byte === 0x0d) {
      // Carriage return -> newline
      text += "\n";
    } else if (byte === 0x00) {
      // Null - end of text or padding
      continue;
    } else if (byte >= 0x20 && byte < 0x7f) {
      // Printable ASCII
      text += String.fromCharCode(byte);
    } else if (byte === 0x09) {
      // Tab
      text += "\t";
    }
  }

  return text;
}

/**
 * Format file contents based on type
 * @param {Uint8Array} data - Raw file data
 * @param {number} fileType - DOS 3.3 file type code
 * @param {Object} options - Optional settings
 * @param {boolean} options.hasLengthHeader - Whether BASIC files have 2-byte length header (DOS 3.3 = true, ProDOS = false)
 * @returns {Object} {content, format} where format is 'text' or 'hex'
 */
export function formatFileContents(data, fileType, options = {}) {
  const { hasLengthHeader = true } = options;

  switch (fileType) {
    case 0x00: // Text
      return {
        content: formatTextFile(data),
        format: "text",
        description: "Text File",
      };

    case 0x02: {
      // Applesoft BASIC
      try {
        const result = detokenizeApplesoft(data, hasLengthHeader);
        return {
          content: result.html,
          format: "basic",
          description: "Applesoft BASIC",
          isHtml: true,
          lineNumToIndex: result.lineNumToIndex,
          lineCount: result.lineCount,
        };
      } catch (e) {
        // Fall back to hex if detokenization fails
        return {
          content: formatHexDump(data),
          format: "hex",
          description: "Applesoft BASIC (raw)",
          isHtml: true,
        };
      }
    }

    case 0x01: {
      // Integer BASIC
      try {
        const result = detokenizeIntegerBasic(data, hasLengthHeader);
        return {
          content: result.html,
          format: "basic",
          description: "Integer BASIC",
          isHtml: true,
          lineNumToIndex: result.lineNumToIndex,
          lineCount: result.lineCount,
        };
      } catch (e) {
        // Fall back to hex if detokenization fails
        return {
          content: formatHexDump(data),
          format: "hex",
          description: "Integer BASIC (raw)",
          isHtml: true,
        };
      }
    }

    case 0x04: {
      // Binary - DOS 3.3 header: 2 bytes address, 2 bytes length
      let description = "Binary File";

      if (data.length >= 4) {
        const address = data[0] | (data[1] << 8);
        const length = data[2] | (data[3] << 8);
        description = `Binary File - Load: $${address.toString(16).toUpperCase()}, Length: ${length} bytes`;
      }

      // Return a promise for async disassembly
      return {
        content: null, // Will be filled by async disassembly
        format: "text",
        description,
        // Async loader for disassembly
        loadAsync: async () => {
          try {
            return await disassemble(data);
          } catch (e) {
            // Fall back to hex dump if disassembly fails
            const displayData = data.length >= 4 ? data.slice(4) : data;
            const baseAddr = data.length >= 4 ? (data[0] | (data[1] << 8)) : 0;
            return formatHexDump(displayData, baseAddr);
          }
        },
      };
    }

    default:
      return {
        content: formatHexDump(data),
        format: "hex",
        description: "Unknown File Type",
        isHtml: true,
      };
  }
}

/**
 * Format file size for display
 * @param {number} sectors - Number of sectors
 * @returns {string} Formatted size string
 */
export function formatFileSize(sectors) {
  const bytes = sectors * 256;
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Decode raw Apple II bytes to plain text (strip high bits, CR -> newline)
 * @param {Uint8Array} data - Raw file data
 * @returns {string} Decoded text
 */
function decodeAppleIIText(data) {
  let text = '';
  for (let i = 0; i < data.length; i++) {
    const byte = data[i] & 0x7F;
    if (byte === 0x0D) {
      text += '\n';
    } else if (byte === 0x00) {
      continue;
    } else if (byte >= 0x20 && byte < 0x7F) {
      text += String.fromCharCode(byte);
    } else if (byte === 0x09) {
      text += '\t';
    }
  }
  return text;
}

/**
 * Check if raw file data looks like Merlin assembler source
 * @param {Uint8Array} data - Raw file data (high-bit encoded)
 * @returns {boolean}
 */
export function checkIsMerlinFile(data) {
  const text = decodeAppleIIText(data);
  return isMerlinSource(text);
}

/**
 * Format raw file data as highlighted Merlin assembler source
 * @param {Uint8Array} data - Raw file data (high-bit encoded)
 * @returns {Object} { content, format, isHtml }
 */
export function formatMerlinFile(data) {
  const text = decodeAppleIIText(data);
  const html = highlightMerlinSource(text);
  return { content: html, format: 'merlin', isHtml: true };
}
