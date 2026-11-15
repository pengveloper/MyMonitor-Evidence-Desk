import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import { enqueueSentryCall } from '@/bootstrap/sentry-defer';
import { translateMyMonitor, type MyMonitorTranslationKey } from '@/locales/mymonitor';
import {
  DEFAULT_PRODUCT_LANGUAGE,
  EXPLICIT_LOCALE_KEY,
  getDocumentLanguage,
  getProductLocale,
  normalizeProductLanguage,
  type ProductLanguage,
} from '@/services/i18n-policy';
import { resolveLanguageTag } from '@/shared/language-tags';
import { readQueryLanguage, stripQueryLanguage } from '@/utils/i18n-url';

// Keep only first-paint English strings in the entry chunk. The full English
// dictionary is loaded through localeModules so it can split like other locales.
import enShellTranslation from '../locales/en.shell.json';

// Explicit-choice localStorage key. Written ONLY when the user manually picks
// a language via Settings → Language. The default detector's `i18nextLng`
// auto-cache is disabled (caches: []) so historical navigator detection cannot
// override MyMonitor's Korean default. Only an explicit 한국어/English choice
// is persisted here.
const SUPPORTED_LANGUAGES = ['en', 'bg', 'cs', 'fr', 'de', 'el', 'es', 'hr', 'hu', 'it', 'pl', 'pt', 'nl', 'sv', 'ru', 'uk', 'ar', 'fa', 'zh', 'zh-TW', 'ja', 'ko', 'ro', 'tr', 'th', 'vi', 'hi', 'sw'] as const;
type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
type TranslationDictionary = Record<string, unknown>;

// Window event fired once the full (non-shell) dictionary for the active
// language has been merged into i18next. The App listens for it to heal any
// raw-key placeholders rendered during the shell-only first-paint window.
// Shared constant so producer (here) and consumer (App.ts) can't drift.
export const I18N_RESOURCES_LOADED_EVENT = 'wm:i18n:resources-loaded';
export interface I18nResourcesLoadedDetail {
  language: SupportedLanguage;
}

export const I18N_LANGUAGE_CHANGED_EVENT = 'wm:i18n:language-changed';
export interface I18nLanguageChangedDetail {
  language: ProductLanguage;
}

const SUPPORTED_LANGUAGE_SET = new Set<SupportedLanguage>(SUPPORTED_LANGUAGES);
const loadedLanguages = new Set<SupportedLanguage>();

// Lazy-load only the locale that's actually needed — all others stay out of the bundle.
const localeModules = import.meta.glob<TranslationDictionary>(
  ['../locales/*.json', '!../locales/en.shell.json'],
  { import: 'default' },
);

const RTL_LANGUAGES = new Set(['ar', 'fa']);

function normalizeLanguage(lng: string): SupportedLanguage {
  return resolveLanguageTag(lng, SUPPORTED_LANGUAGE_SET) as SupportedLanguage;
}

function applyDocumentDirection(lang: string): void {
  const base = lang.split('-')[0] || lang;
  const normalized = normalizeLanguage(lang);
  const productLanguage = normalizeProductLanguage(normalized);
  const documentLanguage = productLanguage
    ? getDocumentLanguage(productLanguage)
    : normalized === 'zh-TW'
      ? 'zh-TW'
      : normalized === 'zh'
        ? 'zh-CN'
        : normalized;
  document.documentElement.setAttribute('lang', documentLanguage);
  if (RTL_LANGUAGES.has(base)) {
    document.documentElement.setAttribute('dir', 'rtl');
  } else {
    document.documentElement.removeAttribute('dir');
  }
}

async function ensureLanguageLoaded(lng: string): Promise<SupportedLanguage> {
  const normalized = normalizeLanguage(lng);
  if (loadedLanguages.has(normalized) && i18next.hasResourceBundle(normalized, 'translation')) {
    return normalized;
  }

  let translation: TranslationDictionary;
  const loader = localeModules[`../locales/${normalized}.json`];
  if (!loader) {
    console.warn(`No locale file for "${normalized}", falling back to English`);
    const englishLoader = localeModules['../locales/en.json'];
    if (englishLoader) {
      translation = await englishLoader();
    } else {
      // Last-resort fallback: install the shell-only subset under this code.
      // This is a degraded bundle (first-paint keys only); log it so the
      // permanent partial state isn't silently indistinguishable from success.
      console.warn(`Full English locale unavailable; installing shell-only bundle for "${normalized}"`);
      translation = enShellTranslation as TranslationDictionary;
    }
  } else {
    translation = await loader();
  }

  i18next.addResourceBundle(normalized, 'translation', translation, true, true);
  loadedLanguages.add(normalized);
  return normalized;
}

function notifyLanguageResourcesLoaded(language: SupportedLanguage): void {
  if (normalizeLanguage(i18next.language || 'en') !== language) return;

  const dispatch = (): void => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<I18nResourcesLoadedDetail>(I18N_RESOURCES_LOADED_EVENT, { detail: { language } }),
      );
    }
  };

  // The full bundle is already registered (addResourceBundle ran inside
  // ensureLanguageLoaded), so t() resolves correctly regardless of what happens
  // next. We still re-run changeLanguage to refresh i18next's resolved store and
  // notify any future `languageChanged` subscribers — there are none today, so
  // the DOM healer fired by the event below is the actual repair path. Dispatch
  // in `finally` so the event (and heal) lands AFTER changeLanguage settles,
  // never racing a half-applied change, and still fires if it rejects.
  void i18next.changeLanguage(i18next.language || language)
    .catch((error) => {
      console.warn(`Failed to refresh i18next after loading "${language}" locale`, error);
    })
    .finally(dispatch);
}

const ENGLISH_PRELOAD_MAX_ATTEMPTS = 3;
const ENGLISH_PRELOAD_BASE_DELAY_MS = 2000;

function preloadEnglishTranslation(attempt = 0): void {
  if (loadedLanguages.has('en')) return;
  void ensureLanguageLoaded('en')
    .then((language) => notifyLanguageResourcesLoaded(language))
    .catch((error) => {
      // English now lives in its own lazy chunk. If that chunk fails, the eager
      // shell still renders first paint, but non-shell English keys stay raw for
      // the rest of the session — for the majority (English) cohort. Retry with
      // bounded backoff, then once more when connectivity returns, and surface
      // the failure to Sentry so the degraded state isn't silent.
      console.warn(`Failed to preload full English locale (attempt ${attempt + 1})`, error);
      enqueueSentryCall((s) => s.captureException(error, {
        tags: { module: 'i18n', locale: 'en', action: 'preloadEnglishTranslation' },
        level: 'warning',
      }));

      if (loadedLanguages.has('en')) return;
      if (attempt + 1 < ENGLISH_PRELOAD_MAX_ATTEMPTS) {
        const delayMs = ENGLISH_PRELOAD_BASE_DELAY_MS * 2 ** attempt;
        setTimeout(() => preloadEnglishTranslation(attempt + 1), delayMs);
      } else if (typeof window !== 'undefined') {
        window.addEventListener('online', () => preloadEnglishTranslation(0), { once: true });
      }
    });
}

// Initialize i18n
export async function initI18n(): Promise<void> {
  if (i18next.isInitialized) {
    const currentLanguage = normalizeLanguage(i18next.language || 'en');
    await ensureLanguageLoaded(currentLanguage);
    applyDocumentDirection(i18next.language || currentLanguage);
    return;
  }

  // One-time migration: i18next-browser-languagedetector previously cached
  // every detection result here. Drop that legacy auto-cache so it cannot
  // outrank MyMonitor's Korean default. The explicit-choice key
  // (`wm-locale-explicit`) is preserved untouched.
  try { localStorage.removeItem('i18nextLng'); } catch { /* private mode */ }

  // Custom detectors:
  // - wmQuery honors shareable application-language URLs such as
  //   /dashboard?lang=fa. These remain base-canonical and are not advertised
  //   as separately indexable hreflang documents. MyMonitor accepts only its
  //   two product languages here; legacy upstream locale assets remain in the
  //   repository for compatibility but are not exposed by this fork.
  // - wmExplicit reads ONLY the explicit-choice key. Returns undefined when
  //   unset so detection falls through to MyMonitor's Korean product default.
  //   This replaces i18next's auto-cache key so only an intentional Settings
  //   choice can override the default.
  const detector = new LanguageDetector();
  detector.addDetector({
    name: 'wmQuery',
    lookup: () => normalizeProductLanguage(readQueryLanguage(window.location.href)),
    cacheUserLanguage: () => { /* URL language is explicit per request, not persisted */ },
  });
  detector.addDetector({
    name: 'wmExplicit',
    lookup: () => {
      try { return normalizeProductLanguage(localStorage.getItem(EXPLICIT_LOCALE_KEY)); }
      catch { return undefined; }
    },
    cacheUserLanguage: () => { /* writes go through explicit changeLanguage() */ },
  });
  detector.addDetector({
    name: 'wmDefault',
    lookup: () => DEFAULT_PRODUCT_LANGUAGE,
    cacheUserLanguage: () => { /* the product default is not an explicit preference */ },
  });

  await i18next
    .use(detector)
    .init({
      resources: {
        en: { translation: enShellTranslation as TranslationDictionary },
      },
      supportedLngs: [...SUPPORTED_LANGUAGES],
      nonExplicitSupportedLngs: true,
      fallbackLng: 'en',
      debug: import.meta.env.DEV,
      interpolation: {
        escapeValue: false, // not needed for these simple strings
      },
      detection: {
        order: ['wmQuery', 'wmExplicit', 'wmDefault'],
        caches: [], // never auto-write — only changeLanguage() persists
      },
    });

  const detectedLanguage = normalizeLanguage(i18next.language || 'en');
  if (detectedLanguage === 'en') {
    preloadEnglishTranslation();
  } else {
    await Promise.all([
      ensureLanguageLoaded(detectedLanguage),
      ensureLanguageLoaded('en'),
    ]);
    // Re-trigger translation resolution now that the detected bundle is loaded.
    await i18next.changeLanguage(detectedLanguage);
  }

  applyDocumentDirection(i18next.language || detectedLanguage);
}

// Helper to translate
export function t(key: string, options?: Record<string, unknown>): string {
  return i18next.t(key, options);
}

// Helper to change language. Persists only a validated product language and
// emits a same-document event so the application shell can re-render without a
// browser reload.
export async function changeLanguage(lng: string): Promise<void> {
  const requested = normalizeProductLanguage(lng) ?? DEFAULT_PRODUCT_LANGUAGE;
  const normalized = await ensureLanguageLoaded(requested);
  try { localStorage.setItem(EXPLICIT_LOCALE_KEY, normalized); } catch { /* private mode */ }
  await i18next.changeLanguage(normalized);
  applyDocumentDirection(normalized);
  // Drop any `?lang=` from the URL after applying the explicit choice. `wmQuery` is first in
  // detection.order, so a stale query param would out-rank the explicit choice
  // we just persisted and silently revert the language on this very reload.
  try {
    const stripped = stripQueryLanguage(window.location.href);
    if (stripped !== window.location.href) {
      window.history.replaceState(window.history.state, '', stripped);
    }
  } catch { /* history unavailable */ }
  window.dispatchEvent(
    new CustomEvent<I18nLanguageChangedDetail>(I18N_LANGUAGE_CHANGED_EVENT, {
      detail: { language: requested },
    }),
  );
}

// Helper to get current language (normalized to short code)
export function getCurrentLanguage(): string {
  return normalizeProductLanguage(i18next.language) ?? DEFAULT_PRODUCT_LANGUAGE;
}

/**
 * The active language as a full catalogue tag — `zh-TW`, never collapsed to `zh`.
 *
 * `getCurrentLanguage()` strips the region because most callers want the FEED
 * language, where Traditional and Simplified readers want the same thing: both
 * read the same Chinese-language sources. Use this accessor instead where the
 * caller is sensitive to the SCRIPT — which entry the language picker marks as
 * selected, and how dates and numbers format, differ between the two even though
 * the feeds do not.
 */
export function getCurrentLanguageTag(): string {
  return normalizeLanguage(i18next.language || 'en');
}

export function isRTL(): boolean {
  return RTL_LANGUAGES.has(getCurrentLanguage());
}

export function getLocale(): string {
  return getProductLocale(getCurrentLanguage());
}

export const LANGUAGES = [
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
] satisfies ReadonlyArray<{ code: ProductLanguage; label: string; flag: string }>;

export function mt(key: MyMonitorTranslationKey): string {
  return translateMyMonitor(key, getCurrentLanguage());
}
