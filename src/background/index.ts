import { StorageService } from '../core/storage';
import { DEFAULT_RULES, URL_PATTERNS, SUPPORTED_SITES } from '../core/constants';
import type { ExtensionMessage, SupportedSite } from '../core/types';

/**
 * FocusOS Background Service Worker
 * Handles extension lifecycle, tab monitoring, message routing, and bypass cleanup.
 */

const CLEANUP_ALARM_NAME = 'focusos-cleanup-bypasses';
const BADGE_COLOR = '#14b8a6'; // teal-500

/**
 * Detect if a URL belongs to a supported site.
 */
function detectSite(url: string): SupportedSite | null {
  for (const site of SUPPORTED_SITES) {
    if (URL_PATTERNS[site].test(url)) {
      return site;
    }
  }
  return null;
}

/**
 * Update badge based on tab URL and extension enabled state.
 */
async function updateBadge(tabId: number, url: string): Promise<void> {
  const prefs = await StorageService.getPreferences();
  const site = detectSite(url);

  if (prefs.enabled && site && prefs.sites[site]) {
    await chrome.action.setBadgeText({ text: 'ON', tabId });
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId });
  } else {
    await chrome.action.setBadgeText({ text: '', tabId });
  }
}

/**
 * Extension install/update handler.
 */
chrome.runtime.onInstalled.addListener(async () => {
  await StorageService.migrate();
  await StorageService.setPreferences({ rules: DEFAULT_RULES });

  // Create periodic alarm for bypass cleanup
  await chrome.alarms.create(CLEANUP_ALARM_NAME, { periodInMinutes: 5 });
});

/**
 * Tab update handler - update badge when navigating.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    updateBadge(tabId, tab.url);
  }
});

/**
 * Message handler for popup, options, and content script communication.
 */
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    handleMessage(message, sendResponse);
    // Return true to indicate async response
    return true;
  }
);

async function handleMessage(
  message: ExtensionMessage,
  sendResponse: (response: unknown) => void
): Promise<void> {
  switch (message.type) {
    case 'GET_STATUS': {
      const prefs = await StorageService.getPreferences();
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      const site = currentTab?.url ? detectSite(currentTab.url) : null;
      sendResponse({ enabled: prefs.enabled, site });
      break;
    }

    case 'SET_ENABLED': {
      await StorageService.setPreferences({ enabled: message.payload.enabled });
      sendResponse({ success: true });
      break;
    }

    case 'GET_PREFERENCES': {
      const prefs = await StorageService.getPreferences();
      sendResponse(prefs);
      break;
    }

    case 'BYPASS_RULE': {
      await StorageService.addBypass(message.payload.ruleId, message.payload.duration);
      sendResponse({ success: true });
      break;
    }
  }
}

/**
 * Alarm handler for periodic bypass cleanup.
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === CLEANUP_ALARM_NAME) {
    await StorageService.cleanExpiredBypasses();
  }
});
