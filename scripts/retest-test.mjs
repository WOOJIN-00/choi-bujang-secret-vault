// 12단계 재시험 표 로컬 확인. 가짜 서버로 표 생성 절차를 실행해
// (1) 정상 서버에서 실측 행이 통과로 남는지, (2) 거부돼야 할 요청이 허용되면 '실패'로 남는지,
// (3) 계정이 없거나 네트워크가 끊기면 미실행이며 통과로 세지 않는지, (4) 41종은 항상 미실행인지,
// (5) 토큰·비밀번호가 표에 새지 않는지 확인합니다. 배포 응답이나 심판 판정이 아닙니다.
import aleph from '../aleph.config.json' with { type: 'json' };
import { renderMarkdown, runRetest } from './retest-lib.mjs';

let failed = 0;
const check = (name, ok) => {
  if (!ok) failed += 1;
  process.stdout.write(`${ok ? '통과' : '확인 필요'} · ${name}\n`);
};

const TOKEN_A = 'tokA.SECRET-AAAAAAAAAAAA.sig';
const TOKEN_B = 'tokB.SECRET-BBBBBBBBBBBB.sig';
const PASS_A = 'pw-A-never-print-me';
const PASS_B = 'pw-B-never-print-me';
const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const BASE = 'https://fake-app.example.test';
const SUPA = 'https://fake-supa.example.test';

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'x-vercel-id': 'icn1::fake-server-id', ...extra },
});

// 가짜 배포. options로 일부러 망가뜨릴 수 있습니다.
function fakeServer(options = {}) {
  const { approvedA = true, approvedB = false, anonNotes200 = false, networkDown = false, restoreOpen = false } = options;
  const calls = [];
  const impl = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method ?? 'GET';
    const auth = init.headers?.Authorization ?? '';
    calls.push({ method, path: u.pathname, auth, attackId: init.headers?.['X-Attack-Id'] ?? null });
    if (networkDown) throw Object.assign(new Error('down'), { name: 'TypeError' });
    if (u.origin === SUPA && u.pathname === '/auth/v1/token') {
      const body = JSON.parse(init.body);
      if (body.password === PASS_A) return json(200, { access_token: TOKEN_A });
      if (body.password === PASS_B) return json(200, { access_token: TOKEN_B });
      return json(400, { error: 'invalid_grant' });
    }
    if (u.origin === SUPA || u.href.startsWith(aleph.originalApiUrl)) return json(401, { message: 'permission denied' }); // 원본 자료 API 직접 요청
    const who = auth === `Bearer ${TOKEN_A}` ? 'A' : auth === `Bearer ${TOKEN_B}` ? 'B' : null;
    const approved = who === 'A' ? approvedA : approvedB;
    switch (u.pathname) {
      case '/aleph.json': return json(200, { commit: 'abcdef0123456789abcdef0123456789abcdef01' });
      case '/': return new Response('<!doctype html><html></html>', { status: 200, headers: { 'x-vercel-id': 'icn1::fake-server-id' } });
      case '/data.json': return json(200, { notes: [] });
      case '/manifest.webmanifest': return json(200, { name: '내 자료실', display: 'standalone' });
      case '/api/public-config': return json(200, { url: SUPA, publishableKey: 'sb_publishable_FAKEKEY' });
      case '/api/ops': return json(200, { schema: 'aleph.ops.summary.v1' });
      case '/api/restore':
        if (method === 'GET') return json(200, { backupVerified: true });
        if (method === 'POST') return restoreOpen ? json(200, { restored: true }) : json(401, { error: 'LOGIN_REQUIRED' });
        return json(405, { error: 'METHOD_NOT_ALLOWED' });
      case '/api/device':
        if (!who) return json(401, { error: 'LOGIN_REQUIRED' });
        return method === 'GET' ? json(200, { approved, requested: true }) : json(202, { requested: true, approved });
      case '/api/notes':
        if (!who) return anonNotes200 ? json(200, { notes: [{ id: ID_A }] }) : json(401, { error: 'LOGIN_REQUIRED' });
        if (!approved) return json(200, { notes: [], deviceApproved: false });
        return json(200, { notes: [{ id: who === 'A' ? ID_A : ID_B }], deviceApproved: true });
      default:
        if (u.pathname === `/api/notes/${ID_A}`) {
          if (!who) return json(401, { error: 'LOGIN_REQUIRED' });
          return who === 'A' && approvedA ? json(200, { id: ID_A }) : json(404, { error: 'NOT_FOUND' });
        }
        return json(404, { error: 'NOT_FOUND' });
    }
  };
  return { impl, calls };
}

const ENV = { RETEST_EMAIL_A: 'a@example.test', RETEST_PASSWORD_A: PASS_A, RETEST_EMAIL_B: 'b@example.test', RETEST_PASSWORD_B: PASS_B };
const run = (server, env) => runRetest({ base: BASE, fetchImpl: server.impl, env });
const rowBy = (report, text) => report.rows.find((r) => r.request.includes(text));

// 1) 정상 서버 + 계정 있음
{
  const server = fakeServer();
  const report = await run(server, ENV);
  const md = renderMarkdown(report);
  check('정상 서버: 실측 실패 0건, 로컬 가상 실행 실패 0건',
    report.counts.liveFail === 0 && report.counts.localFail === 0);
  check('정상 서버: 정상 요청과 금지 요청이 모두 실측으로 남음',
    report.counts.liveNormalMeasured > 0 && report.counts.liveForbiddenMeasured > 0);
  check('실측 행마다 요청 ID·확인 시각이 있고, 서버가 준 서버 ID도 그대로 적힘',
    report.rows.filter((r) => r.evidence === 'live_http').every((r) => r.requestId !== '—' && r.at !== '—'
      && r.serverId === 'icn1::fake-server-id'));
  check('요청 ID가 모두 서로 다름', (() => {
    const ids = report.rows.map((r) => r.requestId).filter((v) => v !== '—');
    return new Set(ids).size === ids.length;
  })());
  check('배포 커밋을 표에 적음', report.deployedCommit === 'abcdef0123456789abcdef0123456789abcdef01' && md.includes('abcdef0123456789'));
  check('A 승인·B 미승인 상태에 맞게 B의 금지 결과(notes 0건·deviceApproved false)를 실측',
    rowBy(report, 'B GET /api/notes (미승인')?.result === 'pass');
  check('B가 A의 메모를 요청하면 404가 실측으로 남음', rowBy(report, 'B가 A의 메모 GET')?.result === 'pass');
  check('로컬 가상 실행 행은 근거가 local_virtual이고 실제 API로 세지 않음',
    report.rows.filter((r) => r.step === 6 || r.step === 8 || r.step === 9).every((r) => r.evidence === 'local_virtual'));
  check('41종 공격 행은 미실행이며 통과가 아님',
    (() => { const r = rowBy(report, '41종'); return r && r.result === 'not_run' && r.evidence === 'none'; })()
    && md.includes('12단계 41종 공격 방어: 미실행'));
  check('자료를 바꾸는 요청(PUT·DELETE, 복구 적용)은 자동 실행하지 않고 미실행',
    rowBy(report, 'PUT·DELETE')?.result === 'not_run' && rowBy(report, '복구 적용')?.result === 'not_run'
    && !server.calls.some((c) => c.method === 'PUT' || (c.path === '/api/restore' && c.method === 'POST' && c.auth)));
  check('보낸 요청이 읽기와 무인증 거부 확인뿐(로그인 상태의 쓰기 요청 없음)',
    server.calls.every((c) => !c.auth || c.method === 'GET'));
  check('미실행·실패·통과가 아닌 행은 통과로 세지 않음(통과 행은 모두 근거가 있음)',
    report.rows.filter((r) => r.result === 'pass').every((r) => r.evidence === 'live_http' || r.evidence === 'local_virtual'));
  check('토큰·비밀번호·공개 키 값이 표와 JSON에 없음', (() => {
    const all = md + JSON.stringify(report);
    return ![TOKEN_A, TOKEN_B, PASS_A, PASS_B, 'sb_publishable_FAKEKEY', 'a@example.test', 'b@example.test'].some((s) => all.includes(s));
  })());
  check('표에 정상·금지·판정·근거 열이 있음', md.includes('| 기대 결과 | 실제 결과 | 요청 ID | 서버 ID | 확인 시각 | 판정 | 근거 |'));
}

// 1-1) 서버가 서버 ID 헤더를 주지 않으면 지어내지 않고 '—'로 남김(요청 ID·시각은 그대로)
{
  const server = fakeServer();
  const stripped = async (url, init) => {
    const res = await server.impl(url, init);
    const headers = new Headers(res.headers); headers.delete('x-vercel-id');
    return new Response(await res.text(), { status: res.status, headers });
  };
  const report = await runRetest({ base: BASE, fetchImpl: stripped, env: ENV });
  const liveRows = report.rows.filter((r) => r.evidence === 'live_http');
  check('서버 ID 헤더가 없으면 서버 ID는 —로 남고 요청 ID·시각은 유지됨',
    liveRows.length > 0 && liveRows.every((r) => r.serverId === '—' && r.requestId !== '—' && r.at !== '—'));
}

// 2) 거부돼야 할 요청이 허용되면 실패로 남아야 함(통과로 덮지 않음)
{
  const report = await run(fakeServer({ anonNotes200: true, restoreOpen: true }), ENV);
  check('로그인 없는 /api/notes가 200이면 그 행은 실패(실측)',
    rowBy(report, 'GET /api/notes (로그인 없음)')?.result === 'fail');
  check('로그인 없는 POST /api/restore가 200이면 그 행은 실패(실측)',
    rowBy(report, 'POST /api/restore (로그인 없음)')?.result === 'fail');
  check('실패가 있으면 실측 실패 건수에 잡힘', report.counts.liveFail >= 2);
}

// 3) 계정이 없으면 계정이 필요한 행은 미실행(통과로 세지 않음)
{
  const report = await run(fakeServer(), {});
  const needsAccount = report.rows.filter((r) => /A 로그인|B 로그인|A가 자기|B가 A|B의 GET|A GET|B GET/.test(r.request));
  check('계정 없음: 계정이 필요한 행은 모두 미실행', needsAccount.length > 0 && needsAccount.every((r) => r.result === 'not_run' && r.evidence === 'none'));
  check('계정 없음: 계정 없이 가능한 실측 행은 그대로 실행됨', report.counts.liveNormalMeasured > 0 && report.counts.liveForbiddenMeasured > 0);
  check('계정 없음: 미실행 행에는 요청 ID·확인 시각을 만들어 붙이지 않음',
    needsAccount.every((r) => r.requestId === '—' && r.at === '—'));
}

// 4) 로그인이 틀리면 미실행(통과로 세지 않음)
{
  const report = await run(fakeServer(), { ...ENV, RETEST_PASSWORD_A: 'wrong', RETEST_PASSWORD_B: 'wrong' });
  check('로그인 실패: 계정 상태가 실패로 적히고 A 행은 미실행', report.accounts.A.startsWith('실패')
    && rowBy(report, 'A 로그인 GET /api/notes')?.result === 'not_run');
}

// 5) 네트워크가 끊기면 측정하지 못한 것이므로 통과도 실패도 아닌 미실행
{
  const report = await run(fakeServer({ networkDown: true }), ENV);
  check('네트워크 끊김: 실측 통과 0건, 실측으로 남은 행 0건',
    report.counts.livePass === 0 && report.counts.liveNormalMeasured === 0 && report.counts.liveForbiddenMeasured === 0);
  check('네트워크 끊김: 표에 허용·거부 모두 실측 없음 경고가 나옴', renderMarkdown(report).includes('실측 결과가 0건입니다'));
}

// 6) 승인 상태가 바뀌면 기대가 따라 바뀜(A 미승인이면 A의 자기 메모 요청은 미실행)
{
  const report = await run(fakeServer({ approvedA: false }), ENV);
  check('A 미승인: A의 자기 메모 요청은 미실행이고, A 목록은 비어 있어야 통과',
    rowBy(report, 'A가 자기 메모')?.result === 'not_run' && rowBy(report, 'A GET /api/notes (미승인')?.result === 'pass');
}

// 7) 제출 묶음 점검(src/attack-check.mjs): import 없이 전역 fetch만 쓰고, 보낸 요청은 실제 HTTP 상태, 안 보낸 점검은 정확히 not_run
{
  const { runAttackChecks } = await import('../src/attack-check.mjs');
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/attack-check.mjs', import.meta.url), 'utf8');
  const CONFIG = { step: 12, publicAppUrl: BASE + '/', sampleMarker: 'SAMPLE_NOTE_1' };
  const ID_FORMAT = /^[a-z0-9][a-z0-9_.-]{0,79}$/iu;
  const shapeOk = (list) => Array.isArray(list) && list.length >= 1 && list.length <= 20
    && list.every((a) => Object.keys(a).sort().join(',') === 'attackId,expected,observed'
      && ID_FORMAT.test(a.attackId) && a.expected.trim() && a.expected.length <= 300
      && a.observed.trim() && a.observed.length <= 300)
    && new Set(list.map((a) => a.attackId)).size === list.length;

  // 점검은 전역 fetch를 직접 쓰므로, 가짜 서버를 전역 fetch로 잠시 바꿔 실행합니다.
  const withServer = async (server) => {
    const original = globalThis.fetch;
    globalThis.fetch = server.impl;
    try { return await runAttackChecks(CONFIG); } finally { globalThis.fetch = original; }
  };

  check('점검 모듈에 import·node: 내장 모듈·require가 없음(격리 실행기에서도 불러올 수 있게)',
    !/^s*import[ (]/m.test(source) && !source.includes('node:') && !source.includes('require('));

  const okServer = fakeServer();
  const ok = await withServer(okServer);
  check('점검 목록이 묶음 형식(키 3개·길이·중복 없음·1~20개)을 지킴', shapeOk(ok));
  check('무인증 조회가 첫 번째, 타인 메모 조회가 두 번째(같은 제출본에 연속)',
    ok[0]?.attackId === 'anonymous_note_read' && ok[1]?.attackId === 'cross_owner_note_read');
  const sent = ok.filter((a) => a.observed !== 'not_run');
  check('보낸 점검은 observed가 실제 HTTP 상태로 시작하고 요청 ID(UUID)·확인 시각이 있음',
    sent.length > 0 && sent.every((a) => /^HTTP \d{3}/.test(a.observed) && /요청 ID [0-9a-f-]{36}/.test(a.observed) && /확인 시각 \d{4}-\d{2}-\d{2}T/.test(a.observed)));
  check('타인 메모 조회와 자료를 바꾸는 점검은 보내지 않아 observed가 정확히 not_run',
    ['cross_owner_note_read', 'cross_owner_list_mix', 'cross_owner_note_write'].every((id) => ok.find((a) => a.attackId === id)?.observed === 'not_run'));
  check('제출 묶음의 점검은 GET만 보냄(POST·PUT·DELETE 등 쓰기 요청 없음)',
    okServer.calls.filter((c) => c.attackId).every((c) => c.method === 'GET' || c.method === 'HEAD')
    && ['restore_without_login', 'restore_wrong_method', 'device_request_without_login'].every((id) => ok.find((x) => x.attackId === id)?.observed === 'not_run'));
  check('요청마다 X-Attack-Id 헤더에 공격 ID가 실려 감(점검과 요청을 짝지을 수 있음)',
    okServer.calls.filter((c) => c.attackId).length === sent.length && sent.every((a) => okServer.calls.some((c) => c.attackId === a.attackId)));
  check('보낸 요청은 읽기와 무인증 거부 확인뿐(로그인 헤더는 위조 토큰 하나)',
    okServer.calls.every((c) => !c.auth || c.auth === 'Bearer aaaaaaaaaa.bbbbbbbbbb.cccccccccc'));

  // 거부돼야 할 요청이 허용되면 observed에 실패와 실제 상태가 그대로 적힘
  const leaky = await withServer(fakeServer({ anonNotes200: true }));
  const leakedRow = leaky.find((a) => a.attackId === 'anonymous_notes_api')?.observed ?? '';
  check('거부돼야 할 요청이 허용되면 observed에 실제 HTTP 200과 실패가 적힘', /^HTTP 200/.test(leakedRow) && /기대와 다름\(실패\)/.test(leakedRow));

  // 네트워크가 끊기면 보낸 요청의 결과가 없으므로 전부 not_run
  const down = await withServer(fakeServer({ networkDown: true }));
  check('네트워크 끊김: 모든 점검이 not_run이고 결과를 만들지 않음', down.length > 0 && down.every((a) => a.observed === 'not_run') && shapeOk(down));

  // 전역 crypto가 없는 환경(구형 Node, 제한된 실행기): 심판 실행기에서 randomUUID 오류로 bundle이 멈췄던 상황
  const cryptoSlot = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
  let legacy;
  try { legacy = await withServer(fakeServer()); } finally {
    if (cryptoSlot) Object.defineProperty(globalThis, 'crypto', cryptoSlot); else delete globalThis.crypto;
  }
  const legacySent = legacy.filter((a) => a.observed !== 'not_run');
  const legacyIds = legacySent.map((a) => (a.observed.match(/요청 ID ([0-9a-f-]{36})/) ?? [])[1]);
  check('전역 crypto가 없는 환경에서도 점검이 멈추지 않고 같은 수의 요청을 보냄',
    shapeOk(legacy) && legacySent.length === sent.length && legacySent.length > 0);
  check('전역 crypto가 없어도 요청 ID가 UUID 모양이고 서로 다름',
    legacyIds.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id ?? ''))
    && new Set(legacyIds).size === legacyIds.length);

  check('점검 목록에 토큰·비밀번호·공개 키·이메일이 없음',
    ![TOKEN_A, TOKEN_B, PASS_A, PASS_B, 'sb_publishable_FAKEKEY', 'a@example.test', 'b@example.test'].some((t) => JSON.stringify([ok, leaky, down, legacy]).includes(t)));
}

check('설정의 원본 자료 API 주소와 공개 앱 주소가 비어 있지 않음', typeof aleph.originalApiUrl === 'string' && typeof aleph.publicAppUrl === 'string');
process.stdout.write('가짜 서버로 표 생성 절차를 실행한 로컬 확인이며, 배포 응답이나 심판 판정이 아닙니다.\n');
if (failed) process.exitCode = 1;
