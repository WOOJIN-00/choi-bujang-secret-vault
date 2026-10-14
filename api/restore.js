// 자료 복원 API (한 건): POST /api/restore
//   본문 { id } — 비공개 가상 메모 사본(secret_notes_backup)에서 그 한 건만 되살립니다.
//   ID·소유자·내용 해시를 사본과 대조하고, 다른 메모와 감사 기록은 보존합니다.
//   소유자는 검증된 토큰의 userId로만 판단합니다(본문/URL의 owner_id·role 불신).
import { authenticate } from './_notes.js';
import { memoResourceId } from './_resources.js';
import {
  readRestoreId, verifyAgainstBackup, verifyRestored, buildAuditEntry,
} from './_restore.js';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  const auth = await authenticate(request, response);
  if (!auth) return;
  const { identity, supabase } = auth;

  const id = readRestoreId(request);
  console.log(`[S10] restore POST actor=${identity.kind} idOk=${Boolean(id)}`);
  if (!id) {
    response.status(400).json({ error: 'INVALID_ID' });
    return;
  }

  // 1) 비공개 사본에서 그 한 건을 읽습니다(service_role, 서버 전용).
  const { data: backup, error: readError } = await supabase
    .from('secret_notes_backup')
    .select('id, owner_id, title, content, content_sha256')
    .eq('id', id)
    .maybeSingle();
  if (readError) {
    console.error('restore: 사본을 읽지 못했습니다.');
    response.status(502).json({ error: 'RESTORE_BACKEND_FAILED' });
    return;
  }

  // 2) 복원 전 대조: ID·소유자·내용 해시. 손상 사본이면 중단, 그 외 불일치는 404로 숨김.
  const check = verifyAgainstBackup({ identity, requestedId: id, backup });
  console.log(`[S10] restore id=${id} backupFound=${Boolean(backup)} verifyOk=${check.ok} reason=${check.reason ?? '-'}`);
  if (!check.ok) {
    if (check.reason === 'backup_integrity_mismatch') {
      console.error('restore: 사본 무결성 불일치 → 복원 중단.');
      response.status(409).json({ error: 'BACKUP_INTEGRITY_MISMATCH' });
      return;
    }
    console.error(`restore: 복원 불가(${check.reason}) → 404.`);
    response.status(404).json({ error: 'NOT_FOUND' });
    return;
  }

  // 3) 그 한 건만 되살립니다(id 기준 upsert). owner_id/내용은 사본 값만 쓰고, 다른 행은 건드리지 않습니다.
  const { data: restored, error: writeError } = await supabase
    .from('secret_notes')
    .upsert(
      { id: backup.id, owner_id: backup.owner_id, title: backup.title, content: backup.content },
      { onConflict: 'id' },
    )
    .select('id, owner_id, content')
    .single();
  if (writeError) {
    console.error('restore: 되살리지 못했습니다.');
    response.status(502).json({ error: 'RESTORE_WRITE_FAILED' });
    return;
  }

  // 4) 복원 후 대조: 되살린 한 건이 사본과 ID·소유자·내용 해시까지 같은지 확인.
  const verified = verifyRestored({ backup, restored });
  if (!verified.ok) {
    console.error(`restore: 복원 결과 대조 실패(${verified.reason}).`);
    response.status(500).json({ error: 'RESTORE_VERIFY_FAILED' });
    return;
  }

  // 5) 감사 이력에 한 줄 '추가'(덮어쓰기/삭제 없음 → 과거 기록 보존).
  const { error: auditError } = await supabase
    .from('restore_audit')
    .insert(buildAuditEntry({ identity, backup, at: new Date().toISOString() }));
  if (auditError) {
    console.error('restore: 감사 이력 기록 실패(복원은 적용됨, 운영자 확인 필요).');
    response.status(500).json({ error: 'RESTORE_AUDIT_FAILED' });
    return;
  }

  console.log(`[S10] restore id=${id} applied verifyAfter=${verified.ok} → 200`);
  // 본문은 돌려주지 않고, 대조에 쓴 식별값만 반환합니다.
  response.status(200).json({
    id: restored.id,
    resourceId: memoResourceId(restored.id),
    contentSha256: check.contentSha256,
    ownerMatched: true,
    restored: true,
  });
}
