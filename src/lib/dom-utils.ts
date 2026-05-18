/**
 * Safe DOM utility helpers for FocusOS content scripts.
 * Provides null-safe queries, shadow DOM isolation, and element tracking.
 */

const PROCESSED_ATTR = 'data-focusos-processed';
const CLASS_PREFIX = 'focusos-';

/**
 * Null-safe querySelector that catches invalid selectors.
 */
export function safeQuerySelector(
  parent: ParentNode,
  selector: string
): Element | null {
  try {
    return parent.querySelector(selector);
  } catch {
    return null;
  }
}

/**
 * Null-safe querySelectorAll returning an array instead of NodeList.
 * Catches invalid selectors and returns empty array.
 */
export function safeQuerySelectorAll(
  parent: ParentNode,
  selector: string
): Element[] {
  try {
    return Array.from(parent.querySelectorAll(selector));
  } catch {
    return [];
  }
}

/**
 * Check if an element is visible in the viewport using getBoundingClientRect.
 */
export function isElementVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

/**
 * Create a shadow DOM container for isolated UI injection.
 * Returns both the host element and the shadow root.
 */
export function createShadowContainer(
  id: string
): { host: HTMLElement; shadow: ShadowRoot } {
  const host = document.createElement('div');
  host.id = `${CLASS_PREFIX}${id}`;
  host.style.all = 'initial';
  const shadow = host.attachShadow({ mode: 'open' });
  return { host, shadow };
}

/**
 * Add a class with the focusos- prefix to avoid conflicts with host page styles.
 */
export function addFocusClass(el: Element, className: string): void {
  el.classList.add(`${CLASS_PREFIX}${className}`);
}

/**
 * Remove a focusos- prefixed class from an element.
 */
export function removeFocusClass(el: Element, className: string): void {
  el.classList.remove(`${CLASS_PREFIX}${className}`);
}

/**
 * Check if an element matches any selector in an array.
 * Catches invalid selectors gracefully.
 */
export function matchesAnySelector(el: Element, selectors: string[]): boolean {
  for (const selector of selectors) {
    try {
      if (el.matches(selector)) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

/**
 * Check if an element has already been processed by FocusOS.
 */
export function isProcessed(el: Element): boolean {
  return el.hasAttribute(PROCESSED_ATTR);
}

/**
 * Mark an element as processed by FocusOS.
 */
export function markProcessed(el: Element): void {
  el.setAttribute(PROCESSED_ATTR, 'true');
}
