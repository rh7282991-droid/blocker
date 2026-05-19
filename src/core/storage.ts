import type { UserPreferences, BypassState, StorageSchema, RedirectRule } from './types';
import {
  DEFAULT_PREFERENCES,
  DEFAULT_BYPASS_DURATION,
  STORAGE_VERSION,
} from './constants';

/**
 * Check if the chrome.storage API is available (not available in dev/test environments).
 */
function isChromeStorageAvailable(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    chrome.storage !== undefined &&
    chrome.storage.local !== undefined
  );
}

/**
 * StorageService provides a type-safe wrapper around chrome.storage.local.
 * Handles preferences, bypass states, and future schema migrations.
 */
export const StorageService = {
  /**
   * Get user preferences from storage, returning defaults if not set.
   * Ensures backward compatibility by filling in newer fields (e.g. redirectRules)
   * if they are missing from previously stored preferences.
   */
  async getPreferences(): Promise<UserPreferences> {
    if (!isChromeStorageAvailable()) {
      return { ...DEFAULT_PREFERENCES };
    }

    const result = await chrome.storage.local.get('preferences');
    const stored = result.preferences as UserPreferences | undefined;

    if (!stored) {
      return { ...DEFAULT_PREFERENCES };
    }

    // Backward compatibility: fill in fields added in later versions
    return {
      ...DEFAULT_PREFERENCES,
      ...stored,
      redirectRules: stored.redirectRules ?? [],
    };
  },

  /**
   * Merge partial preferences with existing stored preferences.
   */
  async setPreferences(partial: Partial<UserPreferences>): Promise<void> {
    if (!isChromeStorageAvailable()) {
      return;
    }

    const current = await this.getPreferences();
    const updated: UserPreferences = { ...current, ...partial };

    await chrome.storage.local.set({ preferences: updated });
  },

  /**
   * Get all current bypass states from storage.
   */
  async getBypasses(): Promise<BypassState[]> {
    if (!isChromeStorageAvailable()) {
      return [];
    }

    const result = await chrome.storage.local.get('bypasses');
    const stored = result.bypasses as BypassState[] | undefined;

    return stored ?? [];
  },

  /**
   * Add a bypass for a rule with an optional custom duration.
   * Defaults to DEFAULT_BYPASS_DURATION if no duration specified.
   */
  async addBypass(ruleId: string, duration?: number): Promise<void> {
    if (!isChromeStorageAvailable()) {
      return;
    }

    const bypasses = await this.getBypasses();
    const expiresAt = Date.now() + (duration ?? DEFAULT_BYPASS_DURATION);

    // Replace existing bypass for this rule, or add new one
    const filtered = bypasses.filter((b) => b.ruleId !== ruleId);
    filtered.push({ ruleId, expiresAt });

    await chrome.storage.local.set({ bypasses: filtered });
  },

  /**
   * Remove a bypass for a specific rule.
   */
  async removeBypass(ruleId: string): Promise<void> {
    if (!isChromeStorageAvailable()) {
      return;
    }

    const bypasses = await this.getBypasses();
    const filtered = bypasses.filter((b) => b.ruleId !== ruleId);

    await chrome.storage.local.set({ bypasses: filtered });
  },

  /**
   * Remove all expired bypass entries from storage.
   */
  async cleanExpiredBypasses(): Promise<void> {
    if (!isChromeStorageAvailable()) {
      return;
    }

    const bypasses = await this.getBypasses();
    const now = Date.now();
    const active = bypasses.filter((b) => b.expiresAt > now);

    await chrome.storage.local.set({ bypasses: active });
  },

  /**
   * Check if a rule is currently bypassed (bypass exists and has not expired).
   */
  async isRuleBypassed(ruleId: string): Promise<boolean> {
    if (!isChromeStorageAvailable()) {
      return false;
    }

    const bypasses = await this.getBypasses();
    const now = Date.now();
    const bypass = bypasses.find((b) => b.ruleId === ruleId);

    return bypass !== undefined && bypass.expiresAt > now;
  },

  /**
   * Get all redirect rules from storage.
   */
  async getRedirectRules(): Promise<RedirectRule[]> {
    const prefs = await this.getPreferences();
    return prefs.redirectRules ?? [];
  },

  /**
   * Add a new redirect rule. Generates a unique id and timestamp.
   */
  async addRedirectRule(
    rule: Omit<RedirectRule, 'id' | 'createdAt'>
  ): Promise<RedirectRule> {
    const newRule: RedirectRule = {
      ...rule,
      id: `redirect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    };
    const current = await this.getRedirectRules();
    await this.setPreferences({ redirectRules: [...current, newRule] });
    return newRule;
  },

  /**
   * Update an existing redirect rule by id.
   */
  async updateRedirectRule(rule: RedirectRule): Promise<void> {
    const current = await this.getRedirectRules();
    const updated = current.map((r) => (r.id === rule.id ? rule : r));
    await this.setPreferences({ redirectRules: updated });
  },

  /**
   * Delete a redirect rule by id.
   */
  async deleteRedirectRule(id: string): Promise<void> {
    const current = await this.getRedirectRules();
    const filtered = current.filter((r) => r.id !== id);
    await this.setPreferences({ redirectRules: filtered });
  },

  /**
   * Toggle the enabled state of a redirect rule.
   */
  async toggleRedirectRule(id: string): Promise<void> {
    const current = await this.getRedirectRules();
    const updated = current.map((r) =>
      r.id === id ? { ...r, enabled: !r.enabled } : r
    );
    await this.setPreferences({ redirectRules: updated });
  },

  /**
   * Register a callback for preference changes via chrome.storage.onChanged.
   */
  onPreferencesChanged(callback: (prefs: UserPreferences) => void): void {
    if (!isChromeStorageAvailable()) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.preferences?.newValue) {
        callback(changes.preferences.newValue as UserPreferences);
      }
    });
  },

  /**
   * Run storage schema migrations if needed.
   * Checks the stored version and applies migrations sequentially.
   * Placeholder for future schema upgrades.
   */
  async migrate(): Promise<void> {
    if (!isChromeStorageAvailable()) {
      return;
    }

    const result = await chrome.storage.local.get('version');
    const storedVersion = (result.version as number | undefined) ?? 0;

    if (storedVersion < STORAGE_VERSION) {
      // Future migrations would be applied here in sequence:
      // if (storedVersion < 1) { applyMigrationV1(); }
      // if (storedVersion < 2) { applyMigrationV2(); }

      // Set initial schema if no version exists
      if (storedVersion === 0) {
        const schema: StorageSchema = {
          preferences: DEFAULT_PREFERENCES,
          bypasses: [],
          version: STORAGE_VERSION,
        };
        await chrome.storage.local.set(schema);
      }

      // Always update version to current
      await chrome.storage.local.set({ version: STORAGE_VERSION });
    }
  },
};
