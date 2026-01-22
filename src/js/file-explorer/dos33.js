/**
 * DOS 3.3 Filesystem Parser
 * Parses DOS 3.3 disk images to read catalog and file contents
 */

// DOS 3.3 Constants
const TRACKS = 35;
const SECTORS_PER_TRACK = 16;
const BYTES_PER_SECTOR = 256;
const DISK_SIZE = TRACKS * SECTORS_PER_TRACK * BYTES_PER_SECTOR; // 143,360 bytes

// VTOC Location
const VTOC_TRACK = 17;
const VTOC_SECTOR = 0;

// Catalog structure
const CATALOG_ENTRY_SIZE = 35;
const ENTRIES_PER_SECTOR = 7;

// File types
const FILE_TYPES = {
  0x00: { name: 'T', description: 'Text' },
  0x01: { name: 'I', description: 'Integer BASIC' },
  0x02: { name: 'A', description: 'Applesoft BASIC' },
  0x04: { name: 'B', description: 'Binary' },
  0x08: { name: 'S', description: 'Type S' },
  0x10: { name: 'R', description: 'Relocatable' },
  0x20: { name: 'a', description: 'Type a' },
  0x40: { name: 'b', description: 'Type b' },
};

/**
 * Calculate sector offset in disk image
 * @param {number} track - Track number (0-34)
 * @param {number} sector - Sector number (0-15)
 * @returns {number} Byte offset in disk image
 */
function getSectorOffset(track, sector) {
  return (track * SECTORS_PER_TRACK + sector) * BYTES_PER_SECTOR;
}

/**
 * Read a sector from disk data
 * @param {Uint8Array} diskData - Raw disk image data
 * @param {number} track - Track number
 * @param {number} sector - Sector number
 * @returns {Uint8Array} 256-byte sector data
 */
function readSector(diskData, track, sector) {
  const offset = getSectorOffset(track, sector);
  return diskData.slice(offset, offset + BYTES_PER_SECTOR);
}

/**
 * Parse the VTOC (Volume Table of Contents)
 * @param {Uint8Array} diskData - Raw disk image data
 * @returns {Object|null} VTOC data or null if invalid
 */
export function parseVTOC(diskData) {
  if (diskData.length < DISK_SIZE) {
    return null;
  }

  const vtoc = readSector(diskData, VTOC_TRACK, VTOC_SECTOR);

  // Validate DOS 3.3 signature
  const catalogTrack = vtoc[0x01];
  const catalogSector = vtoc[0x02];
  const dosVersion = vtoc[0x03];

  // Basic validation
  if (catalogTrack !== 0x11 || dosVersion !== 0x03) {
    return null; // Not a DOS 3.3 disk
  }

  return {
    catalogTrack,
    catalogSector,
    dosVersion,
    volumeNumber: vtoc[0x06],
    maxTrackSectorPairs: vtoc[0x27],
    lastTrackAllocated: vtoc[0x30],
    tracksPerDisk: vtoc[0x34] || 35,
    sectorsPerTrack: vtoc[0x35] || 16,
    bytesPerSector: (vtoc[0x37] << 8) | vtoc[0x36] || 256,
  };
}

/**
 * Convert high-bit ASCII filename to normal string
 * @param {Uint8Array} bytes - Filename bytes (high-bit set)
 * @returns {string} Clean filename
 */
function parseFilename(bytes) {
  let name = '';
  for (let i = 0; i < bytes.length; i++) {
    const ch = bytes[i] & 0x7F; // Strip high bit
    if (ch === 0x00 || ch === 0x20 && name.length === 0) continue;
    name += String.fromCharCode(ch);
  }
  return name.trimEnd();
}

/**
 * Parse a catalog entry
 * @param {Uint8Array} entry - 35-byte catalog entry
 * @returns {Object|null} Parsed entry or null if empty/deleted
 */
function parseCatalogEntry(entry) {
  const firstTrack = entry[0x00];
  const firstSector = entry[0x01];

  // Check for deleted or empty entry
  if (firstTrack === 0xFF || firstTrack === 0x00) {
    return null;
  }

  const typeAndFlags = entry[0x02];
  const fileType = typeAndFlags & 0x7F;
  const isLocked = (typeAndFlags & 0x80) !== 0;

  const filenameBytes = entry.slice(0x03, 0x03 + 30);
  const filename = parseFilename(filenameBytes);

  const sectorCount = entry[0x21] | (entry[0x22] << 8);

  return {
    firstTrack,
    firstSector,
    fileType,
    fileTypeName: FILE_TYPES[fileType]?.name || '?',
    fileTypeDescription: FILE_TYPES[fileType]?.description || 'Unknown',
    isLocked,
    filename,
    sectorCount,
  };
}

/**
 * Read the disk catalog
 * @param {Uint8Array} diskData - Raw disk image data
 * @returns {Array} Array of catalog entries
 */
export function readCatalog(diskData) {
  const vtoc = parseVTOC(diskData);
  if (!vtoc) {
    return [];
  }

  const entries = [];
  let track = vtoc.catalogTrack;
  let sector = vtoc.catalogSector;
  const visited = new Set();

  // Follow catalog sector chain
  while (track !== 0 && sector !== 0) {
    const key = `${track},${sector}`;
    if (visited.has(key)) break; // Prevent infinite loops
    visited.add(key);

    const catalogSector = readSector(diskData, track, sector);

    // Parse entries in this sector (skip first 11 bytes - header)
    for (let i = 0; i < ENTRIES_PER_SECTOR; i++) {
      const entryOffset = 0x0B + (i * CATALOG_ENTRY_SIZE);
      const entryData = catalogSector.slice(entryOffset, entryOffset + CATALOG_ENTRY_SIZE);
      const entry = parseCatalogEntry(entryData);
      if (entry) {
        entries.push(entry);
      }
    }

    // Get next catalog sector
    track = catalogSector[0x01];
    sector = catalogSector[0x02];
  }

  return entries;
}

/**
 * Read a file's track/sector list
 * @param {Uint8Array} diskData - Raw disk image data
 * @param {number} track - First T/S list track
 * @param {number} sector - First T/S list sector
 * @returns {Array} Array of {track, sector} pairs
 */
function readTrackSectorList(diskData, track, sector) {
  const pairs = [];
  const visited = new Set();

  while (track !== 0) {
    const key = `${track},${sector}`;
    if (visited.has(key)) break;
    visited.add(key);

    const tsList = readSector(diskData, track, sector);

    // Read sector pairs from this T/S list (starting at offset 0x0C)
    for (let i = 0x0C; i < 0x100; i += 2) {
      const t = tsList[i];
      const s = tsList[i + 1];
      if (t === 0 && s === 0) break;
      pairs.push({ track: t, sector: s });
    }

    // Get next T/S list sector
    track = tsList[0x01];
    sector = tsList[0x02];
  }

  return pairs;
}

/**
 * Read file contents
 * @param {Uint8Array} diskData - Raw disk image data
 * @param {Object} catalogEntry - Catalog entry for the file
 * @returns {Uint8Array} File contents
 */
export function readFile(diskData, catalogEntry) {
  const sectors = readTrackSectorList(
    diskData,
    catalogEntry.firstTrack,
    catalogEntry.firstSector
  );

  // Concatenate all data sectors
  const chunks = [];
  for (const { track, sector } of sectors) {
    const sectorData = readSector(diskData, track, sector);
    chunks.push(sectorData);
  }

  // Combine into single array
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Get file size information for Binary files
 * Binary files have a 4-byte header: 2 bytes address, 2 bytes length
 * @param {Uint8Array} fileData - Raw file data
 * @returns {Object} {address, length} or null
 */
export function getBinaryFileInfo(fileData) {
  if (fileData.length < 4) return null;

  const address = fileData[0] | (fileData[1] << 8);
  const length = fileData[2] | (fileData[3] << 8);

  return { address, length };
}

/**
 * Check if disk is DOS 3.3 format
 * @param {Uint8Array} diskData - Raw disk image data
 * @returns {boolean} True if DOS 3.3 format
 */
export function isDOS33(diskData) {
  return parseVTOC(diskData) !== null;
}

export { FILE_TYPES, BYTES_PER_SECTOR };
