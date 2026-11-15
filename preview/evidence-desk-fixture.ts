import { briefingPolishFixture } from './global-briefing-fixture';
import type { BriefingUpdate } from '../src/features/global-briefing/model';
import type { DemoDocument } from '../src/features/global-briefing/demo-briefs';

/** Same fixture for baseline and improved app; authored fiction, no external articles. */
export function evidenceDeskFixture(state = 'normal'): BriefingUpdate {
  const data=briefingPolishFixture();
  const documents:Record<string,DemoDocument>={};
  for(const event of data.model.entries){
    documents[event.id]={synthetic:true,id:event.id,title:event.id.includes('earthquake')?'지진 관측 연습 자료':event.title,
      content:event.summary,observedAt:event.observedAt,publishedAt:null,fetchedAt:data.anchors[event.id]?.fetchedAt??null};
    if(state==='stale')event.freshness='STALE';
    if(state==='failed')event.availability='UNAVAILABLE';
    if(state==='missing'){event.availability='NO_DATA';event.evidenceRefs=[];}
    if(state==='long'){event.title='긴 한국어 읽기 검수 · '+event.title.repeat(4);event.summary=event.summary.repeat(8);}
  }
  const maritime=data.model.entries.find(e=>e.id==='scenario-maritime')!;
  const supplement='scenario-maritime:port-notice';
  if(state!=='missing')maritime.evidenceRefs.push(supplement);
  documents['scenario-maritime']!.title='항로 우회 안내 · 가상 원문';
  documents['scenario-maritime']!.content='연습용 운항사는 항로 변경을 검토 중이라고 안내했습니다. 확정된 운항 취소나 공급 중단 수치는 이 가상 자료에 없습니다.';
  documents[supplement]={synthetic:true,id:supplement,title:'항만 운영 공지 · 보완 자료',content:'가상 항만 공지에는 운영 중단을 확인할 자료가 없습니다. 우회 검토와 항만 중단을 같은 사실로 취급하지 않습니다.',observedAt:null,publishedAt:'2026-10-05T01:05:00.000Z',fetchedAt:'2026-10-05T01:10:00.000Z'};
  maritime.details.nextCheck={label:'우회 안내와 항만 운영 공지 대조',reason:'우회 검토만으로 공급 중단을 확정하지 않습니다. 서로 다른 가상 자료의 확인 범위를 비교하세요.',deepLink:'#briefingTimeline'};
  if(state==='empty')data.model.entries=[];
  data.demoDocuments=state==='missing'?{}:documents;
  return data;
}
