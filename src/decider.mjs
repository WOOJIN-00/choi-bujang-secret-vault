// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 6단계부터 규칙을 하나씩 추가합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['starter.deny', 'device_registered']);

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
