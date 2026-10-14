// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
//
// 12단계: 제출 묶음의 점검은 재시험 표(scripts/retest-lib.mjs)의 '실행 기록'에서 만듭니다.
//   - 실제로 보낸 요청: 결과와 함께 요청 ID·서버 ID·확인 시각을 observed에 적습니다(통과가 아니면 '실패'로 적음).
//   - 보내지 않은 점검(계정 없음, 자료를 바꾸는 요청, 네트워크 오류): observed를 정확히 'not_run'으로 적습니다.
// 값을 만들어 채우지 않습니다. 이 점검은 학생의 자기 점검이며 심판의 판정이 아닙니다.
import { EVIDENCE, RESULT, runRetest } from '../scripts/retest-lib.mjs';

const LIMIT = 300; // scripts/bundle.mjs가 expected·observed에 허용하는 최대 길이
const cut = (text) => (text.length > LIMIT ? `${text.slice(0, LIMIT - 1)}…` : text);

// 무인증 조회와 타인 메모 조회를 앞에 두고, 나머지는 단계 순서를 따릅니다.
const FIRST = ['anonymous_note_read', 'cross_owner_note_read'];

// 재시험 표의 행에서 제출 점검을 만듭니다(순수 함수: 시험에서 가짜 표로도 실행).
export function attemptsFromReport(report) {
  const rows = report.rows.filter((row) => typeof row.attackId === 'string' && row.attackId);
  const rank = (row) => {
    const i = FIRST.indexOf(row.attackId);
    return i === -1 ? FIRST.length : i;
  };
  const ordered = [...rows].sort((a, b) => rank(a) - rank(b) || a.no - b.no);
  return ordered.map((row) => {
    const sent = row.evidence === EVIDENCE.LIVE; // 실제 HTTP 요청을 보낸 행만 결과를 적습니다
    const verdict = row.result === RESULT.PASS ? '기대와 같음' : '기대와 다름(실패)';
    return {
      attackId: row.attackId,
      expected: cut(`${row.request} → 기대 ${row.expected}`),
      observed: sent
        ? cut(`${row.actual} · ${verdict} · 요청 ID ${row.requestId} · 서버 ID ${row.serverId} · 확인 시각 ${row.at}`)
        : 'not_run',
    };
  });
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
  // 시험 계정은 실행하는 터미널의 환경변수로만 받습니다(없으면 계정이 필요한 점검은 not_run).
  const report = await runRetest({ base: config.publicAppUrl, env: process.env });
  return attemptsFromReport(report);
}
