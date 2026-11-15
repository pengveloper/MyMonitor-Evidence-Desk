import type { BriefingEntry } from '../product-recovery/situation-synthesis-model';
import type { BriefingAnchor } from './model';
import { briefingTime, sourceHref } from './model';
import { briefingPresentation } from './presentation';
import { readDemoBriefs, writeDemoBriefs, resetDemoBriefs, demoBriefMarkdown, type DemoBrief, type DemoDocument, type ArchiveResult } from './demo-briefs';
import './evidence-desk.css';
import './evidence-desk-next.css';

export function isEvidenceDeskDemo(development: boolean, pathname: string, staticBuild = false): boolean {
  return (development && pathname === '/preview/evidence-desk.html')
    || (staticBuild && (pathname === '/' || pathname === '/index.html'));
}
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag); value.textContent = text; value.className = className; return value;
}
const stateLabel = (v: string) => ({ FRESH:'최근 관측', STALE:'오래된 관측', UNKNOWN:'최신 여부 정보 없음', AVAILABLE:'근거 있음', UNAVAILABLE:'읽기 실패·사용 불가', NO_DATA:'자료 없음', UPDATING:'갱신 중', DELAYED:'수신 지연' } as Record<string,string>)[v] ?? '상태 미확인';
const errorLabel = (result: Exclude<ArchiveResult, {ok:true}>) => ({BLOCKED:'브라우저 저장이 차단됐습니다. 저장되지 않았으며 새로고침 후 유지되지 않습니다.', QUOTA:'브라우저 저장 공간이 부족합니다. 기존 기록은 보존했습니다.', CORRUPT:'저장 기록을 읽을 수 없습니다. 손상되었거나 지원하지 않는 형식입니다. 초기화 전까지 덮어쓰지 않습니다.', LIMIT:'저장 한도(20건 / 200KB) 또는 지원 형식을 벗어났습니다. 기존 기록을 선택 삭제한 뒤 다시 저장하세요.'})[result.reason];

/** Opt-in reader. Persistence/export is admitted only for explicit synthetic input. */
export function createEvidenceReader(options: { onReturn?: () => void; onSelect?: (id: string) => void } = {}) {
  const element = node('section', '', 'gb-desk-reader'); element.setAttribute('aria-label', '선택 사건 읽기');
  const badge = node('p', '', 'gb-desk-kicker'); const title = node('h3');
  const tabs = node('div', '', 'gb-desk-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '근거 읽기 구분');
  const body = node('div', '', 'gb-desk-reading'); body.id='evidence-desk-reading'; body.setAttribute('role','tabpanel'); body.tabIndex=0;
  const metadata = node('dl', '', 'gb-desk-meta');
  const sources = node('div', '', 'gb-desk-sources');
  const advanced = node('details'); advanced.append(node('summary','기술 상세 · ID와 원래 상태')); const references=node('div','','gb-desk-refs'); advanced.append(references);
  const history=node('p','실제 과거 비교 · 비교할 보존 snapshot/revision이 없습니다. 저장 브리프는 실제 과거 재현이 아닙니다.','gb-desk-history'); history.dataset.state='NOT_CONNECTED';
  const actions=node('div','','gb-desk-actions');
  function action(label:string, callback:()=>void) { const b=node('button',label); b.type='button'; b.onclick=callback; return b; }
  const status=node('p','','gb-desk-save-status'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  const storageWarning=node('p','','gb-desk-storage-error'); storageWarning.setAttribute('role','alert');
  const library=node('details','','gb-desk-library'); const libraryLabel=node('summary','저장 브리프'); const libraryRows=node('div'); library.append(libraryLabel,libraryRows);
  const resetConfirm=node('div'); resetConfirm.hidden=true;
  let tab=0, current:DemoBrief|undefined, archived:DemoBrief|undefined, latestId:string|undefined, sourceLink:string|null=null;
  let state:ArchiveResult={ok:true,records:[]}; let storage:Storage|undefined; let loaded=false, synthetic=false, signature='';
  let notice:{context:string;message:string}|undefined;
  let storageError:Exclude<ArchiveResult,{ok:true}>|undefined;
  const viewKey=()=>archived?'saved:'+archived.id:'current:'+(current?.eventId??'none');
  function renderNotices(){if(notice?.context!==viewKey())notice=undefined;status.textContent=notice?.message??'';storageWarning.textContent=storageError?errorLabel(storageError):'';}
  function announce(message:string){notice={context:viewKey(),message};renderNotices();}
  function storageFailed(error:Exclude<ArchiveResult,{ok:true}>){storageError=error;notice=undefined;renderNotices();}
  function load() { if(loaded) return; loaded=true; try { storage=window.localStorage; state=readDemoBriefs(storage); } catch {state={ok:false,reason:'BLOCKED'};} if(!state.ok) storageFailed(state); renderLibrary(); }
  const shown=()=>archived??current;
  const buttons=['자료 요약','가능한 해석','다음 확인'].map((label,index)=>{
    const b=action(label,()=>{tab=index;renderReading();}); b.id='evidence-desk-tab-'+index; b.setAttribute('role','tab'); b.setAttribute('aria-controls',body.id);
    b.onkeydown=e=>{const offset=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(!offset&&e.key!=='Home'&&e.key!=='End')return;e.preventDefault();tab=e.key==='Home'?0:e.key==='End'?2:(tab+offset+3)%3;renderReading();buttons[tab]?.focus();};tabs.append(b);return b;
  });
  function openDocument(id:string) { const target=Array.from(sources.querySelectorAll<HTMLDetailsElement>('details')).find(d=>d.dataset.evidenceId===id); if(target){target.open=true;target.scrollIntoView({block:'nearest'});target.querySelector('summary')?.focus();} }
  function renderReading() {
    buttons.forEach((b,i)=>{b.setAttribute('aria-selected',String(i===tab));b.tabIndex=i===tab?0:-1;});body.setAttribute('aria-labelledby',buttons[tab]!.id);body.replaceChildren();
    const b=shown();if(!b){body.append(node('p','선택된 사건이 없습니다.'));return;}
    if(tab===0){body.append(node('h4','가상 자료에 제시된 내용 · 자료 요약'),node('p',b.summary),node('h4','이 자료로 확인할 수 없는 내용'),node('p',b.uncertainty,'gb-desk-limit'));if(b.languageLabel)body.append(node('small',b.languageLabel));if(b.availability!=='AVAILABLE')body.append(node('p','자료가 충분하지 않습니다. 확인된 사실로 단정하지 않습니다.','gb-desk-limit'));}
    else if(tab===1){body.append(node('p','가능한 해석 · 예측이나 인과관계 확정 아님','gb-desk-kicker'),node('p',b.interpretation),node('p',b.uncertainty,'gb-desk-limit'));if(b.conflicts.length)body.append(node('p','상충 근거 · '+b.conflicts.join(' · ')));}
    else {body.append(node('h4',b.nextLabel),node('p',b.nextReason));const supplemental=b.documents[1];if(supplemental)body.append(action('보완 근거 읽기 · '+supplemental.title,()=>openDocument(supplemental.id)));else body.append(node('p','보완 자료 미연결 · 현재 연결된 자료만 아래에서 확인할 수 있습니다.','gb-desk-limit'));}
  }
  function render() {
    const b=shown();title.textContent=b?.title??'근거를 기다립니다';badge.textContent=archived?'저장 당시 자료 · 가상 시나리오':'가상 시나리오 · 선택한 사건';
    element.dataset.mode=archived?'saved':'current';if(b)element.dataset.eventId=b.eventId;else delete element.dataset.eventId;
    if(archived)element.dataset.archiveId=archived.id;else delete element.dataset.archiveId;
    renderNotices();
    metadata.replaceChildren();sources.replaceChildren();references.replaceChildren();
    if(b){
      for(const [label,value]of [['예시 관측·보도',briefingTime(b.observedAt)],['예시 수집',briefingTime(b.fetchedAt)],['자료 기준',briefingTime(b.cutoffAt)],['자료 상태',stateLabel(b.freshness)+' · '+stateLabel(b.availability)]]){const row=node('div');row.append(node('dt',label),node('dd',value));metadata.append(row);}
      if(b.freshness==='UNKNOWN')metadata.append(node('p','자료의 최신 여부를 판정할 정보가 없습니다.','gb-desk-freshness-note'));
      references.append(node('p','사건 ID · '+b.eventId),node('p',b.freshness+' · '+b.availability));for(const id of b.evidenceIds)references.append(node('code',id));
      sources.append(node('h4','연결된 자료'));
      for(const d of b.documents){const card=node('details','','gb-desk-source');card.dataset.evidenceId=d.id;card.append(node('summary','가상 자료 · '+d.title),node('p',d.content),node('p','관측 '+briefingTime(d.observedAt)+' · 발표 '+briefingTime(d.publishedAt)+' · 수집 '+briefingTime(d.fetchedAt)),node('small','데모 안의 합성 원문입니다. 실제 기사·기관 발표가 아닙니다.'));sources.append(card);}
      if(!b.documents.length) sources.append(node('p','원문 내용 미연결 · 요약만으로 모든 문장의 사실 여부를 확정하지 않습니다.'));
      if(sourceLink&&!archived){const a=node('a','연결된 원문 열기 ↗');a.href=sourceLink;a.target='_blank';a.rel='noopener noreferrer';sources.append(a);}
      if(archived) sources.append(node('p','저장 시각 '+briefingTime(b.savedAt)+' · 현재 자료의 변경과 독립된 사본입니다.'));
    }
    save.disabled=!synthetic||!current||!!archived||!state.ok;download.disabled=!archived;back.hidden=!archived;renderReading();
  }
  function persist(records:DemoBrief[]) {if(!storage){storageFailed({ok:false,reason:'BLOCKED'});return false;}const result=writeDemoBriefs(storage,records);if(!result.ok){storageFailed(result);return false;}state=result;storageError=undefined;renderLibrary();renderNotices();return true;}
  const save=action('이 브리프 저장',()=>{load();if(!synthetic||!current||!state.ok)return;const record:DemoBrief=JSON.parse(JSON.stringify({...current,id:crypto.randomUUID(),savedAt:new Date().toISOString()}));if(persist([...state.records,record]))announce('브라우저에 저장했습니다. 아래 저장 브리프에서 다시 열 수 있습니다.');});
  const download=action('저장 브리프 내보내기',()=>{if(!synthetic||!archived)return;const blob=new Blob([demoBriefMarkdown(archived)],{type:'text/markdown;charset=utf-8'});const url=URL.createObjectURL(blob);const a=node('a');a.href=url;a.download='mymonitor-synthetic-brief.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('합성 브리프 Markdown을 내보냈습니다. 실제 과거 재현 자료가 아닙니다.');});
  const back=action('현재 선택 사건으로 돌아가기',()=>{archived=undefined;render();});
  const returnMap=action('선택 사건 지도로 돌아가기',()=>options.onReturn?.());
  const reset=action('데모 저장 기록 초기화',()=>{resetConfirm.hidden=false;});
  resetConfirm.append(node('p','Evidence Desk 합성 저장 기록만 지웁니다. 개인 지도·검색 설정은 보존합니다.'),action('합성 저장 기록만 삭제',()=>{if(storage&&resetDemoBriefs(storage)){state={ok:true,records:[]};archived=undefined;storageError=undefined;renderLibrary();render();announce('합성 저장 기록만 초기화했습니다.');}else storageFailed({ok:false,reason:'BLOCKED'});resetConfirm.hidden=true;reset.focus();}),action('취소',()=>{resetConfirm.hidden=true;reset.focus();}));
  function renderLibrary(){libraryLabel.textContent='저장 브리프 · '+(state.ok?state.records.length:'읽기 실패');libraryRows.replaceChildren();if(!state.ok){libraryRows.append(node('p',errorLabel(state)));return;}if(!state.records.length)libraryRows.append(node('p','저장된 합성 브리프가 없습니다.'));
    for(const record of state.records){const row=node('div','','gb-desk-saved-row');row.append(action('다시 열기 · '+record.title,()=>{options.onSelect?.(record.eventId);archived=JSON.parse(JSON.stringify(record));render();announce('저장 당시 자료를 열었습니다.');title.tabIndex=-1;title.focus({preventScroll:true});}),node('small',briefingTime(record.savedAt)),action('선택 삭제 · '+record.title,()=>{if(!state.ok)return;if(persist(state.records.filter(r=>r.id!==record.id))){if(archived?.id===record.id)archived=undefined;render();announce('선택한 합성 기록을 삭제했습니다.');libraryLabel.focus();}}));libraryRows.append(row);}
  }
  actions.append(save,back,download,returnMap);element.append(badge,title,tabs,body,actions,status,storageWarning,metadata,sources,library,advanced,history,reset,resetConfirm);
  return {element,update(event:BriefingEntry|undefined,anchor:BriefingAnchor|undefined,snapshotAt?:string,documents:Readonly<Record<string,DemoDocument>>={},scenario=false){
    synthetic=scenario&&event?.source?.id==='DESIGN_SCENARIO';if(scenario)load();
    const nextSignature=JSON.stringify([event,anchor,snapshotAt,documents,scenario]);if(nextSignature===signature)return;signature=nextSignature;
    if(latestId!==event?.id)archived=undefined;latestId=event?.id;
    const display=event?briefingPresentation(event):undefined;
    current=event&&snapshotAt?{schemaVersion:1,synthetic:true,id:'unsaved',savedAt:snapshotAt,cutoffAt:snapshotAt,eventId:event.id,title:display!.title,summary:display!.summary,languageLabel:display!.languageLabel??'',conflicts:[...event.conflictsWithEvidenceRefs],interpretation:event.details.whyImportant||'연결된 해석 근거가 없습니다.',uncertainty:event.details.uncertainty||'영향을 확정할 근거가 없습니다.',nextLabel:event.details.nextCheck.label,nextReason:event.details.nextCheck.reason,freshness:event.freshness,availability:event.availability,observedAt:event.observedAt,fetchedAt:anchor?.fetchedAt??null,evidenceIds:[...event.evidenceRefs],documents:event.evidenceRefs.flatMap(id=>documents[id]?.synthetic?[structuredClone(documents[id]!)]:[])}:undefined;
    const href=sourceHref(event?.source?.href);sourceLink=href&&!new URL(href).username&&!new URL(href).password?href:null;
    // Refresh current data without rebuilding the independent saved view.
    if(archived){renderNotices();return;}
    render();
  }};
}
