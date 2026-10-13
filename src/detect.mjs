// 9단계 입력 정리 단계입니다. 가상 조회 사건에서 안전한 값만 읽습니다.
// 읽는 값: 가명 사용자(identity.sub)·기기(device)·요청 종류(method)·엔진이 준 판정(decision),
// 그리고 묶음 계산에 필요한 시각(at). 메모 본문·토큰·실명 등 그 밖의 값은 읽지도 담지도 않습니다.
// 브라우저가 보낸 사용자 번호는 신원으로 쓰지 않습니다(반 엔진이 검증한 사건만 전달).

function readString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// 사건 하나에서 안전한 값만 새 객체로 추립니다(원본 사건을 그대로 담지 않음).
export function readEvent(event) {
  const source = event && typeof event === 'object' ? event : {};
  const identity = source.identity && typeof source.identity === 'object' ? source.identity : {};
  return {
    at: readString(source.at), // 시각(묶음 구간 계산용, 비밀값 아님)
    method: readString(source.method), // 요청 종류
    subject: readString(identity.sub), // 가명 사용자
    device: readString(source.device), // 기기(있을 때만)
    decision: readString(source.decision), // 엔진이 준 판정(있을 때만)
  };
}

// 사건 묶음을 안전한 값만 남긴 기록으로 정리합니다.
export function readEvents(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  return events.map(readEvent);
}

const WINDOW_MS = 10 * 60 * 1000; // 10분 구간
const BURST_LIMIT = 120; // 120건 초과(=121건 이상)만 의심. 정확히 120건은 대상 아님.

// 갑작스러운 다량 조회: 같은 가명 사용자의 GET이 어느 10분 구간에서든 120건을 넘는지 찾습니다.
// 다른 사용자의 사건을 합산하거나 10분 밖의 사건을 같은 묶음으로 세지 않습니다.
// 네트워크·지역 신호는 9단계 사건 계약에 없으므로 판정에 쓰지 않습니다(복합 조건은 7단계 step_up 담당).
function findBurstSubject(readings) {
  const timesBySubject = new Map();
  for (const reading of readings) {
    if (reading.method !== 'GET' || !reading.subject || !reading.at) continue;
    const ms = Date.parse(reading.at);
    if (Number.isNaN(ms)) continue;
    if (!timesBySubject.has(reading.subject)) timesBySubject.set(reading.subject, []);
    timesBySubject.get(reading.subject).push(ms);
  }
  for (const [subject, times] of timesBySubject) {
    times.sort((a, b) => a - b);
    let left = 0;
    for (let right = 0; right < times.length; right += 1) {
      while (times[right] - times[left] > WINDOW_MS) left += 1; // 10분 밖은 묶음에서 제외
      if (right - left + 1 > BURST_LIMIT) return subject;
    }
  }
  return null;
}

export function detect(events) {
  const readings = readEvents(events); // 안전한 값만 추린 기록으로 정리
  const subject = findBurstSubject(readings);
  if (subject) return { action: 'propose_revocation', reasonCode: 'burst_read', subject };
  return { action: 'observe' };
}
