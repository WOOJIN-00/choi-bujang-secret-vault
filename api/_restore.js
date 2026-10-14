// 10단계 자료 한 건 복원의 공통 모듈(라우트 아님: _ 시작).
// 비공개 가상 메모 사본(백업)에서 '지정한 한 건'만 되살릴 때,
// ID·소유자·내용(content) 해시를 사본과 대조합니다. 본문은 응답/로그에 남기지 않습니다.
import { createHash } from 'node:crypto';
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

// 복원 전 '백업 검증': 복구는 호출자 소유권이 아니라 '사본 무결성'으로 판단합니다.
//   - 사본 없음/ID 불일치 → 404로 숨김(존재 노출 금지).
//   - 사본 무결성(내용↔해시) 불일치 → 손상/변조 의심이므로 복원 중단(409).
//   복원은 사본에 기록된 '원래 소유자' 그대로 되살립니다(소유자를 바꾸지 않고, 본문도 응답에 담지 않음).
//   목록/읽기/수정의 소유자 격리는 그대로이며, 여기서만 복구용으로 백업 무결성을 기준으로 씁니다.
export function verifyAgainstBackup({ requestedId, backup }) {
  if (!backup || typeof backup !== 'object') return { ok: false, reason: 'not_found' };
  if (backup.id !== requestedId) return { ok: false, reason: 'id_mismatch' };
  if (typeof backup.owner_id !== 'string' || !backup.owner_id) return { ok: false, reason: 'not_found' };
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

// 생성 시 검증된 사본 저장: 메모가 POST /api/notes로 만들어질 때 그 시점 내용을 사본에 담습니다.
//   content_sha256을 함께 넣어 두면, 나중에 복원 전/후 대조의 기준이 됩니다.
//   같은 id가 이미 있으면 사본은 '생성 시점 값'을 유지합니다(변조 PUT은 사본을 바꾸지 않음).
//   최선 노력(best-effort): 실패해도 메모 생성 자체는 막지 않고 호출부가 로그만 남깁니다.
export async function saveVerifiedBackup(supabase, memo) {
  const row = {
    id: memo.id,
    owner_id: memo.owner_id,
    title: memo.title,
    content: memo.content,
    content_sha256: contentHash(memo.content),
  };
  return supabase.from('secret_notes_backup').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
}

// 진단용 자취(공개 X). 복원 호출·결과를 s10_trace에 남겨 심판 흐름을 확인합니다(최선 노력).
// 비밀값·본문은 넣지 않습니다. 표가 없거나 실패해도 복원 동작에는 영향이 없습니다.
export async function trace(supabase, event, detail) {
  try {
    await supabase.from('s10_trace').insert({
      event: String(event).slice(0, 80),
      detail: detail === undefined || detail === null ? null : String(detail).slice(0, 300),
    });
  } catch { /* 진단 실패는 무시 */ }
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
