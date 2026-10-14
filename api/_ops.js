// 12단계 탈환 작전실 요약(라우트 아님: _ 시작).
// 판정기 규칙·탐지 사건·회수 상태·복구 버전을 '서버가 이 응답을 만들면서 실제로 읽거나 실행한 값'으로 모읍니다.
// 값마다 출처 라벨을 붙입니다.
//   confirmed : 이 응답을 만들 때 서버가 실제로 읽거나 실행해 얻은 값(규칙 목록, 백업 검증, 서버 기록 건수)
//   virtual   : 가상 입력으로 판정기·탐지기를 실행한 결과(실제 접속 사건이 아님)
//   not_run   : 아직 연결·실행하지 않은 것(성공으로 표시하지 않음)
// 메모 본문·토큰·소유자 ID·내용 해시는 응답에 넣지 않습니다. 서버 기록은 식별값을 가려서만 돌려줍니다.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import aleph from '../aleph.config.json' with { type: 'json' };
import { decide, RULE_IDS } from '../src/decider.mjs';
import { detect } from '../src/detect.mjs';
import { verifyBackups } from './_backups.js';

export const SOURCE = Object.freeze({ CONFIRMED: 'confirmed', VIRTUAL: 'virtual', NOT_RUN: 'not_run' });

// 식별값을 가립니다: 앞 4자와 뒤 4자만 남깁니다. 짧거나 이상한 값은 전부 가립니다.
export function maskId(value) {
  if (typeof value !== 'string' || value.length < 12) return '****';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

// 판정기 가상 요청(engine 공개 입력 모양과 같음). 실제 접속 요청이 아니라 가상 입력입니다.
export function virtualRequest(overrides) {
  return {
    schema: 'aleph.decision.v1', requestId: randomUUID(), classId: 'class_fixture',
    projectId: 'project_fixture', subjectId: 'learner_fixture', deviceId: 'a'.repeat(16),
    service: 'notes', method: 'GET', path: '/notes/demo', route: 'GET /notes/:id',
    queryLength: 0, querySha256: '0'.repeat(64), at: new Date().toISOString(), policyRevision: 1,
    deviceRegistered: true, stepUp: { verified: false, authAgeSeconds: null }, recentEvents: [],
    signals: { source: 'judge_fixture', region: 'local', network: 'usual', hour: 14 },
    ...overrides,
  };
}

const DECIDER_CASES = [
  { name: '등록 기기의 단일 자료 조회', req: {}, expect: 'allow' },
  { name: '미등록 기기의 조회', req: { deviceRegistered: false }, expect: 'deny' },
  { name: '자료 목록(컬렉션) 조회', req: { route: 'GET /notes', path: '/notes' }, expect: 'deny' },
  { name: '공지 쓰기', req: { method: 'POST', route: 'POST /notices', path: '/notices' }, expect: 'deny' },
  { name: '복구 경로 POST', req: { method: 'POST', route: 'POST /restore', path: '/restore' }, expect: 'allow' },
  { name: '복구 경로 GET', req: { route: 'GET /restore', path: '/restore' }, expect: 'deny' },
  { name: '복합 이상 접속', expect: 'step_up', req: {
    signals: { source: 'judge_fixture', region: 'foreign', network: 'unusual', hour: 3 },
    recentEvents: [{ kind: 'risk_signal', ageSeconds: 60, count: 20 }] } },
];

// 판정기를 가상 요청으로 실제 실행합니다. 기대와 같은지(matched)를 함께 돌려줍니다.
async function runDeciderCases() {
  const cases = [];
  for (const c of DECIDER_CASES) {
    const response = await decide(virtualRequest(c.req));
    cases.push({
      name: c.name,
      expected: c.expect,
      decision: response.decision,
      reasonCode: response.reasonCode,
      matched: response.decision === c.expect,
    });
  }
  return cases;
}

// 탐지 가상 사건: 같은 가명 사용자의 GET을 2초 간격으로 만듭니다(실제 접속 사건이 아님).
function virtualReads(count, owner) {
  const start = Date.UTC(2026, 9, 1, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => ({
    at: new Date(start + i * 2000).toISOString(), method: 'GET', identity: { sub: owner },
  }));
}

const DETECT_CASES = [
  { name: '정상 조회', count: 30, owner: 'fixture_normal', expect: 'observe' },
  { name: '10분 안에 정확히 120건', count: 120, owner: 'fixture_edge', expect: 'observe' },
  { name: '10분 안에 121건', count: 121, owner: 'fixture_burst', expect: 'propose_revocation' },
];

function runDetectCases() {
  return DETECT_CASES.map((c) => {
    const events = virtualReads(c.count, c.owner);
    const result = detect(events);
    return {
      name: c.name,
      events: events.length,
      expected: c.expect,
      action: result.action,
      reasonCode: result.reasonCode ?? null,
      subject: result.subject ?? null, // 가상 가명 이름(실제 사용자 아님)
      matched: result.action === c.expect,
    };
  });
}

async function readJson(relPath) {
  return JSON.parse(await readFile(join(process.cwd(), relPath), 'utf8'));
}

// 복구 버전: 사본을 다시 읽어 무결성 장부와 대조한 결과(본문·해시는 담지 않음).
async function restoreSummary() {
  const verified = await verifyBackups();
  if (!verified.ok) {
    return { source: SOURCE.CONFIRMED, backupVerified: false, reason: verified.reason };
  }
  let policyVersion = null;
  try { policyVersion = (await readJson('backups/verified-policy.json')).version ?? null; } catch { /* 표시만 비움 */ }
  return {
    source: SOURCE.CONFIRMED,
    backupVerified: true,
    notesVersion: verified.version,
    policyVersion,
    verifiedFiles: verified.checked,
    targetCount: verified.notes.length,
  };
}

// 서버 기록(복구 감사)을 가려서 돌려줍니다. readAudit은 { ok, total, rows }를 돌려주는 함수입니다.
async function auditSummary(readAudit) {
  let result;
  try { result = await readAudit(); } catch { result = { ok: false }; }
  if (!result || result.ok !== true) {
    // 읽지 못한 값에는 '확인됨'을 붙이지 않습니다(건수도 만들지 않음).
    return { source: SOURCE.NOT_RUN, available: false, total: null, shown: 0, rows: [] };
  }
  const rows = (result.rows ?? []).map((row) => ({
    at: typeof row.at === 'string' ? row.at : null,
    action: typeof row.action === 'string' ? row.action : null,
    noteId: maskId(row.note_id),
  }));
  return { source: SOURCE.CONFIRMED, available: true, total: result.total, shown: rows.length, rows };
}

const NOT_RUN = [
  '반 엔진이 보낸 실제 접속 사건의 수신과 탐지',
  '회수 제안의 실제 집행(접속 차단·토큰 회수)',
  '1~9단계 정상·금지 요청의 배포 환경 재시험(README 표의 상태는 미실행)',
  '12단계 41종 공격 방어 판정(심판이 판정)',
];

// 요약 전체를 만듭니다. 수치(counts)는 아래 목록들에서 직접 센 값입니다.
export async function buildOpsSummary({ readAudit }) {
  const deciderCases = await runDeciderCases();
  const detectCases = runDetectCases();
  const proposals = detectCases.filter((c) => c.action === 'propose_revocation');
  const audit = await auditSummary(readAudit);
  const restore = await restoreSummary();

  return {
    schema: 'aleph.ops.summary.v1',
    step: aleph.step,
    generatedAt: new Date().toISOString(),
    legend: {
      confirmed: '이 응답을 만들면서 서버가 실제로 읽거나 실행해 얻은 값',
      virtual: '가상 입력으로 실행한 연습 결과(실제 접속 사건 아님)',
      not_run: '아직 연결·실행하지 않음(성공으로 표시하지 않음)',
    },
    rules: {
      source: SOURCE.CONFIRMED,
      ruleIds: [...RULE_IDS],
      allowedRoutes: [...(aleph.allowedRoutes ?? [])],
      restoreRoute: aleph.restoreRoute ?? null,
    },
    decider: {
      source: SOURCE.VIRTUAL,
      cases: deciderCases,
      counts: { total: deciderCases.length, matched: deciderCases.filter((c) => c.matched).length },
    },
    detect: {
      source: SOURCE.VIRTUAL,
      cases: detectCases,
      counts: {
        total: detectCases.length,
        events: detectCases.reduce((sum, c) => sum + c.events, 0),
        proposals: proposals.length,
        matched: detectCases.filter((c) => c.matched).length,
      },
    },
    revocation: {
      proposedSource: SOURCE.VIRTUAL,
      proposed: proposals.length, // 위 detect.cases에서 propose_revocation인 건수
      executedSource: SOURCE.NOT_RUN,
      executed: null, // 집행 경로가 연결되지 않아 값을 만들지 않습니다
    },
    restore,
    records: audit,
    notRun: [...NOT_RUN],
  };
}
