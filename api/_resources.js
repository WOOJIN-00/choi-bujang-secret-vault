// 8단계 공통 모듈(라우트 아님: 파일명이 _로 시작하면 Vercel이 함수로 노출하지 않음).
// 자료가 갈 수 있는 '구역(zone)'을 나누는 자원 식별 층입니다.
// 내 자료실 메모와 강사 공지를 서로 다른 '자원 ID' 네임스페이스로 구분합니다.
// 기존 주소(route)와 자료(id/title/body)는 그대로 두고, 요청마다 서버가 구별할 수 있는 자원 ID만 붙입니다.

// 구역 정의. 같은 종류끼리 한 구역, 구역마다 자원 ID 접두사가 달라 서로 섞이지 않습니다.
export const RESOURCE_ZONES = Object.freeze({
  // 내 자료실 메모: 소유자(본인) 전용 자료.
  myNotes: Object.freeze({ zone: 'my-notes', kind: 'note' }),
  // 강사 공지: 반 공용 자료(읽기 성격). 메모와 다른 구역/자원 ID.
  instructorNotice: Object.freeze({ zone: 'instructor-notice', kind: 'notice' }),
});

const zonePrefix = (zoneDef) => `res:${zoneDef.zone}:${zoneDef.kind}`;

// 한 자원의 자원 ID. 식별자가 있으면 한 건, 없으면 그 구역의 컬렉션 수준 ID.
export function resourceId(zoneDef, itemId) {
  const base = zonePrefix(zoneDef);
  return (itemId === undefined || itemId === null || itemId === '') ? base : `${base}:${itemId}`;
}

export const memoResourceId = (itemId) => resourceId(RESOURCE_ZONES.myNotes, itemId);
export const noticeResourceId = (itemId) => resourceId(RESOURCE_ZONES.instructorNotice, itemId);

// 요청의 경로로 어느 구역/자원인지 서버가 구별합니다(주소는 그대로, 구별만 추가).
//   메모 주소:     /api/notes, /api/notes/:id       → my-notes
//   강사 공지 주소: /api/notices, /api/notices/:id   → instructor-notice (별도 구역)
// 어느 구역에도 맞지 않으면 zone: 'unknown', resourceId: null 로 둬 임의로 승격하지 않습니다.
export function resourceForRequest(request) {
  const rawPath = typeof request?.url === 'string'
    ? request.url.split('?')[0]
    : (typeof request?.path === 'string' ? request.path : '');
  const itemId = typeof request?.query?.id === 'string' && request.query.id ? request.query.id : undefined;

  if (/\/api\/notices(\/|$)/.test(rawPath)) {
    return { zone: RESOURCE_ZONES.instructorNotice.zone, resourceId: noticeResourceId(itemId) };
  }
  if (/\/api\/notes(\/|$)/.test(rawPath)) {
    return { zone: RESOURCE_ZONES.myNotes.zone, resourceId: memoResourceId(itemId) };
  }
  return { zone: 'unknown', resourceId: null };
}

// 응답에 자원 구역/ID를 표시합니다(본문은 그대로, 헤더로만 구별값 전달).
export function tagResponse(response, descriptor) {
  if (!descriptor || !descriptor.resourceId) return descriptor;
  response.setHeader('X-Resource-Zone', descriptor.zone);
  response.setHeader('X-Resource-Id', descriptor.resourceId);
  return descriptor;
}
