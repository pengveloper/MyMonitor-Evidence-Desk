import type { MapNewsLocation } from '@/types';
import { eventCategory, eventCoordinates, sourceHref, visibleEvents, type BriefingUpdate } from './model';
import { briefingPresentation } from './presentation';

/** Projection into the existing map marker contract, not a collector or new map. */
export function briefingMapLocations(update: BriefingUpdate): MapNewsLocation[] {
  return visibleEvents(update, '전체').flatMap(entry => {
    const coordinate = eventCoordinates(update.anchors[entry.id]);
    if (!coordinate) return [];
    const display = briefingPresentation(entry);
    return [{ lat: coordinate[1], lon: coordinate[0], briefingId: entry.id,
      visibilityLayer: eventCategory(entry) === '자연재해' ? 'natural' : 'hotspots',
      title: display.title, summary: display.summary, originalTitle: entry.originalTitle,
      originalSummary: entry.originalSummary, source: entry.source?.label,
      url: sourceHref(entry.source?.href) ?? undefined, threatLevel: 'info',
      timestamp: entry.observedAt && Number.isFinite(Date.parse(entry.observedAt)) ? new Date(entry.observedAt) : undefined,
      fetchedAt: update.anchors[entry.id]?.fetchedAt,
      freshnessStatus: entry.freshness === 'FRESH' || entry.freshness === 'STALE' ? entry.freshness : undefined }];
  });
}
