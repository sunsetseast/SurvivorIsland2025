/**
 * @module CommonUtils
 * Utility functions for common operations
 */

/**
 * Generate a random integer between min and max (inclusive)
 * @param {number} min - The minimum value
 * @param {number} max - The maximum value
 * @returns {number} A random integer
 */
export function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 * @param {Array} array - The array to shuffle
 * @returns {Array} The shuffled array
 */
export function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generate a random ID
 * @returns {string} A random ID
 */
export function generateId() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * Clamp a value between min and max
 * @param {number} value - The value to clamp
 * @param {number} min - The minimum value
 * @param {number} max - The maximum value
 * @returns {number} The clamped value
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Create a deep copy of an object
 * @param {Object} obj - The object to copy
 * @returns {Object} A deep copy of the object
 */
export function deepCopy(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  // Handle Date
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  
  // Handle Array
  if (Array.isArray(obj)) {
    return obj.map(item => deepCopy(item));
  }
  
  // Handle Object
  if (obj instanceof Object) {
    const copy = {};
    Object.keys(obj).forEach(key => {
      copy[key] = deepCopy(obj[key]);
    });
    return copy;
  }
  
  // Handle undefined
  return undefined;
}

/**
 * Format a progress bar width
 * @param {number} value - The current value
 * @param {number} max - The maximum value
 * @returns {string} CSS width value as a percentage
 */
export function formatProgressWidth(value, max) {
  const percentage = Math.floor((value / max) * 100);
  return `${percentage}%`;
}

/**
 * Choose a random item from an array
 * @param {Array} array - The array to choose from
 * @returns {*} A random item from the array
 */
export function getRandomItem(array) {
  if (!array || array.length === 0) return null;
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Format a number with leading zeros
 * @param {number} num - The number to format
 * @param {number} size - The size of the resulting string
 * @returns {string} The formatted number
 */
export function formatNumberWithZeros(num, size) {
  let s = num.toString();
  while (s.length < size) s = "0" + s;
  return s;
}

/**
 * Check if two arrays have any common elements
 * @param {Array} array1 - First array
 * @param {Array} array2 - Second array
 * @returns {boolean} Whether the arrays have any common elements
 */
export function haveCommonElements(array1, array2) {
  return array1.some(item => array2.includes(item));
}

/**
 * Capitalize the first letter of a string
 * @param {string} string - The string to capitalize
 * @returns {string} The capitalized string
 */
export function capitalizeFirstLetter(string) {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * Debounce a function
 * @param {Function} func - The function to debounce
 * @param {number} wait - The time to wait in milliseconds
 * @returns {Function} The debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle a function
 * @param {Function} func - The function to throttle
 * @param {number} limit - The time limit in milliseconds
 * @returns {Function} The throttled function
 */
export function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Check if a value is defined and not null
 * @param {*} value - The value to check
 * @returns {boolean} Whether the value is defined and not null
 */
export function isDefined(value) {
  return value !== undefined && value !== null;
}

/**
 * Convert a string to slug format
 * @param {string} str - The string to convert
 * @returns {string} The slug-formatted string
 */
export function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Wait for a specified amount of time
 * @param {number} ms - The time to wait in milliseconds
 * @returns {Promise<void>} A promise that resolves after the specified time
 */
export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}