/**
 * Core type definitions for FocusOS Chrome Extension
 */

// Supported social media sites
export type SupportedSite = 'facebook' | 'instagram' | 'youtube';

// Actions that can be applied to matched content
export type RuleAction = 'redirect' | 'hide' | 'blur' | 'overlay';

// A rule defines what to match and how to handle it
export interface Rule {
  id: string;
  site: SupportedSite;
  urlPattern: string;
  selectors: string[];
  action: RuleAction;
  message?: string;
  bypassable?: boolean;
  bypassDuration?: number;
  redirectTarget?: string;
}

// Extensible condition type for conditional rules (V2/V3)
export interface RuleCondition {
  type: string;
  value: unknown;
}

// A rule with additional conditions for advanced matching
export interface ConditionalRule extends Rule {
  conditions: RuleCondition[];
}

// Result of evaluating a rule against a DOM element
export interface RuleResult {
  matched: boolean;
  action: RuleAction;
  element: Element;
  rule: Rule;
}

// User preferences for the extension
export interface UserPreferences {
  enabled: boolean;
  sites: Record<SupportedSite, boolean>;
  rules: Rule[];
  whitelist: string[];
}

// Configuration for the content scanner per site
export interface ScannerConfig {
  site: SupportedSite;
  selectors: string[];
  debounceMs: number;
  observeSubtree: boolean;
}

// State of a temporary bypass for a rule
export interface BypassState {
  ruleId: string;
  expiresAt: number;
}

// Schema for chrome.storage.local data
export interface StorageSchema {
  preferences: UserPreferences;
  bypasses: BypassState[];
  version: number;
}

// Extension messaging types using discriminated unions
export type ExtensionMessage =
  | { type: 'GET_STATUS' }
  | { type: 'SET_ENABLED'; payload: { enabled: boolean } }
  | { type: 'GET_PREFERENCES' }
  | { type: 'BYPASS_RULE'; payload: { ruleId: string; duration?: number } };
