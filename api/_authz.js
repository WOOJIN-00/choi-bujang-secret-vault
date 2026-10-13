// 8단계 API 측 권한 확인(심층 방어). 라우트 아님(_ 시작).
// 판정기의 구역 규칙과 별개로, 자료 API가 '다시' 대조합니다:
//   - 검증된 사용자(토큰의 userId)와 저장된 소유자(owner_id)
//   - 강사 권한
// 화면 메뉴나 요청 본문의 role 은 절대 믿지 않습니다. 권한은 검증된 신원과 서버 설정에서만 옵니다.

// 강사 사용자 목록은 서버 환경변수(INSTRUCTOR_USER_IDS, 쉼표 구분)에서만 읽습니다.
// 본문·메뉴의 role 로는 절대 강사 권한을 얻을 수 없습니다. 미설정이면 강사 없음(기본 거부).
export function instructorUserIds() {
  const raw = process.env.INSTRUCTOR_USER_IDS;
  if (typeof raw !== 'string' || !raw.trim()) return new Set();
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

// 검증된 신원이 강사인가. 학생 토큰이면서 서버 허용목록에 든 사용자만 true.
// (요청 본문의 role, 화면 메뉴 선택은 보지 않습니다.)
export function isInstructor(identity) {
  return Boolean(identity) && identity.kind === 'student'
    && typeof identity.userId === 'string' && instructorUserIds().has(identity.userId);
}

// 검증된 사용자가 이 자료의 소유자인가(저장된 owner_id 와 토큰 userId 대조).
export function ownsResource(identity, ownerId) {
  return Boolean(identity) && typeof identity.userId === 'string'
    && typeof ownerId === 'string' && ownerId === identity.userId;
}

// 메모(내 자료) 접근 권한: 소유자만 허용. 거부 사유는 짧게.
export function authorizeMemo(identity, ownerId) {
  return ownsResource(identity, ownerId) ? { ok: true } : { ok: false, reason: 'not_owner' };
}

// 강사 자료·공지 관리 권한: 검증된 강사만. 본문 role 은 보지 않음.
export function authorizeInstructor(identity) {
  return isInstructor(identity) ? { ok: true } : { ok: false, reason: 'not_instructor' };
}
