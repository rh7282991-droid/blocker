/**
 * Injector - DOM manipulation actions for FocusOS.
 * Applies visual effects (hide, blur, overlay, redirect) to matched elements.
 * Uses shadow DOM for style isolation on injected UI.
 */

import type { RuleAction, Rule } from '../core/types';
import { DEFAULT_BYPASS_DURATION, DEFAULT_MESSAGES } from '../core/constants';
import { createShadowContainer, markProcessed } from '../lib/dom-utils';
import { logger } from '../lib/logger';

interface ActiveEffect {
  action: RuleAction;
  rule: Rule;
  cleanup: () => void;
}

/** Custom event name dispatched when user clicks bypass/reveal button */
export const BYPASS_EVENT = 'focusos-bypass';

export class Injector {
  private activeEffects: Map<Element, ActiveEffect> = new Map();
  private revealTimers: Map<Element, ReturnType<typeof setTimeout>> = new Map();

  /**
   * Apply a rule action to an element.
   */
  applyAction(element: Element, action: RuleAction, rule: Rule): void {
    // Remove any existing effect before applying a new one
    if (this.activeEffects.has(element)) {
      this.removeEffect(element);
    }

    markProcessed(element);

    switch (action) {
      case 'hide':
        this.hideElement(element, rule);
        break;
      case 'blur':
        this.blurElement(element, rule.message || DEFAULT_MESSAGES.blur, rule);
        break;
      case 'overlay':
        this.overlayElement(
          element,
          rule.message || DEFAULT_MESSAGES.overlay,
          rule
        );
        break;
      case 'redirect':
        if (rule.redirectTarget) {
          this.redirectPage(rule.redirectTarget);
        } else {
          logger.warn('Redirect rule missing redirectTarget, skipping:', rule.id);
        }
        break;
    }
  }

  /**
   * Temporarily reveal a hidden/blurred/overlaid element.
   */
  revealTemporarily(element: Element, duration: number): void {
    const effect = this.activeEffects.get(element);
    if (!effect) {
      return;
    }

    const { action, rule, cleanup } = effect;
    cleanup();
    this.activeEffects.delete(element);

    logger.info('Revealing element temporarily for', duration, 'ms');

    // Clear any existing reveal timer
    const existingTimer = this.revealTimers.get(element);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Store action and rule info to reapply later
    const storedAction = action;
    const storedRule = rule;
    const timer = setTimeout(() => {
      this.revealTimers.delete(element);
      // Reapply the same visual effect (without bypass button since it was already used)
      this.reapplyEffect(element, storedAction, storedRule);
    }, duration);

    this.revealTimers.set(element, timer);
  }

  /**
   * Remove all FocusOS effects from an element.
   */
  removeEffect(element: Element): void {
    const effect = this.activeEffects.get(element);
    if (effect) {
      effect.cleanup();
      this.activeEffects.delete(element);
    }

    // Clear any reveal timer
    const timer = this.revealTimers.get(element);
    if (timer) {
      clearTimeout(timer);
      this.revealTimers.delete(element);
    }
  }

  /**
   * Remove all effects from all tracked elements.
   */
  removeAllEffects(): void {
    for (const [element] of this.activeEffects) {
      try {
        this.removeEffect(element);
      } catch (err) {
        logger.error('Cleanup failed for element:', err);
      }
    }
    this.activeEffects.clear();
    for (const timer of this.revealTimers.values()) {
      clearTimeout(timer);
    }
    this.revealTimers.clear();
  }

  /**
   * Hide an element by setting display to none.
   */
  private hideElement(el: Element, rule: Rule): void {
    const htmlEl = el as HTMLElement;
    const originalDisplay = htmlEl.style.display;

    htmlEl.style.display = 'none';
    htmlEl.setAttribute('data-focusos-action', 'hide');

    this.activeEffects.set(el, {
      action: 'hide',
      rule,
      cleanup: () => {
        htmlEl.style.display = originalDisplay;
        htmlEl.removeAttribute('data-focusos-action');
      },
    });
  }

  /**
   * Blur an element and show a message overlay with optional bypass button.
   */
  private blurElement(el: Element, message: string, rule: Rule): void {
    const htmlEl = el as HTMLElement;
    const originalFilter = htmlEl.style.filter;
    const originalPointerEvents = htmlEl.style.pointerEvents;
    const originalPosition = htmlEl.style.position;

    htmlEl.style.filter = 'blur(15px)';
    htmlEl.style.pointerEvents = 'none';
    htmlEl.setAttribute('data-focusos-action', 'blur');

    // Ensure parent can position overlay
    if (getComputedStyle(htmlEl).position === 'static') {
      htmlEl.style.position = 'relative';
    }

    // Create shadow DOM overlay for the message
    const { host, shadow } = createShadowContainer('blur-overlay');
    host.style.position = 'absolute';
    host.style.top = '0';
    host.style.left = '0';
    host.style.width = '100%';
    host.style.height = '100%';
    host.style.display = 'flex';
    host.style.alignItems = 'center';
    host.style.justifyContent = 'center';
    host.style.zIndex = '999999';
    host.style.pointerEvents = 'auto';

    const content = document.createElement('div');
    content.style.textAlign = 'center';
    content.style.padding = '24px';
    content.style.color = '#e2e8f0';
    content.style.fontFamily =
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    const messageEl = document.createElement('p');
    messageEl.textContent = message;
    messageEl.style.fontSize = '16px';
    messageEl.style.marginBottom = '12px';
    content.appendChild(messageEl);

    if (rule.bypassable) {
      const button = this.createBypassButton(el, rule);
      content.appendChild(button);
    }

    shadow.appendChild(content);
    htmlEl.appendChild(host);

    this.activeEffects.set(el, {
      action: 'blur',
      rule,
      cleanup: () => {
        htmlEl.style.filter = originalFilter;
        htmlEl.style.pointerEvents = originalPointerEvents;
        htmlEl.style.position = originalPosition;
        htmlEl.removeAttribute('data-focusos-action');
        if (host.parentNode) {
          host.parentNode.removeChild(host);
        }
      },
    });
  }

  /**
   * Cover an element with a full overlay (dark semi-transparent background).
   */
  private overlayElement(el: Element, message: string, rule: Rule): void {
    const htmlEl = el as HTMLElement;
    const originalPosition = htmlEl.style.position;

    htmlEl.setAttribute('data-focusos-action', 'overlay');

    // Ensure the element can serve as a positioning context
    if (getComputedStyle(htmlEl).position === 'static') {
      htmlEl.style.position = 'relative';
    }

    // Create shadow DOM overlay
    const { host, shadow } = createShadowContainer('overlay');
    host.style.position = 'absolute';
    host.style.top = '0';
    host.style.left = '0';
    host.style.width = '100%';
    host.style.height = '100%';
    host.style.display = 'flex';
    host.style.alignItems = 'center';
    host.style.justifyContent = 'center';
    host.style.zIndex = '999999';
    host.style.backgroundColor = 'rgba(15, 23, 42, 0.95)';
    host.style.borderRadius = '8px';

    const content = document.createElement('div');
    content.style.textAlign = 'center';
    content.style.padding = '32px';
    content.style.color = '#e2e8f0';
    content.style.fontFamily =
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    const messageEl = document.createElement('p');
    messageEl.textContent = message;
    messageEl.style.fontSize = '18px';
    messageEl.style.fontWeight = '500';
    messageEl.style.marginBottom = '16px';
    messageEl.style.margin = '0 0 16px 0';
    content.appendChild(messageEl);

    if (rule.bypassable) {
      const button = this.createBypassButton(el, rule);
      content.appendChild(button);
    }

    shadow.appendChild(content);
    htmlEl.appendChild(host);

    this.activeEffects.set(el, {
      action: 'overlay',
      rule,
      cleanup: () => {
        htmlEl.style.position = originalPosition;
        htmlEl.removeAttribute('data-focusos-action');
        if (host.parentNode) {
          host.parentNode.removeChild(host);
        }
      },
    });
  }

  /**
   * Redirect the page to a URL. Validates that the URL does not contain glob characters.
   */
  private redirectPage(url: string): void {
    // Reject URLs containing glob characters
    if (/[*?{}]/.test(url)) {
      logger.error('Invalid redirect target (contains glob characters):', url);
      return;
    }

    logger.info('Redirecting to:', url);
    window.location.href = url;
  }

  /**
   * Reapply a visual effect after a temporary reveal expires.
   */
  private reapplyEffect(element: Element, action: RuleAction, rule: Rule): void {
    const htmlEl = element as HTMLElement;
    // Mark the reapplied rule as non-bypassable since the bypass was already used
    const reapplyRule: Rule = { ...rule, bypassable: false };

    switch (action) {
      case 'hide':
        this.hideElement(element, reapplyRule);
        break;
      case 'blur':
        this.blurElement(htmlEl, reapplyRule.message || DEFAULT_MESSAGES.blur, reapplyRule);
        break;
      case 'overlay':
        this.overlayElement(htmlEl, reapplyRule.message || DEFAULT_MESSAGES.overlay, reapplyRule);
        break;
      default:
        break;
    }
  }

  /**
   * Create a "Reveal for 5 minutes" bypass button.
   * Dispatches a custom event that the content script entry point listens for.
   */
  private createBypassButton(element: Element, rule: Rule): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = 'Reveal for 5 minutes';
    button.style.padding = '8px 16px';
    button.style.fontSize = '14px';
    button.style.fontWeight = '500';
    button.style.color = '#cbd5e1';
    button.style.backgroundColor = 'rgba(51, 65, 85, 0.8)';
    button.style.border = '1px solid rgba(100, 116, 139, 0.5)';
    button.style.borderRadius = '6px';
    button.style.cursor = 'pointer';
    button.style.transition = 'background-color 0.2s';

    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = 'rgba(71, 85, 105, 0.9)';
    });
    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = 'rgba(51, 65, 85, 0.8)';
    });

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      const duration = rule.bypassDuration || DEFAULT_BYPASS_DURATION;

      // Dispatch custom event for the content script entry point to handle
      document.dispatchEvent(
        new CustomEvent(BYPASS_EVENT, {
          detail: {
            ruleId: rule.id,
            element,
            duration,
          },
        })
      );
    });

    return button;
  }
}
