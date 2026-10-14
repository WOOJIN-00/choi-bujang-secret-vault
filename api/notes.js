// 자료 API (컬렉션): /api/notes
//   GET  → 로그인한 '내' 메모 목록만 반환(owner_id = 검증된 userId).
//   POST → 새 메모를 '내' 소유로 추가(본문 {title, body}, owner_id는 검증된 userId로 저장).
// 토큰 검사·소유자 비교는 api/_notes.js 공통 모듈을 씁니다. URL·본문의 owner_id는 신뢰하지 않습니다.
import { authenticate, readTitleBody, toItem } from './_notes.js';
import { resourceForRequest, tagResponse, memoResourceId } from './_resources.js';
import { authorizeMemo } from './_authz.js';
import { saveVerifiedBackup } from './_restore.js';

export default async function handler(request, response) {
  // 8단계: 요청마다 자원 구역/ID를 먼저 정해 응답에 표시합니다(메모는 my-notes 구역).
  const resource = tagResponse(response, resourceForRequest(request));

  const auth = await authenticate(request, response);
  if (!auth) return;
  const { identity, supabase } = auth;
  const ownerId = identity.userId;

  if (request.method === 'GET') {
    // owner_id 를 함께 읽어 코드에서 '다시' 소유자 대조(심층 방어). 쿼리 필터가 바뀌어도 내 자료만 나갑니다.
    const { data, error } = await supabase
      .from('secret_notes')
      .select('id, title, content, owner_id')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('notes: 목록을 읽지 못했습니다.');
      response.status(502).json({ error: 'NOTES_READ_FAILED' });
      return;
    }
    // 검증된 사용자와 저장된 owner_id 를 다시 대조해 내 것만 남깁니다(owner_id 는 응답에 넣지 않음).
    const notes = (data ?? [])
      .filter((row) => authorizeMemo(identity, row.owner_id).ok)
      .map((row) => ({ ...toItem(row), resourceId: memoResourceId(row.id) }));
    response.status(200).json({ notes, zone: resource.zone });
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
    // 10단계: 생성 시점의 검증된 사본을 남깁니다(복원의 비공개 사본). 최선 노력 — 실패해도 생성은 유지.
    try {
      const { error: backupError } = await saveVerifiedBackup(supabase,
        { id: data.id, owner_id: ownerId, title: input.title, content: input.body });
      if (backupError) console.error('notes: 사본 저장 실패(생성은 유지, 운영자 확인 필요).');
    } catch {
      console.error('notes: 사본 저장 중 예외(생성은 유지).');
    }
    response.status(201).json({ ...toItem(data), resourceId: memoResourceId(data.id) });
    return;
  }

  response.setHeader('Allow', 'GET, POST');
  response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
