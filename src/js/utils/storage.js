/**
 * Storage - Safe localStorage wrapper with error handling
 */

/**
 * Safely get an item from localStorage
 * @param {string} key - The storage key
 * @param {*} defaultValue - Default value if key doesn't exist or on error
 * @returns {string|null} The stored value or defaultValue
 */
export function getItem(key, defaultValue = null) {
  try {
    const value = localStorage.getItem(key);
    return value !== null ? value : defaultValue;
  } catch (e) {
    // localStorage may be unavailable (private browsing, disabled, etc.)
    return defaultValue;
  }
}

/**
 * Safely set an item in localStorage
 * @param {string} key - The storage key
 * @param {string} value - The value to store
 * @returns {boolean} True if successful, false otherwise
 */
export function setItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    // localStorage may be unavailable or quota exceeded
    return false;
  }
}

/**
 * Safely remove an item from localStorage
 * @param {string} key - The storage key
 * @returns {boolean} True if successful, false otherwise
 */
export function removeItem(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Safely get and parse a JSON item from localStorage
 * @param {string} key - The storage key
 * @param {*} defaultValue - Default value if key doesn't exist, on error, or invalid JSON
 * @returns {*} The parsed value or defaultValue
 */
export function getJSON(key, defaultValue = null) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    return JSON.parse(value);
  } catch (e) {
    // localStorage unavailable or invalid JSON
    return defaultValue;
  }
}

/**
 * Safely stringify and set a JSON item in localStorage
 * @param {string} key - The storage key
 * @param {*} value - The value to store (will be JSON.stringify'd)
 * @returns {boolean} True if successful, false otherwise
 */
export function setJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Safely get a numeric value from localStorage
 * @param {string} key - The storage key
 * @param {number} defaultValue - Default value if key doesn't exist, on error, or not a valid number
 * @param {object} options - Optional constraints: { min, max }
 * @returns {number} The numeric value or defaultValue
 */
export function getNumber(key, defaultValue, options = {}) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;

    const num = parseFloat(value);
    if (isNaN(num)) return defaultValue;

    // Apply constraints if provided
    if (options.min !== undefined && num < options.min) return defaultValue;
    if (options.max !== undefined && num > options.max) return defaultValue;

    return num;
  } catch (e) {
    return defaultValue;
  }
}

/**
 * Safely get a boolean value from localStorage
 * @param {string} key - The storage key
 * @param {boolean} defaultValue - Default value if key doesn't exist or on error
 * @returns {boolean} The boolean value or defaultValue
 */
export function getBoolean(key, defaultValue) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    return value === 'true';
  } catch (e) {
    return defaultValue;
  }
}
