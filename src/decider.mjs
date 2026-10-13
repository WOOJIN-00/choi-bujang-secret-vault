// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 6단계부터 규칙을 하나씩 추가합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['device_registered']);

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

export async function decide(request) {
  const base = {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
  };

  // device_registered 규칙: 엔진이 확인해 넣어 준 deviceRegistered 가 true 일 때만
  // 내 자료실 읽기를 허용합니다. 미등록(false)이거나 값이 없으면 거부합니다.
  // (브라우저가 보낸 값이 아니라 엔진이 기기를 확인한 결과만 씁니다. 새 인증서·키는 만들지 않습니다.)
  if (request.deviceRegistered === true) {
    return {
      ...base,
      decision: 'allow',
      reasonCode: 'approved',
      ruleIds: ['device_registered'],
    };
  }

  return {
    ...base,
    decision: 'deny',
    reasonCode: 'device_not_registered',
    ruleIds: ['device_registered'],
  };
}
