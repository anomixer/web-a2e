/*
 * printer-page-store.js - Persisted store of printed pages (IndexedDB)
 *
 * Every page the virtual printer produces is captured as a PNG and kept here so
 * the output survives a tab close. The Print Browser window reads this store to
 * preview, export, reprint, and delete pages. Mirrors the IndexedDB pattern in
 * state/state-persistence.js (createDatabaseManager + a keyPath store).
 *
 * Record shape (one per printed page):
 *   { id, jobId, pageIndex, pageCount, pngDataUrl, model, modelId, ribbon,
 *     pageSize, formInches, width, height, headXDot, headYDot, savedAt }
 * headXDot/headYDot are job-level (the head position at capture); the Print
 * Browser restores them when sending a job back to the paper.
 * id is `${jobId}::${pageIndex}` so re-persisting a still-growing job overwrites
 * its pages in place rather than duplicating them.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *  Shawn Bullock <shawn@agenticexpert.ai>
 */

import { createDatabaseManager } from "../utils/indexeddb-helper.js";

const DB_NAME    = "a2e-printer-pages";
const DB_VERSION = 1;
const STORE_NAME = "printerPages";

const db = createDatabaseManager({
  dbName: DB_NAME,
  version: DB_VERSION,
  onUpgrade: (event) => {
    const database = event.target.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex("jobId", "jobId", { unique: false });
      store.createIndex("savedAt", "savedAt", { unique: false });
    }
  },
});

/**
 * Insert or update one page record.
 * @param {Object} record - Page record (see file header for shape)
 * @returns {Promise<void>}
 */
export async function savePage(record) {
  try {
    await db.put(STORE_NAME, record);
  } catch (error) {
    console.error("Error saving printed page:", error);
  }
}

/**
 * All stored pages, ordered for display: job first (oldest job first), then page
 * order within the job.
 * @returns {Promise<Array<Object>>}
 */
export async function getAllPages() {
  try {
    const pages = [];
    await db.iterate(STORE_NAME, {}, (value) => { pages.push(value); });
    pages.sort((a, b) =>
      (a.jobId - b.jobId) || (a.pageIndex - b.pageIndex));
    return pages;
  } catch (error) {
    console.error("Error reading printed pages:", error);
    return [];
  }
}

/**
 * Delete a single page by id.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deletePage(id) {
  try {
    await db.remove(STORE_NAME, id);
  } catch (error) {
    console.error("Error deleting printed page:", error);
  }
}

/**
 * Delete every page of a job.
 * @param {number} jobId
 * @returns {Promise<void>}
 */
export async function deleteJob(jobId) {
  try {
    await db.iterateWithWrite(
      STORE_NAME,
      { indexName: "jobId", range: IDBKeyRange.only(jobId) },
      (_value, cursor) => cursor.delete(),
    );
  } catch (error) {
    console.error("Error deleting print job:", error);
  }
}

/**
 * Remove all stored pages.
 * @returns {Promise<void>}
 */
export async function clearAllPages() {
  try {
    const database = await db.getDatabase();
    await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch (error) {
    console.error("Error clearing printed pages:", error);
  }
}

/**
 * Number of stored pages.
 * @returns {Promise<number>}
 */
export async function countPages() {
  try {
    return await db.count(STORE_NAME);
  } catch (error) {
    console.error("Error counting printed pages:", error);
    return 0;
  }
}
