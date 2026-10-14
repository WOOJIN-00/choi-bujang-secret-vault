// 기기 승인 API: /api/device
//   GET  → 이 사용자/기기의 승인 상태를 서버에서 읽어 돌려줍니다({ approved, requested }).
//   POST → 승인 '요청'만 기록합니다(승인하지 않음). approved 는 서버/관리자가 따로 true 로 바꿉니다.
// 승인은 서버 표(device_approvals)로만 판단하며, 요청 본문·저장소 값으로 권한을 주지 않습니다.
import { authenticate } from './_notes.js';
import { readDeviceStatus, requestDeviceApproval } from './_device.js';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  const auth = await authenticate(request, response);
  if (!auth) return;
  const { identity, supabase } = auth;

  if (request.method === 'GET') {
    const status = await readDeviceStatus(supabase, identity.userId);
    if (!status.ok) {
      console.error('device: 승인 상태를 읽지 못했습니다(device_approvals 표 확인).');
      response.status(502).json({ error: 'DEVICE_BACKEND_FAILED' });
      return;
    }
    response.status(200).json({ approved: status.approved, requested: status.requested });
    return;
  }

  if (request.method === 'POST') {
    const ok = await requestDeviceApproval(supabase, identity.userId);
    if (!ok) {
      console.error('device: 승인 요청을 기록하지 못했습니다.');
      response.status(502).json({ error: 'DEVICE_REQUEST_FAILED' });
      return;
    }
    // 요청은 접수되었지만 아직 승인은 아닙니다(202). 승인은 서버/관리자가 따로 수행합니다.
    const status = await readDeviceStatus(supabase, identity.userId);
    response.status(202).json({ requested: true, approved: status.approved });
    return;
  }

  response.setHeader('Allow', 'GET, POST');
  response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
