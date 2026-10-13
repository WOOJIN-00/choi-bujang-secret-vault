// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 6단계부터 규칙을 하나씩 추가합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required']);

// 출처가 없음을 뜻하는 표식(실제 경로의 기본값). 접속 증거로 쓰지 않습니다.
const NO_EVIDENCE_SOURCES = new Set(['none', 'unknown', '']);

// 입력 검사: 엔진이 넘긴 '가상 접속 정보'의 출처(signals.source)를 구분합니다.
//  - source 가 none/unknown/빈값/모르는 값이면 지역·시각·네트워크를 unknown(null)으로 둡니다.
//    없는 값을 임의의 정상값으로 채우지 않습니다 → 위조한 클라이언트 값이 신뢰 접속 정보로 승격되지 않습니다.
//  - judge_fixture 는 심판의 가상 입력이라 값은 읽되 realEvidence(실제 위치 증거)로는 취급하지 않습니다.
//  - 실제 위치 증거로 신뢰 가능한 출처는 아직 계약에 없으므로 realEvidence 는 현재 항상 false 입니다.
//  - 행동(recentEvents)은 엔진이 준 배열일 때만 알려진 것으로 봅니다.
// 이 함수는 입력을 분류만 하고 어떤 규칙도 바꾸지 않습니다(7단계 규칙이 이 값을 씁니다).
export function readAccessContext(request) {
  const signals = request && typeof request.signals === 'object' && request.signals !== null
    ? request.signals : {};
  const source = typeof signals.source === 'string' && signals.source !== '' ? signals.source : null;

  let sourceKind;
  if (source === null || NO_EVIDENCE_SOURCES.has(source)) sourceKind = 'none';
  else if (source === 'judge_fixture') sourceKind = 'fixture';
  else sourceKind = 'unclear'; // 엔진이 보증한다고 알 수 없는 출처 → 신뢰하지 않음

  // 값을 읽어도 되는(= 선언된) 출처인가. none/unclear 는 값을 신뢰하지 않습니다.
  const declared = sourceKind === 'fixture';
  const realEvidence = false; // 실제 위치 증거로 승격 가능한 출처는 아직 없음

  const text = (name) => {
    const v = signals[name];
    if (!declared || typeof v !== 'string' || v === '' || v === 'unknown') {
      return { value: null, known: false };
    }
    return { value: v, known: true };
  };
  const h = signals.hour;
  const hour = (declared && Number.isInteger(h) && h >= 0 && h <= 23)
    ? { value: h, known: true }
    : { value: null, known: false };
  const events = request && Array.isArray(request.recentEvents) ? request.recentEvents : null;
  const behavior = events === null ? { events: null, known: false } : { events, known: true };

  return {
    source,
    sourceKind,
    realEvidence,
    region: text('region'),
    network: text('network'),
    hour,
    behavior,
  };
}

// 평소와 다른 시각: 알려진 시각이면서 야간대(22:00~05:59). 모르는 시각은 이상으로 몰지 않습니다.
function isUnusualHour(hour) {
  if (!hour.known) return false;
  return hour.value >= 22 || hour.value < 6;
}

// 처음 보는 네트워크: 알려진 네트워크 값이 평소('usual')가 아닐 때. 모르면 이상 아님.
function isUnfamiliarNetwork(network) {
  if (!network.known) return false;
  return network.value !== 'usual';
}

// 갑자기 많은 자료 읽기: 엔진이 준 최근(≤15분) 사건 중 읽은 양(count)이 큰(≥10) 것이 있음.
function hasSuddenManyReads(behavior) {
  if (!behavior.known || !Array.isArray(behavior.events)) return false;
  return behavior.events.some((e) => e && Number.isInteger(e.count) && e.count >= 10
    && Number.isInteger(e.ageSeconds) && e.ageSeconds >= 0 && e.ageSeconds <= 900);
}

// 복합 이상 접속: 세 신호가 '함께' 있을 때만. 지역 하나만으로는 판단하지 않습니다.
function isAnomalousAccess(access) {
  return isUnusualHour(access.hour)
    && isUnfamiliarNetwork(access.network)
    && hasSuddenManyReads(access.behavior);
}

// 최근에 추가 본인 확인을 통과했는가(0~900초). 이 값만 보고 무조건 건너뛰지 않도록 범위를 검사합니다.
function isRecentlyReverified(stepUp) {
  return Boolean(stepUp) && stepUp.verified === true
    && Number.isInteger(stepUp.authAgeSeconds)
    && stepUp.authAgeSeconds >= 0 && stepUp.authAgeSeconds <= 900;
}

export async function decide(request) {
  const base = {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
  };

  // device_registered 규칙(기존 유지): 엔진이 확인해 넣어 준 deviceRegistered 가 true 일 때만 진행.
  // 미등록(false)이거나 값이 없으면 거부합니다.
  // (브라우저가 보낸 값이 아니라 엔진이 기기를 확인한 결과만 씁니다. 새 인증서·키는 만들지 않습니다.)
  if (request.deviceRegistered !== true) {
    return {
      ...base,
      decision: 'deny',
      reasonCode: 'device_not_registered',
      ruleIds: ['device_registered'],
    };
  }

  // step_up_required 규칙: 등록 기기라도 '평소와 다른 시각 + 처음 보는 네트워크 + 갑자기 많은 자료 읽기'가
  // 함께 나타나면 영구 차단(deny) 대신 추가 본인 확인(step_up)을 요구합니다. 사유는 reasonCode 로 남깁니다.
  // 지역 하나만으로는 차단하지 않으며(readAccessContext가 지역을 판단 근거로 넘기지 않음),
  // 최근 추가 확인을 통과한 요청은 다시 묻지 않고 통과시킵니다.
  const access = readAccessContext(request);
  if (!isRecentlyReverified(request.stepUp) && isAnomalousAccess(access)) {
    return {
      ...base,
      decision: 'step_up',
      reasonCode: 'step_up_required',
      ruleIds: ['step_up_required'],
    };
  }

  return {
    ...base,
    decision: 'allow',
    reasonCode: 'approved',
    ruleIds: ['device_registered'],
  };
}
