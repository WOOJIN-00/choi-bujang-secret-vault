// 12단계 제작 2: 1~11단계 정상·금지 요청을 실제로 보내고 한 표로 남기는 절차의 본체.
// 행마다 근거(evidence)를 구분합니다.
//   live_http     : 배포 주소로 실제 HTTP 요청을 보내 받은 응답(실측)
//   local_virtual : 판정기·탐지기 '함수'를 가상 입력으로 실행한 결과(실제 API 응답이 아님)
//   none          : 실행하지 않음(미실행). 통과로 세지 않습니다.
// 자료를 바꿀 수 있는 요청(남의 메모 수정·삭제, 복구 적용)은 자동 실행하지 않고 미실행으로 남깁니다.
// 시험 계정 자격은 환경변수로만 받고 저장·출력하지 않으며, 토큰은 메모리에서만 씁니다.
import { randomUUID } from 'node:crypto';
import aleph from '../aleph.config.json' with { type: 'json' };
import { decide } from '../src/decider.mjs';
import { detect } from '../src/detect.mjs';
import { virtualRequest } from '../api/_ops.js';

export const EVIDENCE = Object.freeze({ LIVE: 'live_http', LOCAL: 'local_virtual', NONE: 'none' });
export const RESULT = Object.freeze({ PASS: 'pass', FAIL: 'fail', NOT_RUN: 'not_run' });
const DASH = '—';

const brief = (res) => `${res.status}${res.json && typeof res.json.error === 'string' ? ` ${res.json.error}` : ''}`;

// 실제 HTTP 요청 한 건. 요청마다 새 요청 ID를 만들어 X-Request-Id로 보내고, 서버 쪽 ID(x-vercel-id)도 함께 기록합니다.
async function call(ctx, { method = 'GET', path, url, token, headers, body }) {
  const requestId = randomUUID();
  const at = ctx.now().toISOString();
  const target = url ?? new URL(path, ctx.base).href;
  try {
    const res = await ctx.fetch(target, {
      method,
      headers: { 'X-Request-Id': requestId, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body,
      signal: AbortSignal.timeout(15000),
      redirect: 'manual',
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* JSON이 아닌 응답 */ }
    return { ok: true, status: res.status, json, text, requestId, serverId: res.headers.get('x-vercel-id'), at };
  } catch (error) {
    return { ok: false, error: error?.name ?? 'Error', requestId, at };
  }
}

const addRow = (ctx, row) => { ctx.rows.push(row); return row; };

const notRunRow = (spec, reason) => ({
  step: spec.step, kind: spec.kind, request: spec.request, expected: spec.expected,
  actual: `미실행: ${reason}`, requestId: DASH, serverId: DASH, at: DASH,
  result: RESULT.NOT_RUN, evidence: EVIDENCE.NONE,
});

// 실측 한 행. skip이 있으면 보내지 않고 미실행으로 둡니다. 네트워크 오류도 '측정 못 함'이라 통과로 세지 않습니다.
async function live(ctx, spec) {
  if (spec.skip) { addRow(ctx, notRunRow(spec, spec.skip)); return null; }
  const res = await call(ctx, spec.req);
  if (!res.ok) { addRow(ctx, notRunRow(spec, `네트워크 오류(${res.error}) — 측정하지 못함`)); return null; }
  const verdict = spec.judge(res);
  addRow(ctx, {
    step: spec.step, kind: spec.kind, request: spec.request, expected: spec.expected,
    actual: verdict.actual, requestId: res.requestId, serverId: res.serverId ?? DASH, at: res.at,
    result: verdict.pass ? RESULT.PASS : RESULT.FAIL, evidence: EVIDENCE.LIVE,
  });
  return res;
}

// 로그인은 Supabase Auth 공개 엔드포인트로만 합니다. 토큰은 메모리에만 두고 어디에도 쓰지 않습니다.
async function login(ctx, label) {
  const email = ctx.env[`RETEST_EMAIL_${label}`];
  const password = ctx.env[`RETEST_PASSWORD_${label}`];
  if (!email || !password) { ctx.login[label] = '미설정'; return; }
  if (!ctx.config) { ctx.login[label] = '실패(공개 설정을 읽지 못함)'; return; }
  try {
    const res = await ctx.fetch(`${ctx.config.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ctx.config.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json && typeof json.access_token === 'string') {
      ctx.tokens[label] = json.access_token;
      ctx.login[label] = '성공';
    } else {
      ctx.login[label] = `실패(HTTP ${res.status})`;
    }
  } catch {
    ctx.login[label] = '실패(네트워크)';
  }
}

async function publicRows(ctx) {
  const FORGED = 'aaaaaaaaaa.bbbbbbbbbb.cccccccccc';
  await live(ctx, { step: 1, kind: 'normal', request: 'GET /', expected: '200 · 화면 HTML',
    req: { path: '/' }, judge: (r) => ({ pass: r.status === 200 && /<html/i.test(r.text), actual: `${r.status} · ${r.text.length}바이트` }) });
  await live(ctx, { step: 1, kind: 'forbidden', request: 'GET /data.json', expected: '200 · notes 비어 있음(메모 노출 없음)',
    req: { path: '/data.json' }, judge: (r) => {
      const empty = r.status === 200 && Array.isArray(r.json?.notes) && r.json.notes.length === 0;
      return { pass: empty, actual: `${r.status} · notes ${Array.isArray(r.json?.notes) ? r.json.notes.length : '?'}건` };
    } });
  await live(ctx, { step: 2, kind: 'forbidden', request: 'GET /api/notes (로그인 없음)', expected: '401',
    req: { path: '/api/notes' }, judge: (r) => ({ pass: r.status === 401, actual: brief(r) }) });
  await live(ctx, { step: 3, kind: 'forbidden', request: 'GET /api/notes (위조 토큰)', expected: '401',
    req: { path: '/api/notes', token: FORGED }, judge: (r) => ({ pass: r.status === 401, actual: brief(r) }) });
  const cfg = await live(ctx, { step: 3, kind: 'normal', request: 'GET /api/public-config', expected: '200 · 공개 설정 항목 있음(값은 표에 쓰지 않음)',
    req: { path: '/api/public-config' }, judge: (r) => {
      const has = typeof r.json?.url === 'string' && typeof r.json?.publishableKey === 'string';
      return { pass: r.status === 200 && has, actual: `${r.status} · 설정 항목 ${has ? '있음' : '없음'}` };
    } });
  if (cfg && typeof cfg.json?.url === 'string' && typeof cfg.json?.publishableKey === 'string') {
    ctx.config = { url: cfg.json.url, publishableKey: cfg.json.publishableKey };
  }
  await live(ctx, { step: 5, kind: 'forbidden', request: '원본 자료 API 직접 요청(공개 키만)', expected: '행이 오지 않음(401·403 거부 또는 빈 목록)',
    skip: ctx.config && aleph.originalApiUrl ? null : '공개 설정 또는 원본 API 주소를 얻지 못함',
    req: { url: `${aleph.originalApiUrl}?select=id&limit=1`, headers: { apikey: ctx.config?.publishableKey ?? '' } },
    judge: (r) => {
      const denied = r.status === 401 || r.status === 403;
      const emptyList = r.status === 200 && Array.isArray(r.json) && r.json.length === 0;
      const rows = Array.isArray(r.json) ? r.json.length : 0;
      return { pass: denied || emptyList, actual: `${r.status} · 받은 행 ${rows}건` };
    } });
  await live(ctx, { step: 10, kind: 'normal', request: 'GET /api/restore (공개 미리보기)', expected: '200 · backupVerified true',
    req: { path: '/api/restore' }, judge: (r) => ({ pass: r.status === 200 && r.json?.backupVerified === true, actual: `${brief(r)} · backupVerified ${r.json?.backupVerified}` }) });
  await live(ctx, { step: 10, kind: 'forbidden', request: 'POST /api/restore (로그인 없음)', expected: '401',
    req: { method: 'POST', path: '/api/restore', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    judge: (r) => ({ pass: r.status === 401, actual: brief(r) }) });
  await live(ctx, { step: 10, kind: 'forbidden', request: 'DELETE /api/restore', expected: '405',
    req: { method: 'DELETE', path: '/api/restore' }, judge: (r) => ({ pass: r.status === 405, actual: brief(r) }) });
  await live(ctx, { step: 11, kind: 'normal', request: 'GET /manifest.webmanifest', expected: '200 · 앱 이름과 standalone',
    req: { path: '/manifest.webmanifest' }, judge: (r) => {
      const ok = r.status === 200 && typeof r.json?.name === 'string' && r.json?.display === 'standalone';
      return { pass: ok, actual: `${r.status} · name ${r.json?.name ? '있음' : '없음'} · display ${r.json?.display ?? '?'}` };
    } });
  await live(ctx, { step: 11, kind: 'forbidden', request: 'GET /api/device (로그인 없음)', expected: '401',
    req: { path: '/api/device' }, judge: (r) => ({ pass: r.status === 401, actual: brief(r) }) });
  await live(ctx, { step: 11, kind: 'forbidden', request: 'POST /api/device (로그인 없음)', expected: '401',
    req: { method: 'POST', path: '/api/device', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    judge: (r) => ({ pass: r.status === 401, actual: brief(r) }) });
  await live(ctx, { step: 12, kind: 'normal', request: 'GET /api/ops', expected: '200 · 요약 형식(aleph.ops.summary.v1)',
    req: { path: '/api/ops' }, judge: (r) => ({ pass: r.status === 200 && r.json?.schema === 'aleph.ops.summary.v1', actual: `${brief(r)} · schema ${r.json?.schema ?? '없음'}` }) });
}

// 로그인한 계정 행. 승인 상태에 따라 기대가 달라지므로, 기대는 같은 계정의 /api/device 응답에서 계산합니다.
async function accountRows(ctx) {
  const tokenA = ctx.tokens.A;
  const tokenB = ctx.tokens.B;
  const needA = tokenA ? null : 'A 시험 계정 환경변수가 없거나 로그인에 실패함';
  const needB = tokenB ? null : 'B 시험 계정 환경변수가 없거나 로그인에 실패함';

  const listA = await live(ctx, { step: 2, kind: 'normal', request: 'A 로그인 GET /api/notes', expected: '200 · notes 배열',
    skip: needA, req: { path: '/api/notes', token: tokenA }, judge: (r) => {
      const ok = r.status === 200 && Array.isArray(r.json?.notes);
      return { pass: ok, actual: `${brief(r)} · notes ${Array.isArray(r.json?.notes) ? r.json.notes.length : '?'}건 · deviceApproved ${r.json?.deviceApproved}` };
    } });
  const idsA = Array.isArray(listA?.json?.notes) ? listA.json.notes.map((n) => n.id).filter(Boolean) : [];

  for (const [label, token, skip] of [['A', tokenA, needA], ['B', tokenB, needB]]) {
    const dev = await live(ctx, { step: 11, kind: 'normal', request: `${label} 로그인 GET /api/device`, expected: '200 · approved 값',
      skip, req: { path: '/api/device', token }, judge: (r) => ({ pass: r.status === 200 && typeof r.json?.approved === 'boolean', actual: `${brief(r)} · approved ${r.json?.approved}` }) });
    const approved = dev?.json?.approved;
    if (skip || typeof approved !== 'boolean') {
      addRow(ctx, notRunRow({ step: 11, kind: 'forbidden', request: `${label} GET /api/notes (승인 상태에 따른 결과)`, expected: '승인 상태에 따라 계산' },
        skip ?? `${label}의 승인 상태를 얻지 못함`));
      continue;
    }
    await live(ctx, {
      step: 11, kind: approved ? 'normal' : 'forbidden',
      request: `${label} GET /api/notes (${approved ? '승인된 기기' : '미승인 기기'})`,
      expected: approved ? '200 · deviceApproved true' : '200 · notes 0건 · deviceApproved false',
      req: { path: '/api/notes', token },
      judge: (r) => {
        const list = Array.isArray(r.json?.notes) ? r.json.notes : null;
        const pass = approved
          ? r.status === 200 && r.json?.deviceApproved === true
          : r.status === 200 && list !== null && list.length === 0 && r.json?.deviceApproved === false;
        return { pass, actual: `${brief(r)} · notes ${list ? list.length : '?'}건 · deviceApproved ${r.json?.deviceApproved}` };
      },
    });
  }

  const idA = idsA[0];
  await live(ctx, { step: 4, kind: 'normal', request: 'A가 자기 메모 GET /api/notes/:id', expected: '200 · 같은 메모',
    skip: needA ?? (idA ? null : 'A의 승인 상태가 아니거나 메모가 없어 자기 메모 ID를 얻지 못함'),
    req: { path: `/api/notes/${idA}`, token: tokenA },
    judge: (r) => ({ pass: r.status === 200 && r.json?.id === idA, actual: `${brief(r)} · id 일치 ${r.json?.id === idA}` }) });
  await live(ctx, { step: 4, kind: 'forbidden', request: 'B가 A의 메모 GET /api/notes/:id', expected: '404(존재도 숨김)',
    skip: needB ?? (idA ? null : 'A의 메모 ID를 얻지 못함'),
    req: { path: `/api/notes/${idA}`, token: tokenB },
    judge: (r) => ({ pass: r.status === 404, actual: brief(r) }) });
  await live(ctx, { step: 4, kind: 'forbidden', request: 'B의 GET /api/notes 목록에 A의 메모가 섞였는지', expected: '200 · A의 메모 ID 0건',
    skip: needB ?? (idsA.length ? null : 'A의 메모 ID를 얻지 못해 섞임을 확인할 수 없음'),
    req: { path: '/api/notes', token: tokenB },
    judge: (r) => {
      const ids = Array.isArray(r.json?.notes) ? r.json.notes.map((n) => n.id) : null;
      const leaked = ids ? ids.filter((id) => idsA.includes(id)).length : null;
      return { pass: r.status === 200 && leaked === 0, actual: `${brief(r)} · 섞인 A의 메모 ${leaked ?? '?'}건` };
    } });
}

// 판정기·탐지기 '함수'를 가상 입력으로 실행합니다. 실제 API 응답이 아니므로 근거를 local_virtual로 구분합니다.
async function localRows(ctx) {
  const at = ctx.now().toISOString();
  const decision = async (step, kind, request, expected, expectDecision, expectReason, overrides) => {
    const req = virtualRequest(overrides);
    const res = await decide(req);
    const pass = res.decision === expectDecision && (!expectReason || res.reasonCode === expectReason);
    addRow(ctx, { step, kind, request, expected, actual: `${res.decision} / ${res.reasonCode}`,
      requestId: res.requestId, serverId: DASH, at, result: pass ? RESULT.PASS : RESULT.FAIL, evidence: EVIDENCE.LOCAL });
  };
  await decision(6, 'normal', '판정기 · 등록 기기 GET /notes/:id', 'allow', 'allow', null, {});
  await decision(6, 'forbidden', '판정기 · 미등록 기기', 'deny / device_not_registered', 'deny', 'device_not_registered', { deviceRegistered: false });
  const unusual = { signals: { source: 'judge_fixture', region: 'foreign', network: 'unusual', hour: 3 },
    recentEvents: [{ kind: 'risk_signal', ageSeconds: 60, count: 20 }] };
  await decision(7, 'forbidden', '판정기 · 복합 이상 접속(시각+네트워크+폭주)', 'step_up', 'step_up', 'step_up_required', unusual);
  await decision(7, 'normal', '판정기 · 다시 확인한 복합 이상 접속', 'allow', 'allow', null, { ...unusual, stepUp: { verified: true, authAgeSeconds: 60 } });
  await decision(8, 'normal', '판정기 · GET /notes/:id', 'allow', 'allow', null, {});
  await decision(8, 'forbidden', '판정기 · GET /notes (컬렉션)', 'deny / route_not_allowed', 'deny', 'route_not_allowed', { route: 'GET /notes', path: '/notes' });
  await decision(8, 'forbidden', '판정기 · POST /notices (공지 쓰기)', 'deny / route_not_allowed', 'deny', 'route_not_allowed', { method: 'POST', route: 'POST /notices', path: '/notices' });
  await decision(10, 'normal', '판정기 · POST /restore', 'allow', 'allow', null, { method: 'POST', route: 'POST /restore', path: '/restore' });
  await decision(10, 'forbidden', '판정기 · GET /restore', 'deny / route_not_allowed', 'deny', 'route_not_allowed', { route: 'GET /restore', path: '/restore' });

  const reads = (count, owner) => Array.from({ length: count }, (_, i) => ({
    at: new Date(Date.UTC(2026, 9, 1) + i * 2000).toISOString(), method: 'GET', identity: { sub: owner } }));
  const detectRow = (kind, count, expectAction) => {
    const res = detect(reads(count, 'fixture_retest'));
    addRow(ctx, { step: 9, kind, request: `탐지기 · 같은 가명 사용자의 GET ${count}건(10분 안)`, expected: expectAction,
      actual: res.action, requestId: DASH, serverId: DASH, at, result: res.action === expectAction ? RESULT.PASS : RESULT.FAIL, evidence: EVIDENCE.LOCAL });
  };
  detectRow('normal', 30, 'observe');
  detectRow('forbidden', 121, 'propose_revocation');
}

// 자동으로 실행하지 않는 것은 사유와 함께 미실행으로 남깁니다.
function notRunFixedRows(ctx) {
  const fixed = [
    { step: 4, kind: 'forbidden', request: 'B가 A의 메모 PUT·DELETE', expected: '404',
      reason: '거부되지 않으면 실제로 자료가 바뀌는 요청이라 자동 실행하지 않음' },
    { step: 10, kind: 'normal', request: 'POST /api/restore 복구 적용', expected: '200 · 한 건만 복구',
      reason: '자료를 바꾸는 요청이라 자동 실행하지 않음(직접 확인 절차는 README)' },
    { step: 12, kind: 'forbidden', request: '12단계 41종 공격 방어', expected: '심판이 판정',
      reason: '심판이 판정하는 시험이며 이 표의 행은 41종이 아님(통과로 세지 않음)' },
  ];
  for (const spec of fixed) addRow(ctx, notRunRow(spec, spec.reason));
}

export async function runRetest({ base, fetchImpl = globalThis.fetch, env = {}, now = () => new Date() } = {}) {
  const ctx = {
    base: base ?? aleph.publicAppUrl, fetch: fetchImpl, env, now,
    rows: [], config: null, tokens: {}, login: { A: '미설정', B: '미설정' },
  };
  const startedAt = ctx.now().toISOString();
  const meta = await call(ctx, { path: '/aleph.json' });
  const deployedCommit = meta.ok && typeof meta.json?.commit === 'string' ? meta.json.commit : null;

  await publicRows(ctx);
  await login(ctx, 'A');
  await login(ctx, 'B');
  await accountRows(ctx);
  await localRows(ctx);
  notRunFixedRows(ctx);

  const rows = ctx.rows.map((row, index) => ({ no: index + 1, ...row }));
  const liveMeasured = rows.filter((r) => r.evidence === EVIDENCE.LIVE);
  const count = (list, result) => list.filter((r) => r.result === result).length;
  const report = {
    schema: 'aleph.retest.table.v1',
    base: ctx.base, deployedCommit, startedAt, finishedAt: ctx.now().toISOString(),
    accounts: { A: ctx.login.A, B: ctx.login.B },
    rows,
    counts: {
      total: rows.length,
      livePass: count(liveMeasured, RESULT.PASS),
      liveFail: count(liveMeasured, RESULT.FAIL),
      localPass: count(rows.filter((r) => r.evidence === EVIDENCE.LOCAL), RESULT.PASS),
      localFail: count(rows.filter((r) => r.evidence === EVIDENCE.LOCAL), RESULT.FAIL),
      notRun: count(rows, RESULT.NOT_RUN),
      liveNormalMeasured: liveMeasured.filter((r) => r.kind === 'normal').length,
      liveForbiddenMeasured: liveMeasured.filter((r) => r.kind === 'forbidden').length,
    },
  };
  return report;
}

const cell = (value) => String(value ?? DASH).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const EVIDENCE_LABEL = { live_http: '실측(배포 HTTP)', local_virtual: '로컬 가상 실행', none: '미실행' };
const RESULT_LABEL = { pass: '통과', fail: '실패', not_run: '미실행' };
const KIND_LABEL = { normal: '정상', forbidden: '금지' };

export function renderMarkdown(report) {
  const c = report.counts;
  const lines = [
    '# 1~11단계 정상·금지 요청 재시험 표',
    '',
    `- 측정 대상: ${report.base}`,
    `- 배포 커밋: ${report.deployedCommit ?? '확인 못 함'}`,
    `- 측정 시각: ${report.startedAt} ~ ${report.finishedAt}`,
    `- 시험 계정: A ${report.accounts.A} · B ${report.accounts.B} (토큰·비밀번호는 기록하지 않음)`,
    `- 실측(배포 HTTP) 통과 ${c.livePass} · 실패 ${c.liveFail} / 로컬 가상 실행 통과 ${c.localPass} · 실패 ${c.localFail} / 미실행 ${c.notRun} / 전체 ${c.total}행`,
    `- 실측으로 남은 정상 요청 ${c.liveNormalMeasured}건 · 금지 요청 ${c.liveForbiddenMeasured}건`,
  ];
  if (c.liveNormalMeasured === 0 || c.liveForbiddenMeasured === 0) {
    lines.push('- **주의: 정상 요청 또는 금지 요청의 실측 결과가 0건입니다. 이 표만으로는 허용·거부를 모두 확인했다고 말할 수 없습니다.**');
  }
  lines.push(
    '- **12단계 41종 공격 방어: 미실행.** 심판이 판정하는 시험이며, 이 표의 행은 41종이 아니고 41종을 통과 처리하는 근거로 쓰지 않습니다.',
    '- 요청 ID는 이 절차가 요청마다 만들어 `X-Request-Id`로 보낸 값이고, 서버 ID는 응답의 `x-vercel-id`입니다(Vercel 로그에서 찾는 값).',
    '- 로컬 가상 실행 행은 판정기·탐지기 함수를 가상 입력으로 실행한 결과이며 실제 API 응답이 아닙니다.',
    '',
    '| # | 단계 | 구분 | 요청 | 기대 결과 | 실제 결과 | 요청 ID | 서버 ID | 확인 시각 | 판정 | 근거 |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  );
  for (const r of report.rows) {
    lines.push(`| ${r.no} | ${r.step} | ${KIND_LABEL[r.kind]} | ${cell(r.request)} | ${cell(r.expected)} | ${cell(r.actual)} | ${cell(r.requestId)} | ${cell(r.serverId)} | ${cell(r.at)} | ${RESULT_LABEL[r.result]} | ${EVIDENCE_LABEL[r.evidence]} |`);
  }
  lines.push('');
  return lines.join('\n');
}
