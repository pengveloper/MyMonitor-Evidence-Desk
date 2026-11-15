export type MarketRegimeCode =
  | 'BROAD_RISK_ON'
  | 'NARROW_RALLY'
  | 'MIXED'
  | 'DETERIORATING'
  | 'BROAD_RISK_OFF';

export type MarketDirection = 'UP' | 'DOWN' | 'FLAT' | 'UNKNOWN';

export interface MarketBreadthWindow {
  percentage: number;
  coverage?: number;
  numerator?: number;
  denominator?: number;
}

export interface MarketBreadthObservation {
  observationDate: string;
  provider: string;
  methodologyVersion?: string;
  universeVersion?: string;
  commonStocks?: number;
  windows: {
    '20d': MarketBreadthWindow;
    '50d': MarketBreadthWindow;
    '200d': MarketBreadthWindow;
  };
}

export interface MarketRegimeInput {
  breadth?: MarketBreadthObservation;
  sp500Direction: MarketDirection;
  vixDirection: MarketDirection;
  sectorDirection?: MarketDirection;
}

export interface MarketRegimeAssessment {
  code: MarketRegimeCode;
  label: string;
  interpretation: string;
  marketConfirmation: string;
  counterEvidence: string[];
  nextSignal: string;
}

function rounded(value: number): string {
  return `${Math.round(value * 100) / 100}%`;
}

/**
 * Explainable market-regime rules. Breadth is the participation evidence;
 * S&P 500, VIX, and optional sector direction are confirmation/counter-signals.
 * No generative model participates in this classification.
 */
export function assessMarketRegime(input: MarketRegimeInput): MarketRegimeAssessment {
  const { breadth, sp500Direction, vixDirection, sectorDirection = 'UNKNOWN' } = input;
  if (!breadth) {
    if (sp500Direction === 'DOWN' && vixDirection === 'UP') {
      return {
        code: 'MIXED',
        label: '위험 회피 신호',
        interpretation: 'S&P 500 약세와 VIX 상승이 겹쳤지만 시장 참여 폭을 확인할 breadth 근거가 없습니다.',
        marketConfirmation: '가격·변동성은 위험 회피 방향을 확인하지만 내부 확산은 미확인입니다.',
        counterEvidence: ['시장 breadth가 없어 광범위한 위험 회피로 확정할 수 없습니다.'],
        nextSignal: '20·50·200일 breadth와 업종 확산을 확인하세요.',
      };
    }
    if (sp500Direction === 'UP' && vixDirection === 'DOWN') {
      return {
        code: 'MIXED',
        label: '위험 선호 신호',
        interpretation: 'S&P 500 상승과 VIX 완화가 겹쳤지만 상승 참여 폭을 확인할 breadth 근거가 없습니다.',
        marketConfirmation: '가격·변동성은 위험 선호 방향을 확인하지만 내부 확산은 미확인입니다.',
        counterEvidence: ['시장 breadth가 없어 광범위한 위험 선호로 확정할 수 없습니다.'],
        nextSignal: '20·50·200일 breadth와 업종 확산을 확인하세요.',
      };
    }
    if (sp500Direction === 'DOWN') {
      return {
        code: 'MIXED',
        label: '주가 약세 · 교차 확인 필요',
        interpretation: 'S&P 500은 약세지만 VIX와 시장 참여 폭이 같은 방향인지 확인되지 않았습니다.',
        marketConfirmation: '가격 약세만 확인됐고 광범위한 위험 회피는 미확인입니다.',
        counterEvidence: vixDirection === 'DOWN'
          ? ['VIX 완화는 전면 위험 회피 해석에 반대되는 근거입니다.']
          : ['시장 breadth가 없어 약세 확산 범위를 알 수 없습니다.'],
        nextSignal: 'VIX 방향과 20·50·200일 breadth를 확인하세요.',
      };
    }
    if (sp500Direction === 'UP') {
      return {
        code: 'MIXED',
        label: '주가 강세 · 확산 확인 필요',
        interpretation: 'S&P 500은 상승하지만 시장 참여 폭이 같은 방향인지 확인되지 않았습니다.',
        marketConfirmation: '가격 상승만 확인됐고 광범위한 위험 선호는 미확인입니다.',
        counterEvidence: vixDirection === 'UP'
          ? ['VIX 상승은 위험 선호 해석에 반대되는 근거입니다.']
          : ['시장 breadth가 없어 상승 확산 범위를 알 수 없습니다.'],
        nextSignal: '20·50·200일 breadth와 VIX 방향을 확인하세요.',
      };
    }
    return {
      code: 'MIXED',
      label: '혼조 · 판단 제한',
      interpretation: '확인 가능한 가격·변동성 입력만으로 시장 참여 폭을 판단할 수 없습니다.',
      marketConfirmation: '시장 확인이 충분하지 않습니다.',
      counterEvidence: ['시장 breadth 또는 가격·변동성의 교차 확인이 부족합니다.'],
      nextSignal: 'S&P 500, VIX, 시장 breadth의 같은 관측 세션을 확인하세요.',
    };
  }

  const short = breadth.windows['20d'].percentage;
  const medium = breadth.windows['50d'].percentage;
  const long = breadth.windows['200d'].percentage;
  const strongBreadth = short >= 60 && medium >= 55 && long >= 50;
  const weakBreadth = short < 40 && medium < 45;
  const broadWeakness = weakBreadth && long < 45;
  const weakeningStack = short < medium && medium < long;
  const breadthSentence = `20일 ${rounded(short)}, 50일 ${rounded(medium)}, 200일 ${rounded(long)}`;

  if (strongBreadth && sp500Direction === 'UP' && vixDirection !== 'UP') {
    return {
      code: 'BROAD_RISK_ON',
      label: '광범위 위험 선호',
      interpretation: `${breadthSentence}로 상승 참여가 넓고 S&P 500도 상승 방향입니다.`,
      marketConfirmation: vixDirection === 'DOWN'
        ? 'S&P 500 상승과 VIX 완화가 breadth 확산을 함께 확인합니다.'
        : 'S&P 500은 확인했지만 VIX 방향은 추가 확인이 필요합니다.',
      counterEvidence: sectorDirection === 'DOWN'
        ? ['업종 방향은 약세여서 광범위 확산 해석과 충돌합니다.']
        : ['급격한 VIX 반등이나 20일 breadth 하락은 이 판단을 약화시킵니다.'],
      nextSignal: '20일 breadth가 50일 breadth 위에서 유지되는지 확인하세요.',
    };
  }

  if (sp500Direction === 'UP' && (short < 50 || medium < 50)) {
    return {
      code: 'NARROW_RALLY',
      label: '좁은 상승',
      interpretation: `S&P 500은 상승하지만 ${breadthSentence}로 상승 참여가 충분히 넓지 않습니다.`,
      marketConfirmation: '지수 가격은 상승을 확인하지만 breadth는 광범위한 위험 선호를 확인하지 않습니다.',
      counterEvidence: [
        long >= 50
          ? `200일 breadth ${rounded(long)}는 장기 참여가 과반임을 보여 단기 약화만으로 전면 위험 회피를 뜻하지 않습니다.`
          : '지수 상승 자체는 즉각적인 전면 위험 회피 해석에 반대되는 근거입니다.',
      ],
      nextSignal: '20일 breadth 회복, VIX 방향, 업종별 확산을 함께 확인하세요.',
    };
  }

  if (broadWeakness && sp500Direction === 'DOWN' && vixDirection === 'UP') {
    return {
      code: 'BROAD_RISK_OFF',
      label: '광범위 위험 회피',
      interpretation: `${breadthSentence}로 단기·중기·장기 참여가 약하고 가격 약세와 VIX 상승도 겹쳤습니다.`,
      marketConfirmation: 'breadth, S&P 500, VIX가 같은 위험 회피 방향을 확인합니다.',
      counterEvidence: sectorDirection === 'UP'
        ? ['일부 업종 방향은 상승이어서 모든 영역의 약세로 단정할 수 없습니다.']
        : ['20일 breadth 회복이나 VIX 완화가 확인되면 판단을 낮춰야 합니다.'],
      nextSignal: '20일 breadth 40% 회복과 VIX 완화가 함께 나타나는지 확인하세요.',
    };
  }

  if (weakBreadth || weakeningStack || sp500Direction === 'DOWN' || vixDirection === 'UP') {
    const counterEvidence: string[] = [];
    if (sp500Direction === 'UP') counterEvidence.push('S&P 500 상승은 내부 확산 약화와 충돌하는 현재 반대 근거입니다.');
    if (vixDirection === 'DOWN') counterEvidence.push('VIX 완화는 즉각적인 위험 회피 전환에 반대되는 근거입니다.');
    if (long >= 50) counterEvidence.push(`200일 breadth ${rounded(long)}는 장기 참여가 아직 과반임을 보여줍니다.`);
    if (counterEvidence.length === 0) counterEvidence.push('breadth 회복이나 가격·변동성 반전이 확인되면 판단을 낮춰야 합니다.');
    return {
      code: 'DETERIORATING',
      label: '내부 확산 약화',
      interpretation: `${breadthSentence}로 단기 참여가 중·장기보다 약하거나 절대 수준이 낮습니다.`,
      marketConfirmation: sp500Direction === 'DOWN' || vixDirection === 'UP'
        ? '가격 약세 또는 VIX 상승이 breadth 약화를 일부 확인합니다.'
        : '가격·변동성이 breadth 약화를 아직 확인하지 않았습니다.',
      counterEvidence,
      nextSignal: '20일 breadth의 40% 회복과 S&P 500·VIX 동행 여부를 확인하세요.',
    };
  }

  return {
    code: 'MIXED',
    label: '혼조',
    interpretation: `${breadthSentence}이며 가격·변동성 입력이 한 방향으로 정렬되지 않았습니다.`,
    marketConfirmation: '시장 신호가 서로 충분히 확인되지 않았습니다.',
    counterEvidence: ['단일 지표만으로 위험 선호 또는 위험 회피를 확정할 수 없습니다.'],
    nextSignal: '20일 breadth, S&P 500, VIX가 같은 방향으로 정렬되는지 확인하세요.',
  };
}
