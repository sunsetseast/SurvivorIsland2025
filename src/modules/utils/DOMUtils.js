/**
 * @module DOMUtils
 * Utility functions for DOM manipulation
 */

/**
 * Get an element by ID or selector
 * @param {string} idOrSelector - Element ID or CSS selector
 * @returns {HTMLElement|null} The found element or null
 */
export function getElement(idOrSelector) {
  if (!idOrSelector) return null;
  
  // First try by ID
  let element = document.getElementById(idOrSelector);
  
  // If not found, try as a selector
  if (!element) {
    try {
      element = document.querySelector(idOrSelector);
    } catch (e) {
      console.error(`Invalid selector: ${idOrSelector}`);
    }
  }
  
  return element;
}

/**
 * Get all elements matching a selector
 * @param {string} selector - CSS selector
 * @returns {NodeList} The found elements
 */
export function getElements(selector) {
  try {
    return document.querySelectorAll(selector);
  } catch (e) {
    console.error(`Invalid selector: ${selector}`);
    return [];
  }
}

/**
 * Create an element with attributes and children
 * @param {string} tag - The HTML tag name
 * @param {Object} attributes - The attributes to set
 * @param {Array|string} children - The children to append
 * @returns {HTMLElement} The created element
 */
export function createElement(tag, attributes = {}, children = []) {
  const element = document.createElement(tag);
  
  // Set attributes
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'style' && typeof value === 'object') {
      // Handle style object
      Object.entries(value).forEach(([property, propertyValue]) => {
        element.style[property] = propertyValue;
      });
    } else if (key.startsWith('on') && typeof value === 'function') {
      // Handle event listeners
      const eventName = key.substring(2).toLowerCase();
      element.addEventListener(eventName, value);
    } else if (key === 'dataset' && typeof value === 'object') {
      // Handle data attributes
      Object.entries(value).forEach(([dataKey, dataValue]) => {
        element.dataset[dataKey] = dataValue;
      });
    } else if (key === 'className') {
      // Handle className
      element.className = value;
    } else {
      // Handle other attributes
      element.setAttribute(key, value);
    }
  });
  
  // Append children
  if (children) {
    if (Array.isArray(children)) {
      children.forEach(child => {
        if (child) {
          if (typeof child === 'string') {
            element.appendChild(document.createTextNode(child));
          } else {
            element.appendChild(child);
          }
        }
      });
    } else if (typeof children === 'string') {
      element.textContent = children;
    } else {
      element.appendChild(children);
    }
  }
  
  return element;
}

/**
 * Clear all child elements of a parent
 * @param {HTMLElement} parent - The parent element
 */
export function clearChildren(parent) {
  if (!parent) return;
  
  while (parent.firstChild) {
    parent.removeChild(parent.firstChild);
  }
}

/**
 * Add a class to an element
 * @param {HTMLElement} element - The element
 * @param {string} className - The class to add
 */
export function addClass(element, className) {
  if (!element) return;
  
  if (element.classList) {
    element.classList.add(className);
  } else {
    element.className += ' ' + className;
  }
}

/**
 * Remove a class from an element
 * @param {HTMLElement} element - The element
 * @param {string} className - The class to remove
 */
export function removeClass(element, className) {
  if (!element) return;
  
  if (element.classList) {
    element.classList.remove(className);
  } else {
    element.className = element.className
      .replace(new RegExp('\\b' + className + '\\b', 'g'), '');
  }
}

/**
 * Toggle a class on an element
 * @param {HTMLElement} element - The element
 * @param {string} className - The class to toggle
 * @param {boolean} force - If true, adds the class; if false, removes the class
 */
export function toggleClass(element, className, force) {
  if (!element) return;
  
  if (element.classList) {
    if (force !== undefined) {
      element.classList.toggle(className, force);
    } else {
      element.classList.toggle(className);
    }
  } else {
    const hasClass = element.className.includes(className);
    
    if (force === undefined) {
      force = !hasClass;
    }
    
    if (force && !hasClass) {
      addClass(element, className);
    } else if (!force && hasClass) {
      removeClass(element, className);
    }
  }
}

/**
 * Check if an element has a class
 * @param {HTMLElement} element - The element
 * @param {string} className - The class to check
 * @returns {boolean} Whether the element has the class
 */
export function hasClass(element, className) {
  if (!element) return false;
  
  if (element.classList) {
    return element.classList.contains(className);
  } else {
    return new RegExp('\\b' + className + '\\b').test(element.className);
  }
}

/**
 * Set text content safely
 * @param {HTMLElement} element - The element
 * @param {string} text - The text to set
 */
export function setText(element, text) {
  if (!element) return;
  
  if (element.textContent !== undefined) {
    element.textContent = text;
  } else {
    element.innerText = text;
  }
}

/**
 * Set HTML content safely
 * @param {HTMLElement} element - The element
 * @param {string} html - The HTML to set
 */
export function setHTML(element, html) {
  if (!element) return;
  
  element.innerHTML = html;
}

/**
 * Show an element
 * @param {HTMLElement} element - The element
 * @param {string} displayType - The display type to use (default: block)
 */
export function showElement(element, displayType = 'block') {
  if (!element) return;
  
  element.style.display = displayType;
}

/**
 * Hide an element
 * @param {HTMLElement} element - The element
 */
export function hideElement(element) {
  if (!element) return;
  
  element.style.display = 'none';
}

/**
 * Toggle an element's visibility
 * @param {HTMLElement} element - The element
 * @param {string} displayType - The display type to use when showing (default: block)
 */
export function toggleElement(element, displayType = 'block') {
  if (!element) return;
  
  if (element.style.display === 'none') {
    element.style.display = displayType;
  } else {
    element.style.display = 'none';
  }
}

/**
 * Create a button element
 * @param {string} text - Button text
 * @param {Function} onClick - Click handler
 * @param {Object} attributes - Additional attributes
 * @returns {HTMLButtonElement} The button element
 */
export function createButton(text, onClick, attributes = {}) {
  return createElement('button', {
    ...attributes,
    onclick: onClick
  }, text);
}

/**
 * Find the closest ancestor matching a selector
 * @param {HTMLElement} element - The starting element
 * @param {string} selector - The selector to match
 * @returns {HTMLElement|null} The found ancestor or null
 */
export function closest(element, selector) {
  if (!element) return null;
  
  // Use native closest if available
  if (element.closest) {
    return element.closest(selector);
  }
  
  // Polyfill for closest
  let current = element;
  
  while (current) {
    if (matches(current, selector)) {
      return current;
    }
    current = current.parentElement;
  }
  
  return null;
}

/**
 * Check if an element matches a selector
 * @param {HTMLElement} element - The element
 * @param {string} selector - The selector to match
 * @returns {boolean} Whether the element matches the selector
 */
export function matches(element, selector) {
  if (!element) return false;
  
  // Use native matches if available
  const matchesMethod = element.matches ||
    element.webkitMatchesSelector ||
    element.mozMatchesSelector ||
    element.msMatchesSelector;
  
  if (matchesMethod) {
    return matchesMethod.call(element, selector);
  }
  
  // Fallback (less efficient)
  const elements = document.querySelectorAll(selector);
  return Array.from(elements).includes(element);
}

/**
 * Find parent element
 * @param {HTMLElement} element - The element
 * @returns {HTMLElement|null} The parent element or null
 */
export function getParent(element) {
  if (!element) return null;
  return element.parentElement;
}

/**
 * Create and return a document fragment
 * @param {Array} children - Child elements or strings
 * @returns {DocumentFragment} The document fragment
 */
export function createFragment(children = []) {
  const fragment = document.createDocumentFragment();
  
  if (Array.isArray(children)) {
    children.forEach(child => {
      if (typeof child === 'string') {
        const textNode = document.createTextNode(child);
        fragment.appendChild(textNode);
      } else if (child instanceof HTMLElement) {
        fragment.appendChild(child);
      }
    });
  }
  
  return fragment;
}

/**
 * Create a div element with a class name
 * @param {string} className - CSS class name
 * @param {Array|string} children - Child elements or text
 * @returns {HTMLDivElement} The div element
 */
export function createDiv(className, children = []) {
  return createElement('div', { className }, children);
}