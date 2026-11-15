import { renderMarketEvidence } from './market-evidence-view';
import { candidateLabel, candidateSummary } from './result-labels';
import { discoveryExplanationInput, type DiscoveryV2 } from '../../../shared/owner-discovery-v2';
import { discoveryCoverage } from '../../../shared/discovery-coverage';
import type { UniverseScan } from '../../../shared/owner-universe-scan-contract';
const element = <T extends keyof HTMLElementTagNameMap>(tag: T, text = '') => { const n = document.createElement(tag); n.textContent = text; return n; };
const blockerLabel = (code: string) => code === 'INSTRUMENT_CLASS_UNVERIFIED' ? '상품 분류를 검증할 canonical 근거가 없습니다.' : code === 'quote:CANONICAL_QUOTE_STALE' ? '가격 관측이 오래되어 현재 판단을 보류합니다.' : code === 'quote:EVIDENCE_MISSING' ? '같은 종목의 검증된 가격 근거가 없습니다.' : code.includes('IDENTITY_MISMATCH') ? '다른 종목의 근거가 섞여 있어 사용하지 않습니다.' : code;
const effectLabels:Record<string,string>={POTENTIALLY_SUPPORTIVE:'잠재적으로 유리 · 조건부',ADVERSE:'불리한 맥락',MIXED:'상충·혼재',UNKNOWN:'판단 보류'};
const riskLabels:Record<string,string>={DAILY_LEVERAGE_PATH_DEPENDENCY:'일일 레버리지·경로 의존',VOLATILITY_DECAY:'변동성 손실',OBSERVED_MOVE_NOT_FUTURE_RETURN:'이미 발생한 움직임 · 미래 수익 아님',STALE_OR_INSUFFICIENT_PRICE:'가격 stale 또는 부족',SESSION_MISMATCH:'세션·기준일 불일치',DIRECT_BENCHMARK_UNAVAILABLE:'직접 benchmark 미확보',INDEX_VS_SAMPLE_BREADTH:'보조 지수와 표본 breadth 상충',TARGET_VS_SECONDARY_INDEX:'직접·보조 지수 상충'};
const factorLabels:Record<string,string>={SEMICONDUCTOR_TREND:'반도체 추세',BREADTH:'상승·하락 확산',LEADERS:'주요 종목',BROAD_MARKET:'전체 시장',RATES:'금리',FX:'환율',VOLATILITY:'변동성',TECHNICAL_STATE:'상품 가격 추세',NEWS_EVENTS:'뉴스·이벤트'};
const stateLabels:Record<string,string>={SUPPORTIVE:'지지',MIXED:'혼재',ADVERSE:'반대',UNKNOWN:'미확인'};
const reviewBlocker=(code:string)=>({CURRENT_PRICE_NOT_CONFIRMING_TREND:'현재 가격 방향이 과거 추세를 확인해 주지 않습니다.',NO_VERIFIED_SUPPORTIVE_EVIDENCE:'검증된 상품 자체의 지지 근거가 없습니다.',TECHNICAL_HISTORY_UNAVAILABLE_OR_STALE:'최근 조정 가격 이력이 부족하거나 오래됐습니다.','TECHNICAL_STATE:HARD_ADVERSE':'상품 자체의 조정 가격 하락 추세가 확인됩니다.','VOLATILITY:HARD_ADVERSE':'변동성 위험이 보류 기준에 해당합니다.'}[code]??blockerLabel(code));
const labels: Record<string, string> = { SEMICONDUCTOR_DIRECT: '반도체 지수 · 확산도', SEMICONDUCTOR_LEADERS: '반도체 주요 종목 · 구성비 미확인', BROAD_MARKET: '전체 시장', RATES: '금리', FX: '환율', VOLATILITY: '변동성', COMMODITY: '원자재', EVENTS: '뉴스·이벤트' };
export function renderScan(host: HTMLElement, scan: UniverseScan, layout: 'A' | 'B', selected: string, select: (symbol: string) => void, discovery?: DiscoveryV2, readOnly = false) {
  host.replaceChildren(); host.className = 'scan-content layout-' + layout;
  host.dataset.snapshot = scan.fingerprint;
  const overview = element('section'); overview.className = 'overview';
  const selectedResult = scan.results.find(r => r.instrument.symbol === selected) ?? scan.results[0]!;
  const discovered=discovery?.results.find(r=>r.symbol===selectedResult.instrument.symbol);
  const count = scan.results.filter(r => r.outcome === 'CANDIDATE_FOR_REVIEW').length;
  overview.append(element('h1', discovery ? candidateSummary(discovery.results) : count ? `검토 가능한 자료 ${count}개 종목` : '자료 부족으로 평가 보류'),
    element('p', `${scan.results.length}개 검사 · ${new Date(scan.cutoffAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })} KST · ${readOnly ? '읽기 전용 평가 · 저장 분석 revision 아님' : 'revision ' + scan.revision}`),
    element('p', selectedResult.instrument.symbol + ' · ' + (discovered?.blockers[0] ? reviewBlocker(discovered.blockers[0]) : selectedResult.blockers[0] ? blockerLabel(selectedResult.blockers[0]) : '검증된 자료를 추가 검토할 수 있습니다.')), element('p', discovery?'자료 준비와 추세 검토를 구분 · 매수·매도 추천 아님':'자료 준비도 검수 · 투자 추천 아님'));
  host.append(overview);
  if(discovery&&layout==='B'){
    const comparison=element('section');comparison.className='comparison';comparison.style.overflowX='auto';comparison.tabIndex=0;comparison.setAttribute('aria-label','동일 시점 종목 비교');
    comparison.append(element('h2','Discovery · 동일 시점 종목 비교'));
    const table=element('table'),head=element('tr');table.style.minWidth='760px';table.style.width='100%';table.style.borderCollapse='collapse';for(const text of ['종목','자료 준비','후보','상품 효과','가격 추세','다음 확인'])head.append(element('th',text));table.append(head);
    for(const r of discovery.results){const tr=element('tr');for(const text of [r.symbol,r.analysisEligibility==='ANALYSIS_READY'?'분석 준비됨':'자료 보류',candidateLabel(r),effectLabels[r.contextEffect.state]!,stateLabels[r.factors.find(f=>f.group==='TECHNICAL_STATE')!.state]!,reviewBlocker(r.blockers[0]??'없음')])tr.append(element('td',text));table.append(tr);}
    for(const cell of table.querySelectorAll('th,td')){(cell as HTMLElement).style.padding='10px';(cell as HTMLElement).style.textAlign='left';(cell as HTMLElement).style.verticalAlign='top';if((cell as HTMLTableCellElement).cellIndex<5)(cell as HTMLElement).style.whiteSpace='nowrap';}comparison.append(element('p','동일 기준시각 비교 · 좁은 화면에서는 표를 좌우로 이동할 수 있습니다.'),table);host.append(comparison);
  }
  if(discovery&&layout==='A'){
    const today=element('section');today.className='today';today.append(element('h2','Home / Today · 지금 중요한 것'),
      element('p',discovery.semiconductor.direct?'직접 반도체 benchmark 연결':'직접 benchmark 미확보 · SOX는 연결된 경우에도 PROXY_ONLY'),
      element('p',discovery.breadth.total ? 'sample leaders breadth · 상승 '+discovery.breadth.advances+' / 하락 '+discovery.breadth.declines+' · 유효 '+discovery.breadth.total+'개 · 전체/가중 지수 아님' : 'breadth 표본 미연결 · 전체/가중 지수 아님'),
      element('p',discovery.semiconductor.conflicts.length?'지수와 표본이 상충합니다. 방향 결론을 보류합니다.':'시장 관측을 상품 구조와 가격 추세에 대조하세요.'),
      element('p','다음: '+(discovered?.nextChecks[0]??'가격과 세션 확인')));host.append(today);
  }
  const list = element('nav'); list.setAttribute('aria-label', '검사 종목'); list.className = 'instrument-list';
  for (const result of scan.results) {
    const statusV2=discovery?.results.find(r=>r.symbol===result.instrument.symbol);
    const button = element('button', result.instrument.symbol + ' · ' + (statusV2 ? candidateLabel(statusV2) : result.outcome === 'NO_CANDIDATE' ? '판단 보류' : '자료 검토 가능'));
    button.type = 'button'; button.setAttribute('aria-pressed', String(selected === result.instrument.symbol));
    button.onclick = () => select(result.instrument.symbol); list.append(button);
  }
  const result = scan.results.find(r => r.instrument.symbol === selected) ?? scan.results[0]!;
  const detail = element('section'); detail.className = 'instrument-detail'; detail.dataset.symbol = result.instrument.symbol;
  detail.append(element('h2', result.instrument.symbol + ' · ' + (discovered ? candidateLabel(discovered) : result.outcome)));
  detail.dataset.outcome = discovered?.marketCandidate ?? result.outcome;
  if(discovered&&discovery){
    detail.dataset.discovery=discovery.fingerprint;
    detail.append(element('p',discovered.analysisEligibility+' · 자료 준비와 투자 후보는 별도 판정입니다.'));
    const coverage=discoveryCoverage(discoveryExplanationInput(scan,discovery,discovered.symbol));
    const gaps=element('section');gaps.className='coverage-preflight';gaps.dataset.fingerprint=coverage.fingerprint;
    gaps.dataset.status=coverage.status;gaps.append(element('h3','AI 설명 준비 · '+coverage.status),
      element('p','규칙으로 확인한 자료 한계 · AI 호출 없이 표시 · 후보 판정은 유지됩니다.'));
    for(const gap of coverage.gaps){const row=element('p',gap.text);row.dataset.gap=gap.code;gaps.append(row);}
    if(coverage.blockers.length){const reasons=element('details');reasons.append(element('summary','설명을 보류한 입력 조건'),element('p',coverage.blockers.join(' / ')));gaps.append(reasons);}
    detail.append(gaps);
    renderMarketEvidence(detail, discoveryExplanationInput(scan,discovery,discovered.symbol));
    const factors=element('section');factors.append(element('h3','판단 요인 · 규칙 '+discovery.ruleVersion));
    for(const f of discovered.factors){const box=element('details');box.append(element('summary',(factorLabels[f.group]??f.group)+' · '+(stateLabels[f.state]??f.state)+' · '+(f.scope==='MARKET_CONTEXT'?'시장 관점':f.scope==='INSTRUMENT'?'상품 자체':'위험')),element('p',f.reason),element('p',f.evidenceIds.join(', ')));factors.append(box);}
    factors.append(element('p','후보 보류 조건: '+(discovered.blockers.map(reviewBlocker).join(' / ')||'없음')),element('p','개인 노출·중복·헤지 적합성: 미연결 / UNKNOWN'));
    for(const next of discovered.nextChecks)factors.append(element('p',next));
    detail.append(factors);
    const effect=discovered.contextEffect,box=element('section');box.className='context-effect';box.dataset.evidence=effect.mechanics?.canonicalId??'MISSING';
    box.append(element('h3','상품별 맥락 · '+effectLabels[effect.state]),element('p',effect.reason),element('p','독립 위험: '+effect.risks.map(r=>riskLabels[r]??r).join(' / ')));
    if(effect.mechanics){const proof=element('details');proof.append(element('summary','공식 투자목표와 원문'),element('p',effect.mechanics.profile.underlying+' · '+effect.mechanics.profile.leverageDirection+' '+effect.mechanics.profile.leverageMultiple+'배 · 일일 목표'),element('p','확인 '+effect.mechanics.fetchedAt+' · '+effect.mechanics.canonicalId));const link=element('a','운용사 원문');link.href=effect.mechanics.profile.sourceUrl!;link.target='_blank';link.rel='noopener noreferrer';proof.append(link);box.append(proof);}detail.append(box);
  }
  const market=result.frozenInputs.quote?.evidence?.market;
  const availability=discovery?.quoteAvailability?.[result.instrument.symbol];
  if(availability){const status=element('p',availability.label);status.className='quote-session-status';status.dataset.status=availability.status;status.dataset.cutoff=availability.cutoffAt;detail.append(status);}
  if(market)detail.append(element('p', '마지막 관측 가격 '+(market.price??'UNKNOWN')+' '+market.currency+' · 관측 세션 '+market.session+' · '+market.priceBasis+' · 참고 변화율 '+(market.changePercent===null?'미확인':market.changePercent.toFixed(2)+'%')),element('p','가격 관측 '+market.observedAt+' · 수집 '+market.fetchedAt+' · scan 기준시각과 구별'));
  const parts: Array<[string, string[]]> = [
    ['진행을 막는 자료', result.blockers.map(blockerLabel)], ['확인된 근거', result.reasons.map(r => r.fact.replace(/(참고값 )([0-9]+\.[0-9]+)/, (_, label: string, value: string) => label + Number(value).toFixed(2)))],
    ['반대 근거', discovered ? [...discovered.factors.filter(f=>f.state==='ADVERSE').map(f=>f.reason),...discovered.blockers.map(reviewBlocker)] : result.counterevidence.map(r => r.fact + ' [' + r.reference.canonicalId + ']')],
    ['아직 모르는 것', discovered?.unresolved ?? result.unresolved], ['다음 확인 행동', discovered?.nextChecks ?? result.reconsiderWhen],
  ];
  for (const [title, rows] of parts) {
    const section = element('section'); section.append(element('h3', title));
    if (!rows.length) section.append(element('p', title === '진행을 막는 자료' ? '현재 준비도 규칙의 차단 항목 없음' : title === '다음 확인 행동' ? '가격의 지연·관측 시각, 반도체 지수와 최신 뉴스 원문을 대조하세요. 포지션 정보는 이번 공개 scan에 없습니다.' : '연결된 근거 없음'));
    else { const ul = element('ul'); for (const text of rows) ul.append(element('li', text)); section.append(ul); }
    detail.append(section);
  }
  if(discovery)detail.append(element('p','출처와 관측 세션 기준의 참고 가격입니다. 실시간 체결 보장 가격이 아닙니다.'));
  const provenance = element('details'); provenance.append(element('summary', 'canonical 근거 · 시점 · fingerprint'));
  for (const slot of result.slots) provenance.append(element('p', `${slot.key}: ${slot.state} · ${slot.reason} · ${slot.reference?.canonicalId ?? 'MISSING'} · ${slot.reference?.fingerprint ?? 'MISSING'}`));
  detail.append(provenance);
  const work = element('div'); work.className = 'scan-work'; work.append(list, detail);
  if (layout === 'A' && !discovery) {
    const next = element('aside'); next.append(element('h2', '먼저 확인할 변화'), element('p', result.blockers.some(b => b.startsWith('quote:')) ? '다음 확인: 같은 종목의 최신 가격과 관측 시각.' : discovered?.nextChecks[0] ?? result.reconsiderWhen[0] ?? '가격 기준시각과 최근 뉴스 원문을 대조하고, 부족한 상품·포지션 근거를 확인하세요.'), element('p', '표시 기준시각의 공개 근거입니다. 현재 시점의 실시간 추천이 아닙니다.'));
    host.append(next);
  }
  host.append(work);
  const context = element('section'); context.className = 'market-context'; context.dataset.fingerprint = scan.marketContext.fingerprint;
  context.append(element('h2', '공통 시장 맥락'), element('p', '모든 종목이 같은 snapshot을 사용합니다. 관련 지표를 독립적인 상승 근거로 세지 않습니다.'));
  for (const group of scan.marketContext.groups) {
    if (group.group === 'EVENTS' && scan.marketContext.news.events.length && !group.unknowns.length) continue;
    const box = element('details'); box.append(element('summary', labels[group.group] + ` · 연결 ${group.items.length}`));
    for (const item of group.items) box.append(element('p', `${item.label ?? item.canonicalId} · ${item.role ?? 'REFERENCE'} · ${item.value ?? 'UNKNOWN'} ${item.unit} · 변화 ${item.change === null ? '미확인' : item.change.toFixed(2) + '%'} · ${item.freshness} · 관측 ${item.observedAt ?? 'UNKNOWN'} · 수집 ${item.fetchedAt ?? 'UNKNOWN'} · ${item.source} · ${item.canonicalId}`));
    for (const missing of group.unknowns) box.append(element('p', missing)); context.append(box);
  }
  host.append(context);
  const news = element('section'); news.append(element('h2', '연결된 뉴스·이벤트'),element('p','최근 발행은 현재 가격 움직임의 원인이 확인됐다는 뜻이 아닙니다. 역사적 기사와 전망·의견을 구분해 원문을 확인하세요.'));
  if(scan.marketContext.news.translation)news.append(element('p', '한국어 제목: 이번 미리보기에서 검수한 번역 · 원문 제공자의 번역 아님 · 번역 시각 '+scan.marketContext.news.translation.createdAt));
  if (!scan.marketContext.news.events.length) news.append(element('p', '검증된 뉴스 미연결 · 기사가 없다는 뜻이 아닙니다.'));
  for (const item of scan.marketContext.news.events) {
    const linked=discovery?.newsLinks.find(n=>n.canonicalId===item.event.id);
    const article = element('article'); if(linked)article.append(element('p',linked.affectedGroups.join(', ')+' · '+linked.direction+' · '+linked.confidence)); article.append(element('h3', item.event.titleKo ?? item.event.title), element('p', item.freshness + ' · 관련: ' + (item.affectedInstruments.join(', ') || '공통 시장 맥락') + ' · ' + (item.event.titleKo ? item.event.translation : 'translation unavailable')));
    const original=element('details');original.append(element('summary','원문 제목·발췌·근거'),element('p',item.event.title),element('p',item.event.excerpt??'발췌 없음'),element('p','canonical ID '+item.event.id));article.append(original);
    for (const source of item.event.sources) { const a = element('a', (source.primary ? '1차 출처 · ' : '매체 · ') + source.name); a.href = source.url; a.rel = 'noopener noreferrer'; a.target = '_blank'; article.append(a); }
    article.append(element('p', `발행 ${item.event.publishedAt ?? 'UNKNOWN'} · 이 배치 최초 관측 ${item.provenance[0]?.firstObservedAt ?? 'NOT STORED'}`)); news.append(article);
  }
  host.append(news);
}
