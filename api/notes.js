// 2단계: 가상 메모를 서버 함수에서만 읽어 화면에 내보냅니다(공개 정적 파일에 두지 않음).
// 3단계: 이 자료 API에 로그인 검사를 붙입니다.
//   - 틀의 src/verify-login.mjs로 요청 토큰(Authorization 헤더)을 검사합니다. 도우미는 고치지 않습니다.
//   - 브라우저가 보낸 userId·role은 믿지 않습니다. 검증기가 돌려준 결과만 신뢰합니다.
//   - 토큰이 없거나 검사에 실패하면 자료 없이 거부(401)하고, 정상 로그인만 자료를 받습니다.
//
// 환경변수(Vercel Settings → Environment Variables):
//   SUPABASE_URL         : 프로젝트 URL
//   SUPABASE_SECRET_KEY  : 서버 전용 키(service_role). RLS 우회·토큰 검증에 서버에서만 사용.
// 두 값 모두 코드·Git·응답·로그에 넣지 않습니다.
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import aleph from '../aleph.config.json' with { type: 'json' };

// 검증기는 런타임에서 한 번만 만듭니다(발급자 설정·JWKS 바인딩 포함).
let verifier = null;
function getVerifier(supabaseSecretKey) {
  if (!verifier) {
    verifier = createLoginVerifier({ config: aleph, supabaseSecretKey });
  }
  return verifier;
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    console.error('notes: SUPABASE_URL 또는 SUPABASE_SECRET_KEY 환경변수가 없습니다.');
    response.status(500).json({ error: 'NOTES_BACKEND_NOT_CONFIGURED' });
    return;
  }

  // 요청 토큰 검사. Authorization 헤더만 봅니다(바디·쿼리의 userId·role은 신뢰하지 않음).
  let identity = null;
  try {
    const verify = getVerifier(secretKey);
    identity = await verify(request.headers?.authorization);
  } catch {
    console.error('notes: 로그인 검증기를 초기화하지 못했습니다(identityProvider 설정 확인).');
    response.status(500).json({ error: 'LOGIN_VERIFIER_NOT_CONFIGURED' });
    return;
  }
  if (!identity) {
    // 토큰이 없거나 검사 실패 → 자료 없이 거부.
    response.status(401).json({ error: 'LOGIN_REQUIRED' });
    return;
  }

  try {
    const supabase = createClient(url, secretKey, { auth: { persistSession: false } });
    // title·content만 가져옵니다. owner_id나 키는 응답에 넣지 않습니다.
    const { data, error } = await supabase
      .from('secret_notes')
      .select('title, content')
      .order('created_at', { ascending: true });
    if (error) {
      console.error('notes: 자료를 읽지 못했습니다.');
      response.status(502).json({ error: 'NOTES_READ_FAILED' });
      return;
    }
    response.status(200).json({ notes: data ?? [] });
  } catch {
    console.error('notes: 예기치 못한 오류로 자료를 읽지 못했습니다.');
    response.status(500).json({ error: 'NOTES_READ_FAILED' });
  }
}
