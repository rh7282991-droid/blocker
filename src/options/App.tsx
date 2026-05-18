import React, { useState, useEffect } from 'react';
import type { SupportedSite, UserPreferences } from '../core/types';
import { SUPPORTED_SITES } from '../core/constants';
import { StorageService } from '../core/storage';

function getSiteDisplayName(site: SupportedSite): string {
  const names: Record<SupportedSite, string> = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    youtube: 'YouTube',
  };
  return names[site];
}

export default function App() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);

  useEffect(() => {
    async function load() {
      const prefs = await StorageService.getPreferences();
      setPreferences(prefs);
    }
    load();
  }, []);

  async function handleSiteToggle(site: SupportedSite) {
    if (!preferences) return;

    const updatedSites = {
      ...preferences.sites,
      [site]: !preferences.sites[site],
    };

    const updated: UserPreferences = { ...preferences, sites: updatedSites };
    setPreferences(updated);
    await StorageService.setPreferences({ sites: updatedSites });
  }

  if (!preferences) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <p className="text-slate-400 text-sm tracking-wide">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white py-12 px-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-light tracking-wider text-slate-100">
            FocusOS Settings
          </h1>
          <p className="text-sm text-slate-500 tracking-wide">
            Configure your attention protection preferences
          </p>
        </div>

        {/* Protected Sites */}
        <section className="bg-slate-800 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-medium tracking-wide text-slate-200">
            Protected Sites
          </h2>
          <p className="text-sm text-slate-400">
            Toggle protection for each supported site.
          </p>
          <div className="space-y-3 pt-2">
            {SUPPORTED_SITES.map((site) => (
              <div
                key={site}
                className="flex items-center justify-between py-2 px-3 rounded-md bg-slate-700/50"
              >
                <span className="text-sm text-slate-200 tracking-wide">
                  {getSiteDisplayName(site)}
                </span>
                <button
                  onClick={() => handleSiteToggle(site)}
                  className={`
                    relative w-12 h-6 rounded-full transition-colors duration-200
                    focus:outline-none focus:ring-2 focus:ring-teal-400/50
                    ${preferences.sites[site] ? 'bg-teal-500' : 'bg-slate-600'}
                  `}
                  aria-label={`Toggle ${getSiteDisplayName(site)} protection`}
                >
                  <span
                    className={`
                      absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm
                      transition-transform duration-200
                      ${preferences.sites[site] ? 'translate-x-6' : 'translate-x-0.5'}
                    `}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Rules */}
        <section className="bg-slate-800 rounded-lg p-6 space-y-3">
          <h2 className="text-lg font-medium tracking-wide text-slate-200">
            Rules
          </h2>
          <p className="text-sm text-slate-400">
            Custom rules coming in V2. Default protection rules are active.
          </p>
        </section>

        {/* Bypass Settings */}
        <section className="bg-slate-800 rounded-lg p-6 space-y-3">
          <h2 className="text-lg font-medium tracking-wide text-slate-200">
            Bypass Settings
          </h2>
          <p className="text-sm text-slate-400">
            When you bypass a rule, protection pauses temporarily.
          </p>
          <div className="flex items-center gap-3 pt-2 px-3 py-2 rounded-md bg-slate-700/50">
            <span className="text-sm text-slate-300">Default duration:</span>
            <span className="text-sm font-medium text-teal-300">5 minutes</span>
          </div>
        </section>

        {/* About */}
        <section className="bg-slate-800 rounded-lg p-6 space-y-3">
          <h2 className="text-lg font-medium tracking-wide text-slate-200">
            About
          </h2>
          <div className="space-y-1">
            <p className="text-sm text-slate-400">
              FocusOS v1.0.0
            </p>
            <p className="text-sm text-slate-500">
              Local-first attention protection
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
