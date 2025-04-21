/**
 * @module StorageUtils
 * Utility functions for localStorage and sessionStorage
 */

/**
 * Save data to localStorage
 * @param {string} key - The storage key
 * @param {*} data - The data to save
 * @returns {boolean} Whether the operation was successful
 */
export function saveToLocalStorage(key, data) {
  try {
    const serializedData = JSON.stringify(data);
    localStorage.setItem(key, serializedData);
    return true;
  } catch (error) {
    console.error(`Error saving to localStorage: ${error.message}`);
    return false;
  }
}

/**
 * Load data from localStorage
 * @param {string} key - The storage key
 * @param {*} defaultValue - Default value if key doesn't exist
 * @returns {*} The loaded data or default value
 */
export function loadFromLocalStorage(key, defaultValue = null) {
  try {
    const serializedData = localStorage.getItem(key);
    
    if (serializedData === null) {
      return defaultValue;
    }
    
    return JSON.parse(serializedData);
  } catch (error) {
    console.error(`Error loading from localStorage: ${error.message}`);
    return defaultValue;
  }
}

/**
 * Remove data from localStorage
 * @param {string} key - The storage key
 * @returns {boolean} Whether the operation was successful
 */
export function removeFromLocalStorage(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`Error removing from localStorage: ${error.message}`);
    return false;
  }
}

/**
 * Check if a key exists in localStorage
 * @param {string} key - The storage key
 * @returns {boolean} Whether the key exists
 */
export function localStorageHas(key) {
  try {
    return localStorage.getItem(key) !== null;
  } catch (error) {
    console.error(`Error checking localStorage: ${error.message}`);
    return false;
  }
}

/**
 * Save data to sessionStorage
 * @param {string} key - The storage key
 * @param {*} data - The data to save
 * @returns {boolean} Whether the operation was successful
 */
export function saveToSessionStorage(key, data) {
  try {
    const serializedData = JSON.stringify(data);
    sessionStorage.setItem(key, serializedData);
    return true;
  } catch (error) {
    console.error(`Error saving to sessionStorage: ${error.message}`);
    return false;
  }
}

/**
 * Load data from sessionStorage
 * @param {string} key - The storage key
 * @param {*} defaultValue - Default value if key doesn't exist
 * @returns {*} The loaded data or default value
 */
export function loadFromSessionStorage(key, defaultValue = null) {
  try {
    const serializedData = sessionStorage.getItem(key);
    
    if (serializedData === null) {
      return defaultValue;
    }
    
    return JSON.parse(serializedData);
  } catch (error) {
    console.error(`Error loading from sessionStorage: ${error.message}`);
    return defaultValue;
  }
}

/**
 * Remove data from sessionStorage
 * @param {string} key - The storage key
 * @returns {boolean} Whether the operation was successful
 */
export function removeFromSessionStorage(key) {
  try {
    sessionStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`Error removing from sessionStorage: ${error.message}`);
    return false;
  }
}

/**
 * Check if a key exists in sessionStorage
 * @param {string} key - The storage key
 * @returns {boolean} Whether the key exists
 */
export function sessionStorageHas(key) {
  try {
    return sessionStorage.getItem(key) !== null;
  } catch (error) {
    console.error(`Error checking sessionStorage: ${error.message}`);
    return false;
  }
}

/**
 * Clear all local storage data
 * @returns {boolean} Whether the operation was successful
 */
export function clearLocalStorage() {
  try {
    localStorage.clear();
    return true;
  } catch (error) {
    console.error(`Error clearing localStorage: ${error.message}`);
    return false;
  }
}

/**
 * Clear all session storage data
 * @returns {boolean} Whether the operation was successful
 */
export function clearSessionStorage() {
  try {
    sessionStorage.clear();
    return true;
  } catch (error) {
    console.error(`Error clearing sessionStorage: ${error.message}`);
    return false;
  }
}

/**
 * Get the total size of localStorage in bytes
 * @returns {number} Size in bytes
 */
export function getLocalStorageSize() {
  try {
    let totalSize = 0;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      totalSize += key.length + value.length;
    }
    
    return totalSize;
  } catch (error) {
    console.error(`Error getting localStorage size: ${error.message}`);
    return 0;
  }
}

/**
 * Check if localStorage is available
 * @returns {boolean} Whether localStorage is available
 */
export function isLocalStorageAvailable() {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Get all localStorage keys
 * @returns {Array} Array of keys
 */
export function getLocalStorageKeys() {
  try {
    const keys = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      keys.push(localStorage.key(i));
    }
    
    return keys;
  } catch (error) {
    console.error(`Error getting localStorage keys: ${error.message}`);
    return [];
  }
}

/**
 * Create a namespaced localStorage key
 * @param {string} namespace - The namespace
 * @param {string} key - The key
 * @returns {string} The namespaced key
 */
export function createNamespacedKey(namespace, key) {
  return `${namespace}:${key}`;
}