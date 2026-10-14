// 탈환 작전실 요약 API (읽기 전용): GET /api/ops
// 판정기 규칙·탐지 사건·회수 상태·복구 버전·서버 기록 요약을 돌려줍니다.
// 값마다 출처 라벨(confirmed/virtual/not_run)이 붙고, 메모 본문·토큰·소유자 ID·내용 해시는 담지 않습니다.
// 서버 기록(restore_audit)은 서버 전용 키로 읽되, 응답에는 식별값을 가린 값만 넣습니다. 아무것도 바꾸지 않습니다.
import { createClient } from '@supabase/supabase-js';
import { buildOpsSummary } from './_ops.js';

// 복구 감사 기록을 읽습니다. 표·환경변수가 없거나 읽기에 실패하면 ok:false(= 건수를 지어내지 않음).
function makeAuditReader() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) return async () => ({ ok: false });
  const supabase = createClient(url, secretKey, { auth: { persistSession: false } });
  return async () => {
    const { count, error: countError } = await supabase
      .from('restore_audit').select('audit_id', { count: 'exact', head: true });
    if (countError || typeof count !== 'number') return { ok: false };
    const { data, error } = await supabase
      .from('restore_audit').select('at, action, note_id')
      .order('at', { ascending: false }).limit(20);
    if (error) return { ok: false };
    return { ok: true, total: count, rows: data ?? [] };
  };
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }
  try {
    const summary = await buildOpsSummary({ readAudit: makeAuditReader() });
    response.status(200).json(summary);
  } catch (error) {
    console.error('ops: 요약을 만들지 못했습니다.');
    response.status(500).json({ error: 'OPS_SUMMARY_FAILED' });
  }
}
