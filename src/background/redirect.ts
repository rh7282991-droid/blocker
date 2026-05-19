/**
 * Redirect engine for FocusOS.
 *
 * Watches tab navigation and redirects URLs that match user-defined
 * redirect rules to user-defined target URLs.
 *
 * Design notes:
 * - Runs in the background service worker, NOT in a content script,
 *   so the redirect happens before the page renders -> no flash.
 * - Uses chrome.tabs.onUpdated with status 'loading' for earliest possible
 *   redirect after navigation starts.
 * - Maintains an in-memory cache of recent redirects per tab to prevent
 *   infinite redirect loops (A->B and B->A scenarios).
 * - Skips internal browser pages (chrome://, chrome-extension://, about:, etc).
 */

import { StorageService } from '../core/storage';
import type { RedirectRule } from '../core/types';
import { logger } from '../lib/logger';

/**
 * Tracks recent redirects per tab to prevent infinite loops.
 * Key: tabId, Value: { url, timestamp }
 */
const recentRedirects = new Map<number, { url: string; timestamp: number }>();

/**
 * Loop protection window (ms). If the same tab is redirected to the same URL
 * twice within this window, the second redirect is skipped.
 */
const LOOP_PROTECTION_WINDOW_MS = 5000;

/**
 * URL schemes that should never be redirected (browser internals, extensions, etc).
 */
const SKIP_SCHEMES = ['chrome:', 'chrome-extension:', 'about:', 'edge:', 'brave:', 'moz-extension:', 'file:'];

/**
 * Normalize a target URL — ensure it has a protocol scheme.
 * "google.com" -> "https://google.com"
 * "https://google.com" -> "https://google.com"
 */
export function normalizeTargetUrl(target: string): string {
  const trimmed = target.trim();
  if (!trimmed) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Convert a user-friendly source pattern into a RegExp.
 *
 * Accepts:
 *   - bare domain: "facebook.com" -> matches facebook.com and *.facebook.com on any path
 *   - wildcard pattern: "*.facebook.com/reels*" -> "*" becomes ".*"
 *   - full URL with scheme: "https://facebook.com/foo"
 *
 * Matching is case-insensitive.
 */
export function patternToRegex(pattern: string): RegExp | null {
  const trimmed = pattern.trim().toLowerCase();
  if (!trimmed) return null;

  // If pattern includes a scheme or wildcard, treat literally with * -> .*
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed);
  const hasWildcard = trimmed.includes('*');

  if (hasScheme || hasWildcard) {
    // Escape regex special chars except *, then convert * -> .*
    const escaped = trimmed
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    try {
      return new RegExp(`^${escaped}`, 'i');
    } catch {
      return null;
    }
  }

  // Bare domain: match http(s)://[anything.]domain[/...]
  const escaped = trimmed.replace(/[.+?^${}()|[\]\\*]/g, '\\$&');
  try {
    return new RegExp(`^https?:\\/\\/([^/]+\\.)?${escaped}(\\/|$|\\?|#)`, 'i');
  } catch {
    return null;
  }
}

/**
 * Find the first enabled redirect rule whose source pattern matches the given URL.
 * Returns null if no rule matches.
 */
export function findMatchingRule(
  url: string,
  rules: RedirectRule[]
): RedirectRule | null {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const regex = patternToRegex(rule.sourcePattern);
    if (regex && regex.test(url)) {
      return rule;
    }
  }
  return null;
}

/**
 * Determine if a URL should be skipped (browser internals, etc).
 */
function shouldSkipUrl(url: string): boolean {
  if (!url) return true;
  return SKIP_SCHEMES.some((scheme) => url.startsWith(scheme));
}

/**
 * Check loop protection cache. Returns true if this redirect should be skipped
 * because the same tab was redirected to the same URL very recently.
 */
function isLoopRedirect(tabId: number, targetUrl: string): boolean {
  const recent = recentRedirects.get(tabId);
  if (!recent) return false;
  const fresh = Date.now() - recent.timestamp < LOOP_PROTECTION_WINDOW_MS;
  return fresh && recent.url === targetUrl;
}

/**
 * Record a redirect in the loop protection cache.
 */
function recordRedirect(tabId: number, targetUrl: string): void {
  recentRedirects.set(tabId, { url: targetUrl, timestamp: Date.now() });
}

/**
 * Periodically clear stale entries from the loop protection cache.
 */
function pruneRecentRedirects(): void {
  const now = Date.now();
  for (const [tabId, entry] of recentRedirects.entries()) {
    if (now - entry.timestamp > LOOP_PROTECTION_WINDOW_MS * 2) {
      recentRedirects.delete(tabId);
    }
  }
}

/**
 * Main entrypoint: check a tab navigation and redirect if a rule matches.
 * Called from chrome.tabs.onUpdated in background/index.ts.
 *
 * Returns true if a redirect was performed.
 */
export async function checkAndRedirect(
  tabId: number,
  url: string
): Promise<boolean> {
  if (shouldSkipUrl(url)) return false;

  const prefs = await StorageService.getPreferences();

  // Master switch: if extension is globally disabled, no redirects.
  if (!prefs.enabled) return false;

  const rules = prefs.redirectRules ?? [];
  if (rules.length === 0) return false;

  const match = findMatchingRule(url, rules);
  if (!match) return false;

  const target = normalizeTargetUrl(match.redirectTo);
  if (!target) return false;

  // Self-redirect prevention: if the source pattern would match the target,
  // skip - this would just loop on the new URL too.
  const targetRegex = patternToRegex(match.sourcePattern);
  if (targetRegex && targetRegex.test(target)) {
    logger.warn('Skipping self-redirect:', match.sourcePattern, '->', target);
    return false;
  }

  // Loop protection
  if (isLoopRedirect(tabId, target)) {
    logger.warn('Skipping potential redirect loop on tab', tabId, '->', target);
    return false;
  }

  try {
    await chrome.tabs.update(tabId, { url: target });
    recordRedirect(tabId, target);
    pruneRecentRedirects();
    logger.info(`Redirected tab ${tabId}: ${url} -> ${target}`);
    return true;
  } catch (err) {
    logger.error('Failed to redirect tab:', err);
    return false;
  }
}

/**
 * Clean up cache when a tab is closed.
 */
export function onTabRemoved(tabId: number): void {
  recentRedirects.delete(tabId);
}
