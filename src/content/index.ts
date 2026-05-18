/**
 * FocusOS Content Script Entry Point
 *
 * Wires together the scanner, rule engine, and injector pipeline.
 * Detects the current site, loads preferences, and manages lifecycle.
 */

import type { SupportedSite, UserPreferences, RuleResult, Rule } from '../core/types';
import { URL_PATTERNS, SITE_CONFIGS, DEFAULT_RULES } from '../core/constants';
import { StorageService } from '../core/storage';
import { RuleEngine } from '../core/rule-engine';
import { Scanner } from './scanner';
import { Injector, BYPASS_EVENT } from './injector';
import { logger } from '../lib/logger';
import { markProcessed } from '../lib/dom-utils';

/**
 * Detect which supported site the current page belongs to.
 * Returns null if the site is not supported.
 */
function detectSite(): SupportedSite | null {
  const url = window.location.href;
  for (const [site, pattern] of Object.entries(URL_PATTERNS)) {
    if (pattern.test(url)) {
      return site as SupportedSite;
    }
  }
  return null;
}

/**
 * Main content script initialization as a self-executing async IIFE.
 */
(async function main() {
  // 1. Detect current site
  const site = detectSite();
  if (!site) {
    logger.debug('Not a supported site, exiting content script');
    return;
  }

  logger.info('FocusOS content script initializing for:', site);

  // 2. Load user preferences
  let preferences: UserPreferences;
  try {
    preferences = await StorageService.getPreferences();
  } catch (err) {
    logger.error('Failed to load preferences:', err);
    return;
  }

  // 3. Check if protection is enabled globally and for this site
  if (!preferences.enabled || !preferences.sites[site]) {
    logger.info('Protection disabled for site:', site);
    setupDynamicToggle(site);
    return;
  }

  // 4. Start the pipeline
  const pipeline = createPipeline(site, preferences);
  pipeline.start();

  // 5. Listen for storage changes to dynamically enable/disable
  StorageService.onPreferencesChanged((newPrefs: UserPreferences) => {
    const shouldBeActive = newPrefs.enabled && newPrefs.sites[site];
    const isActive = pipeline.isActive();

    if (shouldBeActive && !isActive) {
      logger.info('Re-enabling protection for:', site);
      pipeline.updateRules(newPrefs.rules);
      pipeline.start();
    } else if (!shouldBeActive && isActive) {
      logger.info('Disabling protection for:', site);
      pipeline.stop();
    } else if (shouldBeActive && isActive) {
      // Rules may have changed
      pipeline.updateRules(newPrefs.rules);
    }
  });

  // 6. Listen for bypass custom events from injector overlays
  document.addEventListener(BYPASS_EVENT, ((event: CustomEvent) => {
    const { ruleId, element, duration } = event.detail as {
      ruleId: string;
      element: Element;
      duration: number;
    };

    logger.info('Bypass requested for rule:', ruleId, 'duration:', duration);

    // Store bypass in storage
    StorageService.addBypass(ruleId, duration).catch((err) => {
      logger.error('Failed to save bypass:', err);
    });

    // Temporarily reveal the element
    pipeline.revealElement(element, duration);
  }) as EventListener);

  // 7. Clean up on page unload
  window.addEventListener('beforeunload', () => {
    pipeline.destroy();
  });
})();

/**
 * Set up a listener that starts the pipeline if preferences change to enable the site.
 * Used when the site is initially disabled.
 */
function setupDynamicToggle(site: SupportedSite): void {
  let pipeline: ReturnType<typeof createPipeline> | null = null;
  let bypassListenerAdded = false;

  StorageService.onPreferencesChanged((newPrefs: UserPreferences) => {
    const shouldBeActive = newPrefs.enabled && newPrefs.sites[site];

    if (shouldBeActive && (!pipeline || !pipeline.isActive())) {
      logger.info('Enabling protection for:', site);
      pipeline = createPipeline(site, newPrefs);
      pipeline.start();

      // Set up bypass listener only once
      if (!bypassListenerAdded) {
        bypassListenerAdded = true;
        document.addEventListener(BYPASS_EVENT, ((event: CustomEvent) => {
          const { ruleId, element, duration } = event.detail as {
            ruleId: string;
            element: Element;
            duration: number;
          };

          StorageService.addBypass(ruleId, duration).catch((err) => {
            logger.error('Failed to save bypass:', err);
          });

          if (pipeline) {
            pipeline.revealElement(element, duration);
          }
        }) as EventListener);
      }
    } else if (!shouldBeActive && pipeline && pipeline.isActive()) {
      logger.info('Disabling protection for:', site);
      pipeline.stop();
    }
  });
}

/**
 * Create the scanner -> rule engine -> injector pipeline.
 */
function createPipeline(site: SupportedSite, preferences: UserPreferences) {
  const config = SITE_CONFIGS[site];
  const rules =
    preferences.rules.length > 0
      ? preferences.rules.filter((r) => r.site === site)
      : DEFAULT_RULES.filter((r) => r.site === site);

  const ruleEngine = new RuleEngine(rules);
  const injector = new Injector();
  let scanner: Scanner | null = null;
  let active = false;

  function onElementsFound(elements: Element[]): void {
    logger.group('Processing elements');
    logger.debug('Elements to process:', elements.length);

    // Batch: read the full bypass list once per flush, then iterate synchronously
    StorageService.getBypasses()
      .then((bypasses) => {
        const now = Date.now();
        const bypassedRuleIds = new Set(
          bypasses.filter((b) => b.expiresAt > now).map((b) => b.ruleId)
        );

        for (const element of elements) {
          const results: RuleResult[] = ruleEngine.evaluateElement(element, site);

          if (results.length > 0) {
            const result = results[0];

            if (!bypassedRuleIds.has(result.rule.id)) {
              injector.applyAction(element, result.action, result.rule);
            } else {
              markProcessed(element);
            }
          } else {
            markProcessed(element);
          }
        }
      })
      .catch((err) => {
        logger.error('Error fetching bypass states:', err);
        // Apply actions anyway on error (fail-closed)
        for (const element of elements) {
          const results: RuleResult[] = ruleEngine.evaluateElement(element, site);

          if (results.length > 0) {
            const result = results[0];
            injector.applyAction(element, result.action, result.rule);
          } else {
            markProcessed(element);
          }
        }
      });

    logger.groupEnd();
  }

  return {
    start(): void {
      if (active) return;
      scanner = new Scanner(config, onElementsFound);
      scanner.start();
      active = true;
    },

    stop(): void {
      if (!active) return;
      if (scanner) {
        scanner.stop();
      }
      injector.removeAllEffects();
      active = false;
    },

    destroy(): void {
      if (scanner) {
        scanner.destroy();
        scanner = null;
      }
      injector.removeAllEffects();
      active = false;
    },

    isActive(): boolean {
      return active;
    },

    updateRules(newRules: Rule[]): void {
      const siteRules =
        newRules.length > 0
          ? newRules.filter((r) => r.site === site)
          : DEFAULT_RULES.filter((r) => r.site === site);
      ruleEngine.updateRules(siteRules);
    },

    revealElement(element: Element, duration: number): void {
      injector.revealTemporarily(element, duration);
    },
  };
}
