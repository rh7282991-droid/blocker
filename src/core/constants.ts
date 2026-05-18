import type {
  SupportedSite,
  ScannerConfig,
  RuleAction,
  UserPreferences,
  Rule,
} from './types';

/**
 * All supported social media sites
 */
export const SUPPORTED_SITES: SupportedSite[] = [
  'facebook',
  'instagram',
  'youtube',
];

/**
 * DOM scanner configuration per site with real feed selectors
 */
export const SITE_CONFIGS: Record<SupportedSite, ScannerConfig> = {
  facebook: {
    site: 'facebook',
    selectors: ['[role="feed"]', '[data-pagelet="FeedUnit"]', '.x1lliihq'],
    debounceMs: 150,
    observeSubtree: true,
  },
  instagram: {
    site: 'instagram',
    selectors: ['article._aagw', 'main[role="main"] article', '._aabd'],
    debounceMs: 150,
    observeSubtree: true,
  },
  youtube: {
    site: 'youtube',
    selectors: [
      '#contents ytd-rich-item-renderer',
      'ytd-reel-shelf-renderer',
      '[is-shorts]',
      'ytd-shorts',
    ],
    debounceMs: 200,
    observeSubtree: true,
  },
};

/**
 * URL patterns for detecting which site is active
 */
export const URL_PATTERNS: Record<SupportedSite, RegExp> = {
  facebook: /^https?:\/\/(www\.)?facebook\.com/,
  instagram: /^https?:\/\/(www\.)?instagram\.com/,
  youtube: /^https?:\/\/(www\.)?youtube\.com/,
};

/**
 * Default bypass duration: 5 minutes in milliseconds
 */
export const DEFAULT_BYPASS_DURATION = 5 * 60 * 1000;

/**
 * Default calm messages per action type
 */
export const DEFAULT_MESSAGES: Record<RuleAction, string> = {
  overlay: 'Feed hidden to protect your focus',
  blur: 'Content softened to reduce distraction',
  hide: '',
  redirect: '',
};

/**
 * Current storage schema version for migrations
 */
export const STORAGE_VERSION = 1;

/**
 * Default user preferences
 */
export const DEFAULT_PREFERENCES: UserPreferences = {
  enabled: true,
  sites: {
    facebook: true,
    instagram: true,
    youtube: true,
  },
  rules: [],
  whitelist: [],
};

/**
 * Default rules applied on first install
 */
export const DEFAULT_RULES: Rule[] = [
  {
    id: 'default-facebook-feed',
    site: 'facebook',
    urlPattern: 'https://www.facebook.com/*',
    selectors: ['[role="feed"]'],
    action: 'overlay',
    message: DEFAULT_MESSAGES.overlay,
    bypassable: true,
    bypassDuration: DEFAULT_BYPASS_DURATION,
  },
  {
    id: 'default-instagram-feed',
    site: 'instagram',
    urlPattern: 'https://www.instagram.com/*',
    selectors: ['article._aagw', 'main[role="main"] article'],
    action: 'overlay',
    message: DEFAULT_MESSAGES.overlay,
    bypassable: true,
    bypassDuration: DEFAULT_BYPASS_DURATION,
  },
  {
    id: 'default-youtube-shorts',
    site: 'youtube',
    urlPattern: 'https://www.youtube.com/*',
    selectors: ['ytd-reel-shelf-renderer', '[is-shorts]', 'ytd-shorts'],
    action: 'hide',
    message: DEFAULT_MESSAGES.hide,
    bypassable: false,
  },
];
