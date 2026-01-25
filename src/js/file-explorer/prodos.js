/**
 * ProDOS Filesystem Parser
 * Parses ProDOS disk images to read catalog and file contents
 */

import { parseProDOSFilename } from './utils.js';

// ProDOS Constants
const BLOCK_SIZE = 512;
const VOLUME_DIRECTORY_BLOCK = 2;
const ENTRIES_PER_BLOCK = 13;
const ENTRY_SIZE = 39;

// Storage types
const STORAGE_TYPE_DELETED = 0x0;
const STORAGE_TYPE_SEEDLING = 0x1;  // Single block file (<=512 bytes)
const STORAGE_TYPE_SAPLING = 0x2;   // 2-256 blocks (index block + data)
const STORAGE_TYPE_TREE = 0x3;      // 257+ blocks (master index + indexes + data)
const STORAGE_TYPE_SUBDIR = 0xD;    // Subdirectory
const STORAGE_TYPE_SUBDIR_HEADER = 0xE;  // Subdirectory header
const STORAGE_TYPE_VOLUME_HEADER = 0xF;  // Volume directory header

// ProDOS file types
const FILE_TYPES = {
  0x00: { name: 'UNK', description: 'Unknown' },
  0x01: { name: 'BAD', description: 'Bad Block' },
  0x04: { name: 'TXT', description: 'Text' },
  0x06: { name: 'BIN', description: 'Binary' },
  0x0F: { name: 'DIR', description: 'Directory' },
  0x19: { name: 'ADB', description: 'AppleWorks DB' },
  0x1A: { name: 'AWP', description: 'AppleWorks WP' },
  0x1B: { name: 'ASP', description: 'AppleWorks SS' },
  0xB0: { name: 'SRC', description: 'Source Code' },
  0xB3: { name: 'S16', description: 'GS/OS App' },
  0xBF: { name: 'DOC', description: 'Document' },
  0xC0: { name: 'PNT', description: 'Packed HiRes' },
  0xC1: { name: 'PIC', description: 'HiRes Picture' },
  0xE0: { name: 'SHK', description: 'ShrinkIt Archive' },
  0xEF: { name: 'PAS', description: 'Pascal' },
  0xF0: { name: 'CMD', description: 'Command' },
  0xFA: { name: 'INT', description: 'Integer BASIC' },
  0xFB: { name: 'IVR', description: 'Integer Vars' },
  0xFC: { name: 'BAS', description: 'Applesoft BASIC' },
  0xFD: { name: 'VAR', description: 'Applesoft Vars' },
  0xFE: { name: 'REL', description: 'Relocatable' },
  0xFF: { name: 'SYS', description: 'System' },
};

// Standard 140K disk size
const DISK_140K_SIZE = 143360;

// ProDOS logical sector to DOS logical sector conversion
// When reading a DOS-order disk image (.DO/.DSK), we need to convert
// ProDOS sector numbers to DOS sector numbers to find the right file offset
const PRODOS_TO_DOS_SECTOR = [0, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 15];

/**
 * Read a 512-byte block from disk data (internal)
 * @param {Uint8Array} diskData - Raw disk image data
 * @param {number} blockNum - Block number
 * @param {boolean} dosOrder - If true, convert ProDOS sectors to DOS sector offsets
 * @returns {Uint8Array} 512-byte block data
 */
function readBlockInternal(diskData, blockNum, dosOrder) {
  const result = new Uint8Array(BLOCK_SIZE);

  if (diskData.length <= DISK_140K_SIZE) {
    // 140K disk - block N is at track N/8, ProDOS sectors (N%8)*2 and (N%8)*2+1
    const track = Math.floor(blockNum / 8);
    const blockInTrack = blockNum % 8;

    // ProDOS logical sectors for this block
    const prodosSector1 = blockInTrack * 2;
    const prodosSector2 = blockInTrack * 2 + 1;

    let sector1, sector2;
    if (dosOrder) {
      // Convert ProDOS sector numbers to DOS sector numbers
      sector1 = PRODOS_TO_DOS_SECTOR[prodosSector1];
      sector2 = PRODOS_TO_DOS_SECTOR[prodosSector2];
    } else {
      // File is already in ProDOS order
      sector1 = prodosSector1;
      sector2 = prodosSector2;
    }

    // Calculate offsets (256 bytes per sector, 16 sectors per track)
    const offset1 = (track * 16 + sector1) * 256;
    const offset2 = (track * 16 + sector2) * 256;

    if (offset1 + 256 <= diskData.length) {
      result.set(diskData.slice(offset1, offset1 + 256), 0);
    }
    if (offset2 + 256 <= diskData.length) {
      result.set(diskData.slice(offset2, offset2 + 256), 256);
    }
  } else {
    // Larger disk (800K, etc.) - blocks are sequential
    const offset = blockNum * BLOCK_SIZE;
    if (offset + BLOCK_SIZE <= diskData.length) {
      result.set(diskData.slice(offset, offset + BLOCK_SIZE));
    }
  }

  return result;
}

/**
 * Read a 512-byte block from disk data using specified sector ordering
 * @param {Uint8Array} diskData - Raw disk image data
 * @param {number} blockNum - Block number
 * @param {boolean} dosOrder - If true, use DOS sector ordering
 * @returns {Uint8Array} 512-byte block data
 */
function readBlock(diskData, blockNum, dosOrder) {
  return readBlockInternal(diskData, blockNum, dosOrder);
}

/**
 * Check if a block contains a valid ProDOS volume header
 * @param {Uint8Array} block - 512-byte block data
 * @returns {boolean} True if valid volume header
 */
function isValidVolumeHeader(block) {
  const storageTypeAndNameLength = block[0x04];
  const storageType = (storageTypeAndNameLength >> 4) & 0x0F;
  const nameLength = storageTypeAndNameLength & 0x0F;

  // Must be volume header type
  if (storageType !== STORAGE_TYPE_VOLUME_HEADER) {
    return false;
  }

  // Name length must be 1-15
  if (nameLength === 0 || nameLength > 15) {
    return false;
  }

  // Check standard ProDOS values
  const entryLength = block[0x23];
  const entriesPerBlock = block[0x24];

  if (entryLength !== 0x27 || entriesPerBlock !== 0x0D) {
    return false;
  }

  return true;
}

/**
 * Parse the volume header from block 2
 * Tries both sector orderings (ProDOS-order and DOS-order) for 140K disks
 * @param {Uint8Array} diskData - Raw disk image data
 * @returns {Object|null} Volume info or null if not ProDOS
 */
export function parseVolumeInfo(diskData) {
  if (diskData.length < DISK_140K_SIZE) {
    return null;
  }

  // Try ProDOS sector order first (for .PO files)
  let block2 = readBlockInternal(diskData, 2, false);
  let useDOSSectorOrder = false;

  if (!isValidVolumeHeader(block2)) {
    // Try DOS sector order (for .DO/.DSK files)
    block2 = readBlockInternal(diskData, 2, true);
    if (!isValidVolumeHeader(block2)) {
      return null;
    }
    useDOSSectorOrder = true;
  }

  const storageTypeAndNameLength = block2[0x04];
  const nameLength = storageTypeAndNameLength & 0x0F;

  // Volume name is at offset 0x05
  const volumeName = parseProDOSFilename(block2.slice(0x05, 0x05 + nameLength));

  // Validate volume name contains only valid ProDOS characters (A-Z, 0-9, .)
  if (!/^[A-Z][A-Z0-9.]*$/i.test(volumeName)) {
    return null;
  }

  // Get additional volume info
  const creationDate = parseProDOSDate(block2[0x1C] | (block2[0x1D] << 8),
                                        block2[0x1E] | (block2[0x1F] << 8));
  const version = block2[0x20];
  const minVersion = block2[0x21];
  const access = block2[0x22];
  const entryLength = block2[0x23];
  const entriesPerBlock = block2[0x24];
  const fileCount = block2[0x25] | (block2[0x26] << 8);
  const bitmapPointer = block2[0x27] | (block2[0x28] << 8);
  const totalBlocks = block2[0x29] | (block2[0x2A] << 8);

  // Validate total blocks is reasonable for disk size
  const expectedBlocks = diskData.length <= DISK_140K_SIZE ? 280 : Math.floor(diskData.length / BLOCK_SIZE);
  if (totalBlocks === 0 || totalBlocks > expectedBlocks + 10) {
    return null;
  }

  return {
    volumeName,
    creationDate,
    version,
    minVersion,
    access,
    entryLength,
    entriesPerBlock,
    fileCount,
    bitmapPointer,
    totalBlocks,
    useDOSSectorOrder, // Include sector ordering for subsequent reads
  };
}

/**
 * Parse ProDOS date/time
 * @param {number} dateWord - Date word
 * @param {number} timeWord - Time word
 * @returns {Date|null} Parsed date or null
 */
function parseProDOSDate(dateWord, timeWord) {
  if (dateWord === 0) return null;

  const year = ((dateWord >> 9) & 0x7F) + 1900;
  const month = (dateWord >> 5) & 0x0F;
  const day = dateWord & 0x1F;
  const hour = (timeWord >> 8) & 0x1F;
  const minute = timeWord & 0x3F;

  // Adjust year - ProDOS uses years 0-99 for 1900-1999 and 2000-2039
  const adjustedYear = year < 1940 ? year + 100 : year;

  return new Date(adjustedYear, month - 1, day, hour, minute);
}


/**
 * Parse a directory entry
 * @param {Uint8Array} entry - 39-byte directory entry
 * @returns {Object|null} Parsed entry or null if empty/deleted
 */
function parseDirectoryEntry(entry) {
  const storageTypeAndNameLength = entry[0x00];
  const storageType = (storageTypeAndNameLength >> 4) & 0x0F;
  const nameLength = storageTypeAndNameLength & 0x0F;

  // Check for deleted or empty entry
  if (storageType === STORAGE_TYPE_DELETED || nameLength === 0) {
    return null;
  }

  // Skip volume and subdir headers
  if (storageType === STORAGE_TYPE_VOLUME_HEADER ||
      storageType === STORAGE_TYPE_SUBDIR_HEADER) {
    return null;
  }

  const filename = parseProDOSFilename(entry.slice(0x01, 0x01 + nameLength));
  const fileType = entry[0x10];
  const keyPointer = entry[0x11] | (entry[0x12] << 8);
  const blocksUsed = entry[0x13] | (entry[0x14] << 8);
  const eof = entry[0x15] | (entry[0x16] << 8) | (entry[0x17] << 16);
  const creationDate = parseProDOSDate(entry[0x18] | (entry[0x19] << 8),
                                        entry[0x1A] | (entry[0x1B] << 8));
  const version = entry[0x1C];
  const minVersion = entry[0x1D];
  const access = entry[0x1E];
  const auxType = entry[0x1F] | (entry[0x20] << 8);
  const modDate = parseProDOSDate(entry[0x21] | (entry[0x22] << 8),
                                   entry[0x23] | (entry[0x24] << 8));
  const headerPointer = entry[0x25] | (entry[0x26] << 8);

  const typeInfo = FILE_TYPES[fileType] || { name: `$${fileType.toString(16).toUpperCase().padStart(2, '0')}`, description: 'Unknown' };

  return {
    storageType,
    filename,
    fileType,
    fileTypeName: typeInfo.name,
    fileTypeDescription: typeInfo.description,
    keyPointer,
    blocksUsed,
    eof,
    creationDate,
    version,
    minVersion,
    access,
    auxType,
    modDate,
    headerPointer,
    isLocked: (access & 0x02) === 0, // Write-disabled = locked
    isDirectory: storageType === STORAGE_TYPE_SUBDIR,
  };
}

/**
 * Read a directory (volume or subdirectory)
 * @param {Uint8Array} diskData - Raw disk image data
 * @param {number} startBlock - Starting block of directory
 * @param {string} pathPrefix - Path prefix for entries
 * @param {boolean} dosOrder - If true, use DOS sector ordering
 * @returns {Array} Array of directory entries
 */
function readDirectory(diskData, startBlock, pathPrefix = '', dosOrder = false) {
  const entries = [];
  let blockNum = startBlock;
  const visited = new Set();

  while (blockNum !== 0) {
    if (visited.has(blockNum)) break;
    visited.add(blockNum);

    const block = readBlock(diskData, blockNum, dosOrder);

    // Get prev/next block pointers (first 4 bytes of block)
    const nextBlock = block[0x02] | (block[0x03] << 8);

    // Parse entries in this block
    // First block has header at entry 0, subsequent blocks start at entry 0
    const firstEntry = blockNum === startBlock ? 1 : 0;
    const entryOffset = blockNum === startBlock ? 0x04 : 0x04;

    for (let i = firstEntry; i < ENTRIES_PER_BLOCK; i++) {
      const offset = 0x04 + (i * ENTRY_SIZE);
      if (offset + ENTRY_SIZE > BLOCK_SIZE) break;

      const entryData = block.slice(offset, offset + ENTRY_SIZE);
      const entry = parseDirectoryEntry(entryData);

      if (entry) {
        entry.path = pathPrefix ? `${pathPrefix}/${entry.filename}` : entry.filename;
        entries.push(entry);
      }
    }

    blockNum = nextBlock;
  }

  return entries;
}

/**
 * Read the disk catalog (volume directory and all subdirectories)
 * @param {Uint8Array} diskData - Raw disk image data
 * @returns {Array} Array of all file entries with full paths (includes _dosOrder property for readFile)
 */
export function readCatalog(diskData) {
  const volumeInfo = parseVolumeInfo(diskData);
  if (!volumeInfo) {
    return [];
  }

  const dosOrder = volumeInfo.useDOSSectorOrder;
  const allEntries = [];
  const dirsToProcess = [{ block: VOLUME_DIRECTORY_BLOCK, path: '' }];

  while (dirsToProcess.length > 0) {
    const { block, path } = dirsToProcess.shift();
    const entries = readDirectory(diskData, block, path, dosOrder);

    for (const entry of entries) {
      // Attach sector ordering to each entry for use by readFile
      entry._dosOrder = dosOrder;
      if (entry.isDirectory) {
        // Queue subdirectory for processing
        dirsToProcess.push({
          block: entry.keyPointer,
          path: entry.path,
        });
      }
      allEntries.push(entry);
    }
  }

  return allEntries;
}

/**
 * Read file contents using appropriate storage type
 * @param {Uint8Array} diskData - Raw disk image data
 * @param {Object} entry - Catalog entry for the file (includes _dosOrder from readCatalog)
 * @returns {Uint8Array} File contents
 */
export function readFile(diskData, entry) {
  if (entry.isDirectory) {
    return new Uint8Array(0);
  }

  const eof = entry.eof;
  const dosOrder = entry._dosOrder || false;
  let data;

  switch (entry.storageType) {
    case STORAGE_TYPE_SEEDLING:
      data = readSeedlingFile(diskData, entry.keyPointer, eof, dosOrder);
      break;
    case STORAGE_TYPE_SAPLING:
      data = readSaplingFile(diskData, entry.keyPointer, eof, dosOrder);
      break;
    case STORAGE_TYPE_TREE:
      data = readTreeFile(diskData, entry.keyPointer, eof, dosOrder);
      break;
    default:
      data = new Uint8Array(0);
  }

  return data;
}

/**
 * Read a seedling file (single block, <=512 bytes)
 * @param {Uint8Array} diskData - Raw disk image data
 * @param {number} blockNum - Block number containing file data
 * @param {number} eof - File size
 * @param {boolean} dosOrder - If true, use DOS sector ordering
 * @returns {Uint8Array} File contents
 */
function readSeedlingFile(diskData, blockNum, eof, dosOrder) {
  const block = readBlock(diskData, blockNum, dosOrder);
  return block.slice(0, eof);
}

/**
 * Read a sapling file (index block + data blocks)
 * @param {Uint8Array} diskData - Raw disk image data
 * @param {number} indexBlock - Block number of index block
 * @param {number} eof - File size
 * @param {boolean} dosOrder - If true, use DOS sector ordering
 * @returns {Uint8Array} File contents
 */
function readSaplingFile(diskData, indexBlock, eof, dosOrder) {
  const index = readBlock(diskData, indexBlock, dosOrder);
  const result = new Uint8Array(eof);
  let bytesRead = 0;

  for (let i = 0; i < 256 && bytesRead < eof; i++) {
    const dataBlockNum = index[i] | (index[i + 256] << 8);
    if (dataBlockNum === 0) {
      // Sparse file - fill with zeros
      const bytesToFill = Math.min(BLOCK_SIZE, eof - bytesRead);
      bytesRead += bytesToFill;
      continue;
    }

    const dataBlock = readBlock(diskData, dataBlockNum, dosOrder);
    const bytesToCopy = Math.min(BLOCK_SIZE, eof - bytesRead);
    result.set(dataBlock.slice(0, bytesToCopy), bytesRead);
    bytesRead += bytesToCopy;
  }

  return result;
}

/**
 * Read a tree file (master index + index blocks + data blocks)
 * @param {Uint8Array} diskData - Raw disk image data
 * @param {number} masterBlock - Block number of master index block
 * @param {number} eof - File size
 * @param {boolean} dosOrder - If true, use DOS sector ordering
 * @returns {Uint8Array} File contents
 */
function readTreeFile(diskData, masterBlock, eof, dosOrder) {
  const master = readBlock(diskData, masterBlock, dosOrder);
  const result = new Uint8Array(eof);
  let bytesRead = 0;

  for (let i = 0; i < 128 && bytesRead < eof; i++) {
    const indexBlockNum = master[i] | (master[i + 256] << 8);
    if (indexBlockNum === 0) {
      // Sparse - skip 256 blocks worth of data
      const bytesToSkip = Math.min(256 * BLOCK_SIZE, eof - bytesRead);
      bytesRead += bytesToSkip;
      continue;
    }

    const index = readBlock(diskData, indexBlockNum, dosOrder);

    for (let j = 0; j < 256 && bytesRead < eof; j++) {
      const dataBlockNum = index[j] | (index[j + 256] << 8);
      if (dataBlockNum === 0) {
        const bytesToFill = Math.min(BLOCK_SIZE, eof - bytesRead);
        bytesRead += bytesToFill;
        continue;
      }

      const dataBlock = readBlock(diskData, dataBlockNum, dosOrder);
      const bytesToCopy = Math.min(BLOCK_SIZE, eof - bytesRead);
      result.set(dataBlock.slice(0, bytesToCopy), bytesRead);
      bytesRead += bytesToCopy;
    }
  }

  return result;
}

/**
 * Map ProDOS file type to DOS 3.3 viewer type
 * @param {number} prodosType - ProDOS file type
 * @returns {number} DOS 3.3 equivalent type for viewer
 */
export function mapFileTypeForViewer(prodosType) {
  switch (prodosType) {
    case 0x04: // TXT
      return 0x00; // DOS 3.3 Text
    case 0xFA: // INT
      return 0x01; // DOS 3.3 Integer BASIC
    case 0xFC: // BAS
      return 0x02; // DOS 3.3 Applesoft BASIC
    case 0x06: // BIN
    case 0xFF: // SYS
      return 0x04; // DOS 3.3 Binary
    default:
      return -1; // Use hex dump
  }
}

/**
 * Get binary file info from ProDOS entry
 * ProDOS stores load address in auxType field, not in file data
 * @param {Object} entry - ProDOS catalog entry
 * @returns {Object} {address, length}
 */
export function getBinaryFileInfo(entry) {
  return {
    address: entry.auxType,
    length: entry.eof,
  };
}

/**
 * Check if disk is ProDOS format
 * @param {Uint8Array} diskData - Raw disk image data
 * @returns {boolean} True if ProDOS format
 */
export function isProDOS(diskData) {
  return parseVolumeInfo(diskData) !== null;
}

export { FILE_TYPES, BLOCK_SIZE };
