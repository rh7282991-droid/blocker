import React, { useState, useEffect } from 'react';
import type {
  SupportedSite,
  UserPreferences,
  RedirectRule,
} from '../core/types';
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

/**
 * Best-effort client-side validation of a source pattern.
 * Returns null if valid, or an error message string.
 */
function validateSource(source: string): string | null {
  const trimmed = source.trim();
  if (!trimmed) return 'Source cannot be empty';
  if (trimmed.length > 200) return 'Source is too long';
  if (/\s/.test(trimmed)) return 'Source cannot contain spaces';
  return null;
}

/**
 * Best-effort client-side validation of a redirect target URL.
 */
function validateTarget(target: string): string | null {
  const trimmed = target.trim();
  if (!trimmed) return 'Target cannot be empty';
  if (trimmed.length > 500) return 'Target is too long';
  if (/\s/.test(trimmed)) return 'Target cannot contain spaces';
  return null;
}

export default function App() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [newSource, setNewSource] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const prefs = await StorageService.getPreferences();
      setPreferences(prefs);
    }
    load();

    // Live-sync when preferences change elsewhere
    StorageService.onPreferencesChanged((newPrefs) => {
      setPreferences(newPrefs);
    });
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

  async function handleAddRedirectRule(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const sourceError = validateSource(newSource);
    if (sourceError) {
      setFormError(sourceError);
      return;
    }
    const targetError = validateTarget(newTarget);
    if (targetError) {
      setFormError(targetError);
      return;
    }

    const newRule = await StorageService.addRedirectRule({
      enabled: true,
      sourcePattern: newSource.trim(),
      redirectTo: newTarget.trim(),
    });

    if (preferences) {
      setPreferences({
        ...preferences,
        redirectRules: [...preferences.redirectRules, newRule],
      });
    }

    setNewSource('');
    setNewTarget('');
  }

  async function handleToggleRedirect(id: string) {
    if (!preferences) return;
    await StorageService.toggleRedirectRule(id);
    setPreferences({
      ...preferences,
      redirectRules: preferences.redirectRules.map((r) =>
        r.id === id ? { ...r, enabled: !r.enabled } : r
      ),
    });
  }

  async function handleDeleteRedirect(id: string) {
    if (!preferences) return;
    await StorageService.deleteRedirectRule(id);
    setPreferences({
      ...preferences,
      redirectRules: preferences.redirectRules.filter((r) => r.id !== id),
    });
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

        {/* Redirect Rules */}
        <section className="bg-slate-800 rounded-lg p-6 space-y-4">
          <div>
            <h2 className="text-lg font-medium tracking-wide text-slate-200">
              Redirect Rules
            </h2>
            <p className="text-sm text-slate-400 pt-1">
              Automatically redirect from a distracting site to somewhere
              productive. Example:{' '}
              <span className="text-slate-300">facebook.com</span>{' '}
              <span className="text-slate-500">→</span>{' '}
              <span className="text-slate-300">https://notion.so</span>
            </p>
          </div>

          {/* Add new rule form */}
          <form
            onSubmit={handleAddRedirectRule}
            className="space-y-3 pt-2 border-t border-slate-700/50"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3">
              <div>
                <label className="block text-xs text-slate-400 tracking-wide mb-1">
                  When you visit
                </label>
                <input
                  type="text"
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  placeholder="facebook.com"
                  className="w-full bg-slate-700/50 text-sm text-slate-200 placeholder-slate-500 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400/50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 tracking-wide mb-1">
                  Redirect to
                </label>
                <input
                  type="text"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  placeholder="https://notion.so"
                  className="w-full bg-slate-700/50 text-sm text-slate-200 placeholder-slate-500 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400/50"
                />
              </div>
            </div>

            {formError && (
              <p className="text-xs text-red-400 tracking-wide">{formError}</p>
            )}

            <button
              type="submit"
              className="w-full md:w-auto px-4 py-2 bg-teal-500 hover:bg-teal-400 text-white text-sm font-medium tracking-wide rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-teal-400/50"
            >
              Add Redirect
            </button>
          </form>

          {/* Existing rules list */}
          <div className="space-y-2 pt-2">
            {preferences.redirectRules.length === 0 ? (
              <p className="text-sm text-slate-500 italic tracking-wide py-4 text-center">
                No redirect rules yet. Add one above.
              </p>
            ) : (
              preferences.redirectRules.map((rule) => (
                <RedirectRuleRow
                  key={rule.id}
                  rule={rule}
                  onToggle={() => handleToggleRedirect(rule.id)}
                  onDelete={() => handleDeleteRedirect(rule.id)}
                />
              ))
            )}
          </div>
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
            <p className="text-sm text-slate-400">FocusOS v1.0.0</p>
            <p className="text-sm text-slate-500">
              Local-first attention protection
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

interface RedirectRuleRowProps {
  rule: RedirectRule;
  onToggle: () => void;
  onDelete: () => void;
}

function RedirectRuleRow({ rule, onToggle, onDelete }: RedirectRuleRowProps) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-md bg-slate-700/50">
      <button
        onClick={onToggle}
        className={`
          relative shrink-0 w-10 h-5 rounded-full transition-colors duration-200
          focus:outline-none focus:ring-2 focus:ring-teal-400/50
          ${rule.enabled ? 'bg-teal-500' : 'bg-slate-600'}
        `}
        aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
      >
        <span
          className={`
            absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm
            transition-transform duration-200
            ${rule.enabled ? 'translate-x-5' : 'translate-x-0.5'}
          `}
        />
      </button>

      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-2">
        <span
          className={`text-sm tracking-wide truncate ${
            rule.enabled ? 'text-slate-200' : 'text-slate-500 line-through'
          }`}
          title={rule.sourcePattern}
        >
          {rule.sourcePattern}
        </span>
        <span className="text-slate-500 text-xs hidden sm:inline">→</span>
        <span
          className={`text-sm tracking-wide truncate ${
            rule.enabled ? 'text-teal-300' : 'text-slate-500'
          }`}
          title={rule.redirectTo}
        >
          {rule.redirectTo}
        </span>
      </div>

      <button
        onClick={onDelete}
        className="shrink-0 text-slate-400 hover:text-red-400 transition-colors p-1 rounded focus:outline-none focus:ring-2 focus:ring-red-400/50"
        aria-label="Delete rule"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
