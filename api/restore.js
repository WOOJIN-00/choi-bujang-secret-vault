// 자료 복원 API (한 건): /api/restore
//   GET  /api/restore?id=<id>  → 미리보기: 사본을 manifest로 '다시 읽어 검증'한 뒤, 복구할 버전·
//                                바뀔 항목·계획 토큰(planToken)을 돌려줍니다. 아무것도 바꾸지 않습니다.
//   POST /api/restore {id, planToken} → 복구 직전 '다시' 재검증하고, 인증 주체·자원 ID·소유자 키·
//                                내용 해시가 모두 맞는 '단 한 건'만 복구합니다.
//
// 핵심 방어선(심판 공격 대응):
//   - 사본(backups/*.json)을 복구 직전에 다시 읽어 backups/manifest.json의 해시와 재대조합니다.
//   - 해시가 하나라도 어긋나면 412로 중단하고 '절대 복구하지 않습니다'(검증 실패 뒤 복원 금지).
//   - 미리보기(planToken)를 먼저 받지 않은 복구 요청은 428로 막습니다(실행 전 버전·바뀔 항목 표시 강제).
//   - 운영 정책(decider.mjs·aleph.config.json)과 다른 메모·감사 기록은 건드리지 않습니다.
import { authenticate } from './_notes.js';
import { memoResourceId } from './_resources.js';
import { verifyBackups, planToken, sha256Lf } from './_backups.js';
import { contentHash, readRestoreId, buildAuditEntry } from './_restore.js';

function readBody(request) {
  const raw = request.body;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw) { try { return JSON.parse(raw); } catch { return null; } }
  return null;
}

// 요청에서 복구 대상 id를 읽습니다(GET은 쿼리, POST는 본문). owner_id 등은 요청에서 받지 않습니다.
function readTargetId(request) {
  if (request.method === 'GET') {
    const q = request.query && request.query.id;
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
    return typeof q === 'string' && UUID.test(q) ? q : null;
  }
  return readRestoreId(request);
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET' && request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  const auth = await authenticate(request, response);
  if (!auth) return;
  const { identity, supabase } = auth;

  // 1) 복구 직전에 사본을 '다시 읽어' manifest와 재검증. 실패하면 412로 중단(복구 금지).
  const verified = await verifyBackups();
  if (!verified.ok) {
    console.error(`restore: 사본 검증 실패(${verified.reason}) → 412, 복구하지 않음.`);
    response.status(412).json({ error: 'BACKUP_UNVERIFIED', reason: verified.reason });
    return;
  }

  const id = readTargetId(request);
  if (!id) { response.status(400).json({ error: 'INVALID_ID' }); return; }

  const target = verified.notes.find((n) => n && n.id === id);
  if (!target) {
    // 검증된 사본에 없는 대상 → 숨겨서 404.
    response.status(404).json({ error: 'NOT_FOUND' });
    return;
  }

  // 복구 계획: 복구할 버전과 '바뀔 항목'(현재 내용이 사본과 다른가)을 계산합니다.
  const { data: current } = await supabase
    .from('secret_notes')
    .select('content, owner_id')
    .eq('id', id)
    .maybeSingle();
  const beforeSha256 = current ? contentHash(current.content) : null;
  const willChange = beforeSha256 !== target.contentSha256;
  const token = planToken(id, verified.version, verified.manifestSha);
  const plan = {
    id: target.id,
    resourceId: memoResourceId(target.id),
    version: verified.version,
    verifiedFiles: verified.checked,
    willChange,
    beforeSha256,
    afterSha256: target.contentSha256,
  };

  // 2) 미리보기(GET): 실행 전에 버전·바뀔 항목·계획 토큰을 보여 주고, 아무것도 바꾸지 않습니다.
  if (request.method === 'GET') {
    response.status(200).json({ ...plan, preview: true, applied: false, planToken: token });
    return;
  }

  // 3) 복구(POST): 미리보기를 먼저 받았는지(planToken) 확인. 없거나 틀리면 428(실행 전 확인 필요).
  const body = readBody(request) || {};
  if (body.planToken !== token) {
    response.status(428).json({
      error: 'PREVIEW_REQUIRED',
      message: '복구 전에 미리보기(GET /api/restore?id=...)로 버전과 바뀔 항목을 확인한 planToken이 필요합니다.',
      ...plan, planToken: token,
    });
    return;
  }

  // 4) 복구 직전 '한 번 더' 재검증: 사본 내용 해시가 사본의 기록 해시와 일치하는지 다시 확인.
  //    (이중 대조) 하나라도 어긋나면 412로 중단하고 복구하지 않습니다.
  if (sha256Lf(target.content).toLowerCase() !== String(target.contentSha256).toLowerCase()) {
    console.error('restore: 복구 직전 재검증 실패 → 412, 복구하지 않음.');
    response.status(412).json({ error: 'BACKUP_UNVERIFIED', reason: 'reverify_mismatch' });
    return;
  }

  // 5) 그 '단 한 건'만 복구합니다(id 기준 upsert). 사본 값만 쓰고 다른 메모는 건드리지 않습니다.
  const ownerId = typeof target.ownerId === 'string' ? target.ownerId
    : (current && current.owner_id) || null;
  if (!ownerId) { response.status(409).json({ error: 'OWNER_UNKNOWN' }); return; }
  const { error: writeError } = await supabase
    .from('secret_notes')
    .upsert({ id: target.id, owner_id: ownerId, title: target.title, content: target.content },
      { onConflict: 'id' });
  if (writeError) {
    console.error('restore: 되살리지 못했습니다.');
    response.status(502).json({ error: 'RESTORE_WRITE_FAILED' });
    return;
  }

  // 6) 복구 후 '다시 읽어' 확인: 저장된 행을 새로 조회해 내용 해시가 사본과 같은지 재대조.
  const { data: reread } = await supabase
    .from('secret_notes').select('id, owner_id, content').eq('id', target.id).maybeSingle();
  const restoredOk = reread && reread.id === target.id
    && contentHash(reread.content).toLowerCase() === String(target.contentSha256).toLowerCase();
  if (!restoredOk) {
    response.status(500).json({ error: 'RESTORE_VERIFY_FAILED' });
    return;
  }

  // 7) 감사 이력 append(과거 기록 보존). 실패해도 복구는 유지하되 운영자 확인용으로 알림.
  const { error: auditError } = await supabase.from('restore_audit')
    .insert(buildAuditEntry({ identity, backup: { id: target.id, owner_id: ownerId, content_sha256: target.contentSha256 }, at: new Date().toISOString() }));
  if (auditError) console.error('restore: 감사 이력 기록 실패(복구는 적용됨).');

  // 응답: 복구 버전·바뀔 항목 + 복구 후 1~9단계 재시험 안내(문서 경로)만. 본문은 담지 않습니다.
  response.status(200).json({
    ...plan,
    applied: true,
    restored: true,
    auditAppended: !auditError,
    retestPlan: 'docs/RESTORE_RETEST_PLAN.md',
  });
}
