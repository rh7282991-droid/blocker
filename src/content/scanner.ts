/**
 * Scanner - Dual-observer content scanner for FocusOS.
 * Uses MutationObserver to detect new DOM elements and IntersectionObserver
 * to filter only visible elements before processing.
 */

import type { ScannerConfig } from '../core/types';
import { debounce } from '../lib/debounce';
import {
  safeQuerySelectorAll,
  matchesAnySelector,
  isProcessed,
} from '../lib/dom-utils';
import { logger } from '../lib/logger';

type ScanCallback = (elements: Element[]) => void;

export class Scanner {
  private config: ScannerConfig;
  private mutationObserver: MutationObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private onElementsFound: ScanCallback;
  private pendingElements: Set<Element> = new Set();
  private isRunning = false;
  private debouncedFlush: (() => void) & { cancel: () => void };

  constructor(config: ScannerConfig, onElementsFound: ScanCallback) {
    this.config = config;
    this.onElementsFound = onElementsFound;
    this.debouncedFlush = debounce(() => this.flushPending(), config.debounceMs);
  }

  /**
   * Start scanning: find initial feed containers and attach observers.
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    logger.info('Scanner starting for site:', this.config.site);

    // Set up IntersectionObserver to detect when elements become visible
    this.intersectionObserver = new IntersectionObserver(
      (entries) => this.handleIntersection(entries),
      { threshold: 0 }
    );

    // Set up MutationObserver on document.body
    this.mutationObserver = new MutationObserver((mutations) =>
      this.handleMutations(mutations)
    );

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: this.config.observeSubtree,
    });

    // Scan for initial elements already in the DOM
    this.scanExistingElements();
  }

  /**
   * Stop scanning: disconnect observers but keep instance reusable.
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logger.info('Scanner stopping for site:', this.config.site);

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }

    this.debouncedFlush.cancel();
    this.pendingElements.clear();
  }

  /**
   * Destroy: full cleanup, release all references for GC.
   */
  destroy(): void {
    this.stop();
    this.mutationObserver = null;
    this.intersectionObserver = null;
    logger.info('Scanner destroyed for site:', this.config.site);
  }

  /**
   * Scan existing elements in the DOM that match configured selectors.
   */
  private scanExistingElements(): void {
    for (const selector of this.config.selectors) {
      const elements = safeQuerySelectorAll(document, selector);
      for (const el of elements) {
        this.observeElement(el);
      }
    }
  }

  /**
   * Handle MutationObserver callbacks: filter added nodes for matching elements.
   */
  private handleMutations(mutations: MutationRecord[]): void {
    for (const mutation of mutations) {
      for (let i = 0; i < mutation.addedNodes.length; i++) {
        const node = mutation.addedNodes[i];
        if (node.nodeType !== Node.ELEMENT_NODE) {
          continue;
        }

        const element = node as Element;

        // Check if the added element itself matches
        if (matchesAnySelector(element, this.config.selectors)) {
          this.observeElement(element);
        }

        // Check descendants of the added element
        for (const selector of this.config.selectors) {
          const children = safeQuerySelectorAll(element, selector);
          for (const child of children) {
            this.observeElement(child);
          }
        }
      }
    }
  }

  /**
   * Handle IntersectionObserver callbacks: add visible elements to pending batch.
   */
  private handleIntersection(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      if (entry.intersectionRatio > 0) {
        this.pendingElements.add(entry.target);

        // Unobserve once visible - we only need to detect first visibility
        if (this.intersectionObserver) {
          this.intersectionObserver.unobserve(entry.target);
        }
      }
    }

    if (this.pendingElements.size > 0) {
      this.debouncedFlush();
    }
  }

  /**
   * Observe an element with IntersectionObserver if not already processed.
   */
  private observeElement(el: Element): void {
    if (isProcessed(el)) {
      return;
    }

    if (this.intersectionObserver) {
      this.intersectionObserver.observe(el);
    }
  }

  /**
   * Flush pending visible elements to the callback.
   */
  private flushPending(): void {
    if (this.pendingElements.size === 0) {
      return;
    }

    const elements = Array.from(this.pendingElements);
    this.pendingElements.clear();

    logger.debug('Scanner flushing', elements.length, 'elements');
    this.onElementsFound(elements);
  }
}
