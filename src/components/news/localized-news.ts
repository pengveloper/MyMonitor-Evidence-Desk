import type { NewsItem } from '@/types';
export interface LocalizedNewsPresentation {
  title: string;
  snippet?: string;
  translated: boolean;
  unavailable: boolean;
}
export function localizedNews(item: NewsItem, language: string): LocalizedNewsPresentation {
  if (language !== 'ko' || !item.translation) {
    return { title: item.title, ...(item.snippet ? { snippet: item.snippet } : {}), translated: false, unavailable: false };
  }
  const usable = (item.translation.status === 'TRANSLATED' || item.translation.status === 'ORIGINAL_KOREAN')
    && Boolean(item.translation.title);
  if (!usable) {
    const reason = item.translation.reason === 'BATCH_DEFERRED'
      ? '이번 자동 번역 처리 한도에 도달했습니다. 원문을 확인할 수 있습니다.'
      : item.translation.reason === 'BUDGET_EXHAUSTED'
        ? '오늘의 제한된 번역 예산을 모두 사용했습니다.'
        : item.translation.reason === 'VALIDATION_REJECTED'
          ? '숫자·기호·부정 표현 보존 검증을 통과하지 못했습니다.'
          : '서버 번역 공급자의 설정 또는 응답을 확인해야 합니다.';
    return {
      title: item.title,
      snippet: `${reason} 아래 원문은 그대로 보존됩니다.`,
      translated: false,
      unavailable: true,
    };
  }
  return {
    title: item.translation.title!,
    ...(item.translation.snippet ? { snippet: item.translation.snippet } : {}),
    translated: item.translation.status === 'TRANSLATED',
    unavailable: false,
  };
}
