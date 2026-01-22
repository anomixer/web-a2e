// Shared utilities for file explorer modules

/**
 * Parse Apple II filename from bytes (strips high bit ASCII)
 * @param {Uint8Array} bytes - Filename bytes (may have high-bit set)
 * @param {Object} options - Parsing options
 * @param {boolean} [options.trimSpaces=true] - Whether to trim trailing spaces
 * @param {boolean} [options.skipLeadingSpaces=false] - Whether to skip leading spaces
 * @param {boolean} [options.stopAtNull=true] - Whether to stop at null byte
 * @returns {string} Clean filename
 */
export function parseFilename(bytes, options = {}) {
  const {
    trimSpaces = true,
    skipLeadingSpaces = false,
    stopAtNull = true,
  } = options;

  let name = '';
  for (let i = 0; i < bytes.length; i++) {
    const ch = bytes[i] & 0x7F; // Strip high bit

    // Stop at null if enabled
    if (stopAtNull && ch === 0) break;

    // Skip null bytes (always)
    if (ch === 0x00) continue;

    // Skip leading spaces if enabled
    if (skipLeadingSpaces && ch === 0x20 && name.length === 0) continue;

    name += String.fromCharCode(ch);
  }

  return trimSpaces ? name.trimEnd() : name;
}

/**
 * Parse DOS 3.3 filename (high-bit ASCII, trim spaces, skip leading spaces)
 * @param {Uint8Array} bytes - Filename bytes
 * @returns {string} Clean filename
 */
export function parseDOS33Filename(bytes) {
  return parseFilename(bytes, {
    trimSpaces: true,
    skipLeadingSpaces: true,
    stopAtNull: false,
  });
}

/**
 * Parse ProDOS filename (high-bit ASCII, stop at null)
 * @param {Uint8Array} bytes - Filename bytes
 * @returns {string} Clean filename
 */
export function parseProDOSFilename(bytes) {
  return parseFilename(bytes, {
    trimSpaces: false,
    skipLeadingSpaces: false,
    stopAtNull: true,
  });
}
