// 자료 복원 API (한 건): POST /api/restore
//   본문 { id }           → 사본에서 그 한 건을 되살립니다(적용).
//   본문 { id, preview:true } → 적용하지 않고 '복구 버전·바뀔 항목'만 보여 줍니다(실행 전 확인).
//   ID·소유자·내용 해시를 사본과 대조하고, 다른 메모와 감사 기록은 보존합니다.
//   소유자는 검증된 토큰의 userId로만 판단합니다(본문/URL의 owner_id·role 불신).
import { authenticate } from './_notes.js';
import { memoResourceId } from './_resources.js';
import {
  readRestoreId, verifyAgainstBackup, verifyRestored, buildAuditEntry, contentHash,
} from './_restore.js';

// 본문에서 preview(미리보기) 요청 여부만 읽습니다. 참이면 적용하지 않고 계획만 보여 줍니다.
function wantsPreview(request) {
  const raw = request.body;
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw
    : (typeof raw === 'string' && raw ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null);
  return Boolean(data && (data.preview === true || data.dryRun === true));
}

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
  const preview = wantsPreview(request);
  console.error(`[S10] restore POST actor=${identity.kind} idOk=${Boolean(id)} preview=${preview}`);
  if (!id) {
    response.status(400).json({ error: 'INVALID_ID' });
    return;
  }

  // 1) 비공개 사본에서 그 한 건을 읽습니다(service_role, 서버 전용). 버전(backed_up_at)도 함께 읽습니다.
  const { data: backup, error: readError } = await supabase
    .from('secret_notes_backup')
    .select('id, owner_id, title, content, content_sha256, backed_up_at')
    .eq('id', id)
    .maybeSingle();
  if (readError) {
    console.error('restore: 사본을 읽지 못했습니다.');
    response.status(502).json({ error: 'RESTORE_BACKEND_FAILED' });
    return;
  }

  // 2) 복원 전 대조: ID·소유자·내용 해시. 손상 사본이면 중단, 그 외 불일치는 404로 숨김.
  //    (미리보기든 적용이든, 검증을 통과하지 못하면 여기서 멈춥니다.)
  const check = verifyAgainstBackup({ identity, requestedId: id, backup });
  console.error(`[S10] restore id=${id} backupFound=${Boolean(backup)} verifyOk=${check.ok} reason=${check.reason ?? '-'}`);
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

  // 3) 현재(복원 전) 상태를 읽어 '바뀔 항목'을 셈합니다. 내 소유 행만 비교합니다.
  const { data: beforeRow } = await supabase
    .from('secret_notes')
    .select('content')
    .eq('id', id)
    .eq('owner_id', backup.owner_id)
    .maybeSingle();
  const beforeSha256 = beforeRow ? contentHash(beforeRow.content) : null;
  const willChange = beforeSha256 !== backup.content_sha256;
  const plan = {
    id: backup.id,
    resourceId: memoResourceId(backup.id),
    version: backup.backed_up_at ?? null, // 복구할 사본의 버전(백업 시각)
    willChange, // 바뀔 항목: 현재 내용이 사본과 다른가
    beforeSha256, // 현재(복원 전) 내용 해시 (없으면 null)
    afterSha256: backup.content_sha256, // 복원 후 내용 해시(=사본)
  };

  // 4-a) 미리보기: 실행 전에 버전과 바뀔 항목만 보여 주고, 아무것도 적용하지 않습니다.
  if (preview) {
    console.error(`[S10] restore id=${id} preview version=${plan.version} willChange=${willChange} → 200(no-apply)`);
    response.status(200).json({ ...plan, preview: true, applied: false });
    return;
  }

  // 4-b) 적용: 그 한 건만 되살립니다(id 기준 upsert). 사본 값만 쓰고, 다른 행은 건드리지 않습니다.
  const { error: writeError } = await supabase
    .from('secret_notes')
    .upsert(
      { id: backup.id, owner_id: backup.owner_id, title: backup.title, content: backup.content },
      { onConflict: 'id' },
    );
  if (writeError) {
    console.error('restore: 되살리지 못했습니다.');
    response.status(502).json({ error: 'RESTORE_WRITE_FAILED' });
    return;
  }

  // 5) 복원 후 '다시 읽어' 검증: upsert 반환값을 믿지 않고, 저장된 행을 새로 조회해 사본과 대조합니다.
  //    (사본을 기준으로 재조회·재검증 → 검증을 통과하지 못하면 성공으로 보고하지 않습니다.)
  const { data: reread, error: rereadError } = await supabase
    .from('secret_notes')
    .select('id, owner_id, content')
    .eq('id', backup.id)
    .maybeSingle();
  if (rereadError) {
    console.error('restore: 복원 후 재조회 실패.');
    response.status(502).json({ error: 'RESTORE_REREAD_FAILED' });
    return;
  }
  const verified = verifyRestored({ backup, restored: reread });
  if (!verified.ok) {
    console.error(`restore: 복원 결과 재검증 실패(${verified.reason}).`);
    response.status(500).json({ error: 'RESTORE_VERIFY_FAILED' });
    return;
  }

  // 6) 감사 이력에 한 줄 '추가'(덮어쓰기/삭제 없음 → 과거 기록 보존).
  const { error: auditError } = await supabase
    .from('restore_audit')
    .insert(buildAuditEntry({ identity, backup, at: new Date().toISOString() }));
  if (auditError) {
    console.error('restore: 감사 이력 기록 실패(복원은 적용됨, 운영자 확인 필요).');
    response.status(500).json({ error: 'RESTORE_AUDIT_FAILED' });
    return;
  }

  console.error(`[S10] restore id=${id} applied verifyAfter=${verified.ok} version=${plan.version} changed=${willChange} → 200`);
  // 본문은 돌려주지 않고, 복구 버전·바뀔 항목과 대조에 쓴 식별값을 돌려줍니다.
  response.status(200).json({
    ...plan,
    contentSha256: check.contentSha256,
    ownerMatched: true,
    restored: true,
    applied: true,
  });
}
