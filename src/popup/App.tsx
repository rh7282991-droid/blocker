import React, { useState, useEffect } from 'react';
import type { SupportedSite } from '../core/types';
import { URL_PATTERNS, SUPPORTED_SITES } from '../core/constants';
import { StorageService } from '../core/storage';

function detectSite(url: string): SupportedSite | null {
  for (const site of SUPPORTED_SITES) {
    if (URL_PATTERNS[site].test(url)) {
      return site;
    }
  }
  return null;
}

function getSiteDisplayName(site: SupportedSite): string {
  const names: Record<SupportedSite, string> = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    youtube: 'YouTube',
  };
  return names[site];
}

export default function App() {
  const [enabled, setEnabled] = useState(true);
  const [currentSite, setCurrentSite] = useState<SupportedSite | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        const prefs = await StorageService.getPreferences();
        setEnabled(prefs.enabled);

        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        if (tab?.url) {
          setCurrentSite(detectSite(tab.url));
        }
      } catch {
        // Fallback for environments without chrome APIs
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  async function handleToggle() {
    const newState = !enabled;
    setEnabled(newState);
    try {
      await chrome.runtime.sendMessage({ type: 'SET_ENABLED', payload: { enabled: newState } });
    } catch {
      // Fallback: write directly
      await StorageService.setPreferences({ enabled: newState });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-900">
        <div className="text-slate-400 text-sm tracking-wide">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-between h-full p-6 bg-slate-900 text-white">
      {/* Header */}
      <div className="flex flex-col items-center gap-2 pt-4">
        <div className="flex items-center gap-2">
          <svg
            className="w-8 h-8 text-teal-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
            />
          </svg>
          <h1 className="text-2xl font-light tracking-wider text-slate-100">
            FocusOS
          </h1>
        </div>
        <p className="text-xs text-slate-500 tracking-wide">
          Attention protection
        </p>
      </div>

      {/* Toggle Section */}
      <div className="flex flex-col items-center gap-4">
        <button
          onClick={handleToggle}
          className={`
            relative w-20 h-10 rounded-full transition-colors duration-300 ease-in-out
            focus:outline-none focus:ring-2 focus:ring-teal-400/50
            ${enabled ? 'bg-teal-500' : 'bg-slate-600'}
          `}
          aria-label={enabled ? 'Disable protection' : 'Enable protection'}
        >
          <span
            className={`
              absolute top-1 w-8 h-8 rounded-full bg-white shadow-md
              transition-transform duration-300 ease-in-out
              ${enabled ? 'translate-x-11' : 'translate-x-1'}
            `}
          />
        </button>
        <p
          className={`
            text-sm font-medium tracking-wide transition-colors duration-300
            ${enabled ? 'text-teal-300' : 'text-slate-400'}
          `}
        >
          {enabled ? 'Protection Active' : 'Protection Paused'}
        </p>
      </div>

      {/* Site Status */}
      <div className="pb-6">
        {currentSite ? (
          <div className="flex items-center gap-2">
            <span
              className={`
                w-2 h-2 rounded-full
                ${enabled ? 'bg-teal-400 animate-pulse' : 'bg-slate-500'}
              `}
            />
            <p className="text-sm text-slate-300 tracking-wide">
              {enabled
                ? `Protecting ${getSiteDisplayName(currentSite)}`
                : `${getSiteDisplayName(currentSite)} unprotected`}
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500 tracking-wide">
            Not active on this site
          </p>
        )}
      </div>
    </div>
  );
}
