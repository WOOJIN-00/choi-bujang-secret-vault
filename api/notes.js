// 2단계: 가상 메모를 서버 함수에서 읽어 화면에 내보냅니다.
// 자료는 더 이상 공개 정적 파일(/data.json)에 두지 않고, 이 서버 함수만 읽습니다.
//
// 환경변수는 Vercel 프로젝트 설정(Settings → Environment Variables)에 넣습니다.
//   SUPABASE_URL         : 프로젝트 URL
//   SUPABASE_SECRET_KEY  : 서버 전용 키(service_role). RLS를 우회하므로 서버에서만 씁니다.
// 두 값 모두 코드·Git에 넣지 않습니다. 응답·로그에도 키를 절대 담지 않습니다.
//
// 아직 약점: 이 함수는 공개 주소라 누구나 /api/notes를 호출할 수 있습니다.
// 로그인·접근 제한은 이후 단계에서 추가합니다.
import { createClient } from '@supabase/supabase-js';

export default async function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store');

  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    // 키 값 자체는 로그·응답에 남기지 않습니다. 존재 여부만 코드로 알립니다.
    console.error('notes: SUPABASE_URL 또는 SUPABASE_SECRET_KEY 환경변수가 없습니다.');
    response.status(500).json({ error: 'NOTES_BACKEND_NOT_CONFIGURED' });
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
      // Supabase 오류 메시지에 접속 정보가 섞일 수 있으므로 그대로 내보내지 않습니다.
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
