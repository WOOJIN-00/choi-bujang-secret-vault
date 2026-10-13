// 10단계 자료 한 건 복원의 공통 모듈(라우트 아님: _ 시작).
// 비공개 가상 메모 사본(백업)에서 '지정한 한 건'만 되살릴 때,
// ID·소유자·내용(content) 해시를 사본과 대조합니다. 본문은 응답/로그에 남기지 않습니다.
import { createHash } from 'node:crypto';
import { ownsResource } from './_authz.js';
import { UUID } from './_notes.js';

// 내용 해시: content 문자열의 SHA-256(소문자 16진수). DB 백업의 content_sha256과 같은 방식.
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

// 복원 전 대조: 사본 한 건이 (요청 ID · 검증된 소유자 · 내용 해시)와 모두 맞는지.
//   - 없음/ID 불일치/소유자 아님 → 호출부가 404로 숨깁니다(남의 자료 존재 노출 금지).
//   - 사본 무결성 불일치 → 손상/변조 의심이므로 복원 중단(409).
export function verifyAgainstBackup({ identity, requestedId, backup }) {
  if (!backup || typeof backup !== 'object') return { ok: false, reason: 'not_found' };
  if (backup.id !== requestedId) return { ok: false, reason: 'id_mismatch' };
  if (!ownsResource(identity, backup.owner_id)) return { ok: false, reason: 'not_owner' };
  if (typeof backup.content_sha256 !== 'string'
      || contentHash(backup.content) !== backup.content_sha256) {
    return { ok: false, reason: 'backup_integrity_mismatch' };
  }
  return { ok: true, ownerId: backup.owner_id, contentSha256: backup.content_sha256 };
}

// 복원 후 대조: 되살린 행이 사본과 ID·소유자·내용 해시까지 같은지 확인합니다.
export function verifyRestored({ backup, restored }) {
  if (!restored || typeof restored !== 'object') return { ok: false, reason: 'missing_restored' };
  if (restored.id !== backup.id) return { ok: false, reason: 'id_mismatch' };
  if (restored.owner_id !== backup.owner_id) return { ok: false, reason: 'owner_mismatch' };
  if (contentHash(restored.content) !== backup.content_sha256) return { ok: false, reason: 'content_mismatch' };
  return { ok: true };
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
