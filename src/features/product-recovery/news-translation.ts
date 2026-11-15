import type { RadarGlobalEvent } from './global-radar-model.ts';
import type { SummarizationResult } from '@/services/summarization';
import { getPersistentCache, setPersistentCache } from '@/services/persistent-cache';
import { hashString } from '@/utils/hash';
import {
  TRANSLATION_GLOSSARY_REVISION,
  TRANSLATION_PROMPT_VERSION,
} from '@/utils/summary-cache-key';

export const NEWS_TRANSLATION_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const NEWS_TRANSLATION_NEGATIVE_TTL_MS = 10 * 60 * 1_000;
export const NEWS_TRANSLATION_CACHE_CAPACITY = 96;
export const NEWS_TRANSLATION_BATCH_LIMIT = 3;
export const NEWS_TRANSLATION_DAILY_TEXT_CAP = 24;

const LEDGER_KEY = 'mymonitor-news-translation-ledger:v1';
const BUDGET_PREFIX = 'mymonitor-news-translation-budget:v1:';

type TranslationFailureReason =
  | 'REQUIRED_TRANSLATION_CONFIGURATION'
  | 'VALIDATION_REJECTED'
  | 'BUDGET_EXHAUSTED'
  | 'BATCH_DEFERRED';

export interface NewsArticleTranslation {
  status: 'TRANSLATED' | 'ORIGINAL_KOREAN' | 'UNAVAILABLE';
  targetLocale: 'ko';
  sourceLocale: string;
  title?: string;
  summary?: string;
  contentHash: string;
  glossaryRevision: typeof TRANSLATION_GLOSSARY_REVISION;
  promptVersion: typeof TRANSLATION_PROMPT_VERSION;
  provider?: string;
  model?: string;
  cache: 'HIT' | 'MISS' | 'BYPASS';
  translatedAt?: string;
  reason?: TranslationFailureReason;
}

export interface TranslationLedgerEntry {
  key: string;
  storedAt: number;
  result: NewsArticleTranslation;
}

export interface TranslationLedger {
  version: 1;
  entries: TranslationLedgerEntry[];
}

export interface TranslationCacheStore {
  read(): Promise<TranslationLedger | null>;
  write(value: TranslationLedger): Promise<void>;
}

export type NewsTextTranslator = (
  text: string,
  sourceLocale: string,
  targetLocale: 'ko',
) => Promise<SummarizationResult | null>;

export interface NewsTranslationCacheOptions {
  now?: () => number;
  store?: TranslationCacheStore;
  translator?: NewsTextTranslator;
  reserveText?: () => boolean;
}

function persistentStore(): TranslationCacheStore {
  return {
    async read() {
      return (await getPersistentCache<TranslationLedger>(LEDGER_KEY))?.data ?? null;
    },
    async write(value) {
      await setPersistentCache(LEDGER_KEY, value);
    },
  };
}

function hasKorean(value: string): boolean {
  return /[\uac00-\ud7a3]/.test(value);
}

function integrityTokens(value: string): string[] {
  return value.match(/[+-]?(?:\d[\d,.]*)(?:%p|%|bp)?/gi)?.map((token) => token.toLowerCase()) ?? [];
}

function protectedSymbols(value: string): string[] {
  return value.match(/\b[A-Z][A-Z0-9.-]{1,9}\b/g) ?? [];
}

export function validatesNewsTranslation(original: string, translated: string, targetLocale = 'ko'): boolean {
  const output = translated.trim();
  if (!output) return false;
  if (targetLocale === 'ko' && /[A-Za-z]{3,}/.test(original) && !hasKorean(output)) return false;
  if (integrityTokens(original).some((token) => !integrityTokens(output).includes(token))) return false;
  if (protectedSymbols(original).some((symbol) => !output.includes(symbol))) return false;
  if (/\b(?:not|no|never|without|denies?|rejects?|fails?|cannot|can't|won't)\b/i.test(original)
    && !/(?:않|아니|없|못|거부|부인|실패|불가|금지|미확인|않았)/.test(output)) return false;
  return true;
}

function contentIdentity(title: string, summary: string | undefined, sourceLocale: string): { hash: string; key: string } {
  const source = sourceLocale.trim().toLowerCase() || 'auto';
  const content = `${title.length}:${title}\n${summary?.length ?? 0}:${summary ?? ''}`;
  const hash = hashString(content);
  return {
    hash,
    key: [
      'news-translation', source, 'ko', TRANSLATION_GLOSSARY_REVISION,
      TRANSLATION_PROMPT_VERSION, hash,
    ].join(':'),
  };
}

function defaultReserveText(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const day = new Date().toISOString().slice(0, 10);
  const key = `${BUDGET_PREFIX}${day}`;
  try {
    const used = Number(localStorage.getItem(key) ?? '0');
    if (!Number.isFinite(used) || used < 0) localStorage.setItem(key, '0');
    const normalized = Number.isFinite(used) && used >= 0 ? used : 0;
    if (normalized >= NEWS_TRANSLATION_DAILY_TEXT_CAP) return false;
    localStorage.setItem(key, String(normalized + 1));
    return true;
  } catch {
    // Storage denial must not create an unbounded provider path.
    return false;
  }
}

async function defaultTranslator(
  text: string,
  sourceLocale: string,
  targetLocale: 'ko',
): Promise<SummarizationResult | null> {
  const { translateTextWithMeta } = await import('@/services/summarization');
  return translateTextWithMeta(text, targetLocale, undefined, { sourceLang: sourceLocale, timeoutMs: 8_000 });
}

function koreanOriginal(
  title: string,
  summary: string | undefined,
  sourceLocale: string,
  contentHash: string,
): NewsArticleTranslation {
  return {
    status: 'ORIGINAL_KOREAN', targetLocale: 'ko', sourceLocale,
    title, ...(summary ? { summary } : {}), contentHash,
    glossaryRevision: TRANSLATION_GLOSSARY_REVISION,
    promptVersion: TRANSLATION_PROMPT_VERSION,
    cache: 'BYPASS',
  };
}

export class NewsTranslationCache {
  private readonly now: () => number;
  private readonly store: TranslationCacheStore;
  private readonly translator: NewsTextTranslator;
  private readonly reserveText: () => boolean;
  private ledgerPromise: Promise<TranslationLedger> | null = null;
  private readonly inFlight = new Map<string, Promise<NewsArticleTranslation>>();

  constructor(options: NewsTranslationCacheOptions = {}) {
    this.now = options.now ?? Date.now;
    this.store = options.store ?? persistentStore();
    this.translator = options.translator ?? defaultTranslator;
    this.reserveText = options.reserveText ?? defaultReserveText;
  }

  private async ledger(): Promise<TranslationLedger> {
    if (!this.ledgerPromise) {
      const emptyLedger = (): TranslationLedger => ({ version: 1, entries: [] });
      this.ledgerPromise = this.store.read().then((value): TranslationLedger => (
        value?.version === 1 && Array.isArray(value.entries) ? value : emptyLedger()
      )).catch(emptyLedger);
    }
    return this.ledgerPromise!;
  }

  private async remember(key: string, result: NewsArticleTranslation): Promise<void> {
    const ledger = await this.ledger();
    ledger.entries = [
      { key, storedAt: this.now(), result },
      ...ledger.entries.filter((entry) => entry.key !== key),
    ].slice(0, NEWS_TRANSLATION_CACHE_CAPACITY);
    await this.store.write(ledger).catch(() => {});
  }

  private async cached(key: string): Promise<NewsArticleTranslation | null> {
    const ledger = await this.ledger();
    const entry = ledger.entries.find((candidate) => candidate.key === key);
    if (!entry) return null;
    const ttl = entry.result.status === 'UNAVAILABLE'
      ? NEWS_TRANSLATION_NEGATIVE_TTL_MS
      : NEWS_TRANSLATION_CACHE_TTL_MS;
    if (this.now() - entry.storedAt >= ttl) return null;
    return { ...entry.result, cache: 'HIT' };
  }

  async lookupArticle(input: { title: string; summary?: string; sourceLocale?: string }): Promise<NewsArticleTranslation | null> {
    const sourceLocale = input.sourceLocale?.trim().toLowerCase() || 'auto';
    const identity = contentIdentity(input.title, input.summary, sourceLocale);
    if (hasKorean(input.title) && (!input.summary || hasKorean(input.summary))) {
      return koreanOriginal(input.title, input.summary, sourceLocale, identity.hash);
    }
    return this.cached(identity.key);
  }
  async translateArticle(input: {
    title: string;
    summary?: string;
    sourceLocale?: string;
  }): Promise<NewsArticleTranslation> {
    const sourceLocale = input.sourceLocale?.trim().toLowerCase() || 'auto';
    const identity = contentIdentity(input.title, input.summary, sourceLocale);
    if (hasKorean(input.title) && (!input.summary || hasKorean(input.summary))) {
      return koreanOriginal(input.title, input.summary, sourceLocale, identity.hash);
    }
    const cached = await this.cached(identity.key);
    if (cached) return cached;
    const pending = this.inFlight.get(identity.key);
    if (pending) return pending;

    const task = (async (): Promise<NewsArticleTranslation> => {
      const translateOne = async (text: string): Promise<SummarizationResult | null | 'BUDGET'> => {
        if (!this.reserveText()) return 'BUDGET';
        return this.translator(text, sourceLocale, 'ko');
      };
      const titleResult = await translateOne(input.title);
      // A skipped/failed title must not consume another slot for its summary.
      const summaryResult = input.summary && titleResult && titleResult !== 'BUDGET' ? await translateOne(input.summary) : null;
      const budgetExhausted = titleResult === 'BUDGET' || summaryResult === 'BUDGET';
      const validTitle = titleResult !== 'BUDGET' && titleResult !== null
        && validatesNewsTranslation(input.title, titleResult.summary);
      const validSummary = !input.summary || (summaryResult !== 'BUDGET' && summaryResult !== null
        && validatesNewsTranslation(input.summary, summaryResult.summary));
      if (!validTitle || !validSummary) {
        const reason: TranslationFailureReason = budgetExhausted
          ? 'BUDGET_EXHAUSTED'
          : (titleResult || summaryResult) ? 'VALIDATION_REJECTED' : 'REQUIRED_TRANSLATION_CONFIGURATION';
        const unavailable: NewsArticleTranslation = {
          status: 'UNAVAILABLE', targetLocale: 'ko', sourceLocale,
          contentHash: identity.hash,
          glossaryRevision: TRANSLATION_GLOSSARY_REVISION,
          promptVersion: TRANSLATION_PROMPT_VERSION,
          cache: 'MISS', reason,
        };
        await this.remember(identity.key, unavailable);
        return unavailable;
      }
      if (titleResult === null) {
        throw new Error('translation validation invariant');
      }
      const translated: NewsArticleTranslation = {
        status: 'TRANSLATED', targetLocale: 'ko', sourceLocale,
        title: titleResult.summary,
        ...(summaryResult && summaryResult !== 'BUDGET' ? { summary: summaryResult.summary } : {}),
        contentHash: identity.hash,
        glossaryRevision: TRANSLATION_GLOSSARY_REVISION,
        promptVersion: TRANSLATION_PROMPT_VERSION,
        provider: titleResult.provider,
        model: titleResult.model,
        cache: titleResult.cached && (!summaryResult || summaryResult === 'BUDGET' || summaryResult.cached) ? 'HIT' : 'MISS',
        translatedAt: new Date(this.now()).toISOString(),
      };
      await this.remember(identity.key, translated);
      return translated;
    })().finally(() => this.inFlight.delete(identity.key));
    this.inFlight.set(identity.key, task);
    return task;
  }
}

export const newsTranslationCache = new NewsTranslationCache();

export async function localizeRadarEvents(
  items: readonly RadarGlobalEvent[],
  cache: NewsTranslationCache = newsTranslationCache,
): Promise<RadarGlobalEvent[]> {
  let attempted = 0;
  const results: RadarGlobalEvent[] = [];
  for (const item of items) {
    const input = { title: item.title, summary: item.summary,
      sourceLocale: item.source?.id.startsWith('RSS:') ? 'en' : 'auto' };
    let translation = await cache.lookupArticle(input);
    if (!translation && attempted < NEWS_TRANSLATION_BATCH_LIMIT) {
      attempted += 1;
      translation = await cache.translateArticle(input);
    }
    results.push({ ...item, translation: translation ?? {
      status: 'UNAVAILABLE', targetLocale: 'ko', sourceLocale: input.sourceLocale,
      contentHash: contentIdentity(item.title, item.summary, input.sourceLocale).hash,
      glossaryRevision: TRANSLATION_GLOSSARY_REVISION,
      promptVersion: TRANSLATION_PROMPT_VERSION,
      cache: 'BYPASS', reason: 'BATCH_DEFERRED',
    } });
  }
  return results;
}
