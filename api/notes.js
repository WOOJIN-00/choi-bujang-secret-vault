// 자료 API (컬렉션): /api/notes
//   GET  → 로그인한 '내' 메모 목록만 반환(owner_id = 검증된 userId).
//   POST → 새 메모를 '내' 소유로 추가(본문 {title, body}, owner_id는 검증된 userId로 저장).
// 토큰 검사·소유자 비교는 api/_notes.js 공통 모듈을 씁니다. URL·본문의 owner_id는 신뢰하지 않습니다.
import { authenticate, readTitleBody, toItem } from './_notes.js';

export default async function handler(request, response) {
  const auth = await authenticate(request, response);
  if (!auth) return;
  const { identity, supabase } = auth;
  const ownerId = identity.userId;

  if (request.method === 'GET') {
    const { data, error } = await supabase
      .from('secret_notes')
      .select('id, title, content')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('notes: 목록을 읽지 못했습니다.');
      response.status(502).json({ error: 'NOTES_READ_FAILED' });
      return;
    }
    response.status(200).json({ notes: (data ?? []).map(toItem) });
    return;
  }

  if (request.method === 'POST') {
    const input = readTitleBody(request);
    if (!input) {
      response.status(400).json({ error: 'INVALID_BODY' });
      return;
    }
    const { data, error } = await supabase
      .from('secret_notes')
      .insert({ owner_id: ownerId, title: input.title, content: input.body })
      .select('id, title, content')
      .single();
    if (error) {
      console.error('notes: 추가하지 못했습니다.');
      response.status(502).json({ error: 'NOTES_WRITE_FAILED' });
      return;
    }
    response.status(201).json(toItem(data));
    return;
  }

  response.setHeader('Allow', 'GET, POST');
  response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
