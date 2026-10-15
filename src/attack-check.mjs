// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
//
// 12단계: 이 파일은 import를 하나도 쓰지 않고 전역 fetch·URL만 씁니다(전역 crypto는 있을 때만 씁니다).
//   심판 실행기가 점검 파일 하나만 읽을 수 있는 격리 환경에서 불러와도 동작하게 하려는 것입니다.
//   (이전에 재시험 표 코드를 import했을 때 runner_import_failed로, 전역 crypto가 없을 때
//    randomUUID 오류로 bundle이 멈췄습니다. 둘 다 이 파일이 혼자서, 구형 Node에서도 돌도록 고쳤습니다.)
// 실제로 보낸 요청은 observed에 '실제로 받은 HTTP 상태'를 먼저 적고 요청 ID·확인 시각을 붙입니다.
// 요청을 보내지 못했거나 보내지 않은 점검은 observed를 정확히 'not_run'으로 적고 결과를 만들지 않습니다.
// 이 점검은 학생의 자기 점검이며 심판의 판정이 아닙니다.

const LIMIT = 300; // scripts/bundle.mjs가 expected·observed에 허용하는 최대 길이
const cut = (text) => (text.length > LIMIT ? `${text.slice(0, LIMIT - 1)}…` : text);
const FORGED_TOKEN = 'aaaaaaaaaa.bbbbbbbbbb.cccccccccc'; // 형식만 갖춘 가짜 토큰(실제 토큰 아님)

// 점검 목록. send가 없으면 요청을 보내지 않고 not_run으로 둡니다(이유는 expected 설명에 적음).
// 무인증 조회와 타인 메모 조회를 앞에 두고, 나머지는 단계 순서를 따릅니다.
const CHECKS = [
  { attackId: 'anonymous_note_read', request: 'GET /data.json (로그인 없음)', want: '200 · notes 비어 있음',
    send: { path: '/data.json' },
    judge: (r) => ({ ok: r.status === 200 && Array.isArray(r.json?.notes) && r.json.notes.length === 0,
      detail: `notes ${Array.isArray(r.json?.notes) ? r.json.notes.length : '?'}건` }) },
  { attackId: 'cross_owner_note_read', request: 'B가 A의 메모 조회', want: '404',
    skip: '시험 계정 두 개가 있어야 보낼 수 있어 이 점검에서는 보내지 않음' },
  { attackId: 'anonymous_notes_api', request: 'GET /api/notes (로그인 없음)', want: '401',
    send: { path: '/api/notes' }, judge: (r) => ({ ok: r.status === 401 }) },
  { attackId: 'forged_token_notes', request: 'GET /api/notes (위조 토큰)', want: '401',
    send: { path: '/api/notes', token: FORGED_TOKEN }, judge: (r) => ({ ok: r.status === 401 }) },
  { attackId: 'restore_without_login', request: 'POST /api/restore (로그인 없음)', want: '401',
    skip: '제출 묶음은 GET·HEAD만 보낼 수 있어 쓰기 요청은 보내지 않음(npm run retest에서 실측)' },
  { attackId: 'restore_wrong_method', request: 'DELETE /api/restore', want: '405',
    skip: '제출 묶음은 GET·HEAD만 보낼 수 있어 쓰기 요청은 보내지 않음(npm run retest에서 실측)' },
  { attackId: 'device_status_without_login', request: 'GET /api/device (로그인 없음)', want: '401',
    send: { path: '/api/device' }, judge: (r) => ({ ok: r.status === 401 }) },
  { attackId: 'device_request_without_login', request: 'POST /api/device (로그인 없음)', want: '401',
    skip: '제출 묶음은 GET·HEAD만 보낼 수 있어 쓰기 요청은 보내지 않음(npm run retest에서 실측)' },
  { attackId: 'cross_owner_list_mix', request: 'B의 목록에 A의 메모가 섞였는지', want: 'A의 메모 0건',
    skip: '시험 계정 두 개가 있어야 보낼 수 있어 이 점검에서는 보내지 않음' },
  { attackId: 'cross_owner_note_write', request: 'B가 A의 메모 수정·삭제', want: '404',
    skip: '거부되지 않으면 실제로 자료가 바뀌는 요청이라 보내지 않음' },
];

// 요청 ID(UUID 모양). 전역 crypto가 없는 구형 Node(18 이하)나 제한된 실행기에서는
// 전역 crypto가 undefined라서(심판 실행기에서 randomUUID 오류가 났음) 대체 방법으로 만듭니다.
// 요청 ID는 요청을 구별하려는 값이라 암호학적 난수가 필요하지 않습니다.
function newRequestId() {
  try {
    const id = globalThis.crypto?.randomUUID?.();
    if (typeof id === 'string' && id) return id;
  } catch { /* 아래 대체 방법을 씁니다 */ }
  const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

// 요청 한 건. 전역 fetch만 씁니다. 응답을 받지 못하면 null(= 보낸 요청의 결과가 없으므로 not_run).
async function probe(app, check) {
  const requestId = newRequestId();
  const at = new Date().toISOString();
  const { method = 'GET', path, token, body } = check.send;
  try {
    const response = await fetch(new URL(path, app), {
      method,
      headers: {
        'X-Request-Id': requestId,
        'X-Attack-Id': check.attackId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* JSON이 아닌 응답 */ }
    const serverId = (response.headers.get('x-vercel-id') || '').slice(0, 80);
    return { status: response.status, json, requestId, serverId, at };
  } catch {
    return null;
  }
}

export async function runAttackChecks(config) {
  if (!Number.isInteger(config.step) || config.step < 1 || config.step > 12) {
    throw new Error('aleph.config.json의 step을 확인해 주세요(1~12).');
  }
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');

  const attempts = [];
  for (const check of CHECKS) {
    const expected = cut(`${check.request} → 기대 ${check.want}${check.skip ? ` (${check.skip})` : ''}`);
    const result = check.send ? await probe(app, check) : null;
    if (!result) { // 보내지 않았거나 응답을 받지 못함: 결과를 만들지 않고 미실행으로 적습니다
      attempts.push({ attackId: check.attackId, expected, observed: 'not_run' });
      continue;
    }
    const verdict = check.judge(result);
    const code = result.json && typeof result.json.error === 'string' ? ` ${result.json.error}` : '';
    attempts.push({
      attackId: check.attackId,
      expected,
      observed: cut(`HTTP ${result.status}${code}${verdict.detail ? ` · ${verdict.detail}` : ''} · ${verdict.ok ? '기대와 같음' : '기대와 다름(실패)'} · 요청 ID ${result.requestId}${result.serverId ? ` · 서버 ID ${result.serverId}` : ''} · 확인 시각 ${result.at}`),
    });
  }
  return attempts;
}
