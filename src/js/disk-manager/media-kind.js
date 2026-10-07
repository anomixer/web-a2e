/*
 * media-kind.js - Which drive a dropped disk image belongs in
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/*
 * The same rule the native app applies (HardDrives::isBlockImage and
 * DiskDrives::isFloppyImage): .hdv and .2mg are block images for the
 * SmartPort, .dsk, .do, .woz and .nib are floppies, and .po is either,
 * because ProDOS order is how both a 140K floppy and a hard disk volume are
 * written out. A .po larger than a 5.25" disk can only be a volume.
 */

/** Bytes on a 5.25" disk: 35 tracks of 16 sectors of 256 bytes */
export const FLOPPY_SIZE = 143360;

const FLOPPY_EXTENSIONS = new Set([".dsk", ".do", ".po", ".woz", ".nib"]);
const BLOCK_EXTENSIONS = new Set([".hdv", ".2mg"]);

function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

/** Bytes on a 3.5" disk: 1600 blocks, or 800 single-sided */
export const DISK35_SIZES = [819200, 409600];

function le32(bytes, at) {
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
}

/**
 * Whether an image is a 3.5" disk, which is what the core's SonyDrive takes:
 * a WOZ whose INFO says 3.5", a ProDOS-order 2MG of 800K or 400K, or a raw
 * image of exactly that size whatever it is called. A WOZ or 2MG says what it
 * is only in its header, so that is asked for as well as the size.
 *
 * @param {number} size - the file's length
 * @param {?Uint8Array} header - its first 32 bytes, if they have been read
 */
export function isDisk35(size, header) {
  const tag = header && header.length >= 32 ? String.fromCharCode(...header.slice(0, 4)) : "";
  if (tag === "WOZ1" || tag === "WOZ2") {
    return String.fromCharCode(...header.slice(12, 16)) === "INFO" && header[21] === 2;
  }
  if (tag === "2IMG") {
    return le32(header, 0x0c) === 1 && DISK35_SIZES.includes(le32(header, 0x1c));
  }
  return DISK35_SIZES.includes(size);
}

/**
 * @param {string} name - the file's name
 * @param {number} size - its length in bytes
 * @param {{disk35?: boolean, header?: Uint8Array}} [machine] - whether the
 *   machine has 3.5" drives, and the file's first 32 bytes
 * @returns {"disk35"|"smartport"|"floppy"|null} where it goes, or null if it
 *   is not a disk image at all
 */
export function mediaKind(name, size, machine = {}) {
  const extension = extensionOf(name);
  // A IIgs puts an 800K disk in a 3.5" drive, as the machine would.
  if (machine.disk35 && isDisk35(size, machine.header ?? null)) return "disk35";
  if (BLOCK_EXTENSIONS.has(extension)) return "smartport";
  if (extension === ".po" && size > FLOPPY_SIZE) return "smartport";
  if (FLOPPY_EXTENSIONS.has(extension)) return "floppy";
  return null;
}

/**
 * The unit a dropped image goes into: the first empty one, or the first if
 * every unit is full, as the native app does.
 * @param {Array<{filename: ?string}>} units
 */
export function dropUnit(units) {
  const empty = units.findIndex((unit) => !unit.filename);
  return empty >= 0 ? empty : 0;
}
