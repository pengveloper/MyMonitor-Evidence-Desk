export const PRODUCT_LANGUAGES = ['ko', 'en'] as const;

export type ProductLanguage = typeof PRODUCT_LANGUAGES[number];

export const DEFAULT_PRODUCT_LANGUAGE: ProductLanguage = 'ko';
export const FALLBACK_PRODUCT_LANGUAGE: ProductLanguage = 'en';
export const EXPLICIT_LOCALE_KEY = 'wm-locale-explicit';

const PRODUCT_LANGUAGE_SET = new Set<string>(PRODUCT_LANGUAGES);

export function normalizeProductLanguage(value: string | null | undefined): ProductLanguage | undefined {
  const base = value?.trim().split('-')[0]?.toLowerCase();
  return base && PRODUCT_LANGUAGE_SET.has(base) ? base as ProductLanguage : undefined;
}

export function resolveInitialProductLanguage(
  queryLanguage: string | null | undefined,
  storedLanguage: string | null | undefined,
): ProductLanguage {
  return normalizeProductLanguage(queryLanguage)
    ?? normalizeProductLanguage(storedLanguage)
    ?? DEFAULT_PRODUCT_LANGUAGE;
}

export function getProductLocale(language: string | null | undefined): 'ko-KR' | 'en-US' {
  return normalizeProductLanguage(language) === 'en' ? 'en-US' : 'ko-KR';
}

export function getDocumentLanguage(language: string | null | undefined): 'ko-KR' | 'en' {
  return normalizeProductLanguage(language) === 'en' ? 'en' : 'ko-KR';
}
