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

export function detect(events) {
  // 이번 단계는 입력 정리만 합니다. 안전한 값만 추린 뒤, 회수 제안 판정은 다음 단계에서 채웁니다.
  readEvents(events);
  return { action: 'observe' };
}
