/*
 * library-image.js - Disk images from the built-in library, fetched and cached
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { createDatabaseManager } from "../utils/indexeddb-helper.js";

/*
 * A library image is fetched once and kept in IndexedDB, so it loads offline
 * and without a second download. What is kept has to be a disk image: a
 * server, a development server or a captive portal can answer a missing file
 * with an HTML page and a 200, and a page cached under the disk's id was then
 * served as that disk on every later visit, failing every time. So a
 * download is checked before it is kept, and a cached copy is used only if it
 * was kept for the same file.
 */

const CACHE_STORE = "images";

const libraryCacheDb = createDatabaseManager({
  dbName: "a2e-disk-library-cache",
  version: 1,
  onUpgrade: (event) => {
    const database = event.target.result;
    if (!database.objectStoreNames.contains(CACHE_STORE)) {
      database.createObjectStore(CACHE_STORE, { keyPath: "id" });
    }
  },
});

/** Smaller than any disk image the library holds (a 140K floppy is the least). */
const MIN_IMAGE_BYTES = 1024;

/**
 * Why these bytes are not a disk image, or null if they could be one.
 *
 * @param {Uint8Array} data
 * @param {string|null} contentType - the response's Content-Type, if any
 */
export function notADiskImage(data, contentType = null) {
  if (contentType && /text\/html/i.test(contentType)) return "the server sent a web page";
  if (!data || data.length < MIN_IMAGE_BYTES) return `only ${data?.length ?? 0} bytes arrived`;
  // A page without a content type still starts like one.
  const head = new TextDecoder("latin1").decode(data.subarray(0, 64)).trimStart().toLowerCase();
  if (head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<?xml")) {
    return "the server sent a web page";
  }
  return null;
}

/**
 * The image for a library entry: the cached copy, or a checked download.
 * @param {{id: string, file: string}} entry - a library.json entry
 * @returns {Promise<Uint8Array>}
 */
export async function getLibraryImage(entry) {
  try {
    const cached = await libraryCacheDb.get(CACHE_STORE, entry.id);
    if (cached && cached.file === entry.file && !notADiskImage(new Uint8Array(cached.data))) {
      return new Uint8Array(cached.data);
    }
  } catch (err) {
    console.warn("Library cache read failed:", err);
  }

  const resp = await fetch(`/disks/${encodeURIComponent(entry.file)}`, { cache: "no-cache" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const arrayBuffer = await resp.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);
  const problem = notADiskImage(data, resp.headers.get("content-type"));
  if (problem) throw new Error(`${entry.file} did not download: ${problem}`);

  try {
    await libraryCacheDb.put(CACHE_STORE, { id: entry.id, file: entry.file, data: arrayBuffer });
  } catch (err) {
    console.warn("Library cache write failed:", err);
  }
  return data;
}

/** Drop a cached image that would not load, so the next try downloads it again. */
export async function forgetLibraryImage(entry) {
  try {
    await libraryCacheDb.remove(CACHE_STORE, entry.id);
  } catch (err) {
    console.warn("Library cache delete failed:", err);
  }
}

/**
 * The library's list, always from the server: an old cached list names files
 * a newer deploy may have removed.
 */
export async function fetchLibrary() {
  const resp = await fetch("/disks/library.json", { cache: "no-cache" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}
