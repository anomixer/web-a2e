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

/**
 * @param {string} name - the file's name
 * @param {number} size - its length in bytes
 * @returns {"smartport"|"floppy"|null} where it goes, or null if it is not a
 *   disk image at all
 */
export function mediaKind(name, size) {
  const extension = extensionOf(name);
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
