// 10단계 자료 복원 공통 모듈(라우트 아님: _ 시작).
// 복구의 '검증'은 정적 사본 + 무결성 장부로 합니다(api/_backups.js). 이 파일은 작은 도우미만 둡니다.
import { createHash } from 'node:crypto';
import { UUID } from './_notes.js';

// 내용 해시: content 문자열의 SHA-256(소문자 16진수).
export function contentHash(content) {
  return createHash('sha256').update(String(content ?? ''), 'utf8').digest('hex');
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

// 요청 본문에서 복원 대상 { id }만 읽습니다. owner_id·content 등은 요청에서 받지 않습니다.
export function readRestoreId(request) {
  const raw = request.body;
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw
    : (typeof raw === 'string' && raw ? safeJson(raw) : null);
  if (!data || typeof data !== 'object') return null;
  const { id } = data;
  return typeof id === 'string' && UUID.test(id) ? id : null;
}

// 감사 이력에 남길 한 건(소유자 ID는 가명 UUID이며 실명/이메일/본문이 아닙니다).
export function buildAuditEntry({ identity, backup, at }) {
  return {
    at,
    action: 'restore_one',
    actor: identity && typeof identity.userId === 'string' ? identity.userId : null,
    note_id: backup.id,
    owner_id: backup.owner_id,
    content_sha256: backup.content_sha256,
  };
}
