// IndexedDB Helper - Shared utilities for IndexedDB operations

/**
 * Creates a database manager for a specific IndexedDB database.
 * Handles connection caching, database opening, and provides
 * Promise-based wrappers for common operations.
 *
 * @param {Object} config - Database configuration
 * @param {string} config.dbName - The database name
 * @param {number} config.version - The database version
 * @param {function} config.onUpgrade - Upgrade handler (event) => void
 * @returns {Object} Database manager with helper methods
 */
export function createDatabaseManager({ dbName, version, onUpgrade }) {
  let cachedDb = null;

  /**
   * Open the database, using cached connection if available
   * @returns {Promise<IDBDatabase>}
   */
  async function open() {
    if (cachedDb) {
      return cachedDb;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, version);

      request.onerror = () => {
        console.error(`Failed to open database ${dbName}:`, request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        cachedDb = request.result;
        resolve(cachedDb);
      };

      request.onupgradeneeded = onUpgrade;
    });
  }

  /**
   * Get a record by key from a store
   * @param {string} storeName - The object store name
   * @param {*} key - The key to look up
   * @returns {Promise<*>} The record or undefined
   */
  async function get(storeName, key) {
    const db = await open();
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Put (insert or update) a record in a store
   * @param {string} storeName - The object store name
   * @param {*} record - The record to store
   * @returns {Promise<*>} The key of the stored record
   */
  async function put(storeName, record) {
    const db = await open();
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Add a new record to a store (fails if key exists)
   * @param {string} storeName - The object store name
   * @param {*} record - The record to add
   * @returns {Promise<*>} The key of the added record
   */
  async function add(storeName, record) {
    const db = await open();
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.add(record);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete a record by key from a store
   * @param {string} storeName - The object store name
   * @param {*} key - The key to delete
   * @returns {Promise<void>}
   */
  async function remove(storeName, key) {
    const db = await open();
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Count records in a store
   * @param {string} storeName - The object store name
   * @returns {Promise<number>}
   */
  async function count(storeName) {
    const db = await open();
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Iterate over records using a cursor
   * @param {string} storeName - The object store name
   * @param {Object} options - Cursor options
   * @param {string} [options.indexName] - Optional index name to use
   * @param {IDBKeyRange} [options.range] - Optional key range
   * @param {string} [options.direction] - Cursor direction ('next', 'prev', etc.)
   * @param {function} callback - Called for each record: (value, cursor) => void
   *                              Return false to stop iteration
   * @returns {Promise<void>}
   */
  async function iterate(storeName, options, callback) {
    const db = await open();
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const source = options.indexName ? store.index(options.indexName) : store;

    return new Promise((resolve, reject) => {
      const request = source.openCursor(options.range || null, options.direction || "next");

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const result = callback(cursor.value, cursor);
          if (result !== false) {
            cursor.continue();
          } else {
            resolve();
          }
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Iterate over records with write access (for deletion during iteration)
   * @param {string} storeName - The object store name
   * @param {Object} options - Cursor options
   * @param {string} [options.indexName] - Optional index name to use
   * @param {IDBKeyRange} [options.range] - Optional key range
   * @param {string} [options.direction] - Cursor direction ('next', 'prev', etc.)
   * @param {function} callback - Called for each record: (value, cursor, store) => void
   * @returns {Promise<void>}
   */
  async function iterateWithWrite(storeName, options, callback) {
    const db = await open();
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const source = options.indexName ? store.index(options.indexName) : store;

    return new Promise((resolve, reject) => {
      const request = source.openCursor(options.range || null, options.direction || "next");

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          callback(cursor.value, cursor, store);
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get raw database reference for complex operations
   * @returns {Promise<IDBDatabase>}
   */
  async function getDatabase() {
    return open();
  }

  return {
    open,
    get,
    put,
    add,
    remove,
    count,
    iterate,
    iterateWithWrite,
    getDatabase,
  };
}
