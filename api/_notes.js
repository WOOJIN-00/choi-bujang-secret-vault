// 4단계 공통 모듈(라우트 아님: 파일명이 _로 시작하면 Vercel이 함수로 노출하지 않음).
// 자료 API들이 공유하는 인증·DB·본문 검증 도우미입니다.
//   - 요청 토큰은 틀의 src/verify-login.mjs로만 검사합니다(도우미 수정 없음).
//   - 소유자 비교에는 검증된 토큰의 userId만 씁니다. URL·본문의 owner_id는 신뢰하지 않습니다.
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import aleph from '../aleph.config.json' with { type: 'json' };

let verifier = null;

// 인증 통과 시 { identity, supabase }를 돌려주고, 실패 시 응답을 보내고 null을 돌려줍니다.
export async function authenticate(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    console.error('notes: SUPABASE_URL 또는 SUPABASE_SECRET_KEY 환경변수가 없습니다.');
    response.status(500).json({ error: 'NOTES_BACKEND_NOT_CONFIGURED' });
    return null;
  }
  let identity;
  try {
    if (!verifier) verifier = createLoginVerifier({ config: aleph, supabaseSecretKey: secretKey });
    identity = await verifier(request.headers?.authorization);
  } catch {
    console.error('notes: 로그인 검증기 초기화 실패(identityProvider 설정 확인).');
    response.status(500).json({ error: 'LOGIN_VERIFIER_NOT_CONFIGURED' });
    return null;
  }
  if (!identity) {
    response.status(401).json({ error: 'LOGIN_REQUIRED' });
    return null;
  }
  const supabase = createClient(url, secretKey, { auth: { persistSession: false } });
  return { identity, supabase };
}

// 본문에서 {title, body}만 읽습니다. owner_id 등 다른 필드는 무시합니다.
export function readTitleBody(request) {
  const raw = request.body;
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw
    : typeof raw === 'string' && raw ? safeJson(raw) : null;
  if (!data || typeof data !== 'object') return null;
  const { title, body } = data;
  if (typeof title !== 'string' || !title.trim() || title.length > 200) return null;
  if (typeof body !== 'string' || !body.length || body.length > 5000) return null;
  return { title, body };
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

// DB 행(content 칼럼) → API 응답 모양 {id, title, body}
export const toItem = (row) => ({ id: row.id, title: row.title, body: row.content });

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
