// 자료 API (한 건): /api/notes/:id
//   GET    → '내' 메모 한 건 {id,title,body} (내 것 아니면 거부).
//   PUT    → '내' 메모 수정(본문 {title, body}). owner_id 조건으로 내 행만 수정하고 소유자는 바꾸지 않음.
//   DELETE → '내' 메모만 삭제.
// 소유자 비교는 검증된 userId만 씁니다. URL(:id)은 메모 id일 뿐이며, 소유자 판단에 쓰지 않습니다.
import { authenticate, readTitleBody, toItem, UUID } from '../_notes.js';
import { resourceForRequest, tagResponse, memoResourceId } from '../_resources.js';
import { authorizeMemo } from '../_authz.js';

export default async function handler(request, response) {
  // 8단계: 이 요청의 자원 구역/ID를 먼저 정해 응답에 표시합니다(메모 한 건 = my-notes 구역).
  tagResponse(response, resourceForRequest(request));

  const auth = await authenticate(request, response);
  if (!auth) return;
  const { identity, supabase } = auth;
  const ownerId = identity.userId;

  const id = request.query?.id;
  if (typeof id !== 'string' || !UUID.test(id)) {
    response.status(400).json({ error: 'INVALID_ID' });
    return;
  }

  if (request.method === 'GET') {
    // owner_id 를 함께 읽어 코드에서 '다시' 소유자 대조(심층 방어).
    const { data, error } = await supabase
      .from('secret_notes')
      .select('id, title, content, owner_id')
      .eq('id', id)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (error) {
      console.error('notes: 한 건을 읽지 못했습니다.');
      response.status(502).json({ error: 'NOTES_READ_FAILED' });
      return;
    }
    // 없거나 소유자 재대조 실패면 다른 구역/남의 자료 노출 금지 → 존재도 숨겨 404.
    if (!data || !authorizeMemo(identity, data.owner_id).ok) {
      console.error('notes: 소유자 아님(not_owner) 또는 없음 → 404.');
      response.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    response.status(200).json({ ...toItem(data), resourceId: memoResourceId(data.id) });
    return;
  }

  if (request.method === 'PUT') {
    const input = readTitleBody(request);
    if (!input) { response.status(400).json({ error: 'INVALID_BODY' }); return; }
    // owner_id = 내 id 조건: 기존 행이 내 것일 때만 수정되고, owner_id는 그대로 둬 소유자가 바뀌지 않습니다.
    const { data, error } = await supabase
      .from('secret_notes')
      .update({ title: input.title, content: input.body })
      .eq('id', id)
      .eq('owner_id', ownerId)
      .select('id, title, content, owner_id')
      .maybeSingle();
    if (error) {
      console.error('notes: 수정하지 못했습니다.');
      response.status(502).json({ error: 'NOTES_WRITE_FAILED' });
      return;
    }
    // 없거나 소유자 재대조 실패면 남의 자료 수정 금지 → 404.
    if (!data || !authorizeMemo(identity, data.owner_id).ok) {
      console.error('notes: 소유자 아님(not_owner) 또는 없음 → 404.');
      response.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    response.status(200).json({ ...toItem(data), resourceId: memoResourceId(data.id) });
    return;
  }

  if (request.method === 'DELETE') {
    const { data, error } = await supabase
      .from('secret_notes')
      .delete()
      .eq('id', id)
      .eq('owner_id', ownerId)
      .select('id, owner_id')
      .maybeSingle();
    if (error) {
      console.error('notes: 삭제하지 못했습니다.');
      response.status(502).json({ error: 'NOTES_WRITE_FAILED' });
      return;
    }
    // 없거나 소유자 재대조 실패면 남의 자료 삭제 금지 → 404.
    if (!data || !authorizeMemo(identity, data.owner_id).ok) {
      console.error('notes: 소유자 아님(not_owner) 또는 없음 → 404.');
      response.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    response.status(200).json({ id: data.id });
    return;
  }

  response.setHeader('Allow', 'GET, PUT, DELETE');
  response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
