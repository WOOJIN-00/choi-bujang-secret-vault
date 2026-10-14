// 12단계 탈환 작전실 요약 로컬 확인.
// 서버 요약(api/_ops.js)을 가짜 서버 기록으로 실제 실행해, 화면에 나갈 수치와 가린 기록이 서로 맞는지,
// 가상 메모 본문·소유자 ID·내용 해시·토큰이 응답에 없는지 확인합니다. 배포 응답이나 심판 판정이 아닙니다.
import { buildOpsSummary, maskId } from '../api/_ops.js';

let failed = 0;
const check = (name, ok) => {
  if (!ok) failed += 1;
  process.stdout.write(`${ok ? '통과' : '확인 필요'} · ${name}\n`);
};

// 가짜 서버 기록: 전체 25건 중 최근 3건만 읽었다고 가정합니다(실제 표가 아닙니다).
const FULL_IDS = [
  '58ff58af-110f-4f64-b829-594f4e048827',
  '76a51482-c2a1-4eed-bc06-ed57ebaa265e',
  'f1b97173-c1af-4012-b2e7-c402f45b9e16',
];
const rows = FULL_IDS.map((id, i) => ({ at: `2026-10-14T0${i}:00:00.000Z`, action: 'restore_one', note_id: id }));
const summary = await buildOpsSummary({ readAudit: async () => ({ ok: true, total: 25, rows }) });
const json = JSON.stringify(summary);

// 1) 수치와 목록이 서로 맞는지(화면이 다시 세는 것과 같은 계산)
check('판정기 일치 건수 = 목록에서 센 값',
  summary.decider.counts.matched === summary.decider.cases.filter((c) => c.matched).length
  && summary.decider.counts.total === summary.decider.cases.length);
check('탐지 사건 합계 = 사례별 건수의 합',
  summary.detect.counts.events === summary.detect.cases.reduce((s, c) => s + c.events, 0));
check('회수 제안 수 = 탐지 결과에서 propose_revocation인 건수 = 회수 상태의 제안 수',
  summary.detect.counts.proposals === summary.detect.cases.filter((c) => c.action === 'propose_revocation').length
  && summary.revocation.proposed === summary.detect.counts.proposals);
check('서버 기록 표시 건수 = 가려서 돌려준 행 수, 전체 건수 이상',
  summary.records.shown === summary.records.rows.length && summary.records.total >= summary.records.shown
  && summary.records.shown === rows.length && summary.records.total === 25);

// 2) 가림: 서버 기록의 식별값이 원래 값과 다르고, 가린 값이 서버 기록과 같은 행을 가리키는지
check('서버 기록의 메모 ID는 전체가 아닌 앞4·뒤4자만 남음',
  summary.records.rows.every((r, i) => r.noteId === maskId(FULL_IDS[i]) && r.noteId !== FULL_IDS[i]
    && !json.includes(FULL_IDS[i])));
check('가린 값과 서버 기록이 같은 순서·같은 시각으로 대응',
  summary.records.rows.every((r, i) => r.at === rows[i].at && r.action === rows[i].action));

// 3) 노출 금지: 본문·소유자·해시·토큰 모양
check('가상 메모 본문이 응답에 없음', !json.includes('실습용 가상 시험 메모'));
check('64자 16진수(내용 해시·키 모양)가 응답에 없음', !/[a-f0-9]{64}/i.test(json));
check('토큰·키 모양 값이 응답에 없음', !/eyJ[A-Za-z0-9_-]{12,}|sb_(publishable|secret)_|BEGIN [A-Z ]*PRIVATE/.test(json));
check('소유자·사용자 식별 필드(owner/actor/user)가 응답에 없음', !/owner|actor|user_id|userId/i.test(json));

// 4) 출처 라벨: 실제 확인과 가상 실행·미실행이 섞이지 않음
check('규칙·복구·서버 기록은 확인됨, 판정기·탐지는 가상 실행으로 표시',
  summary.rules.source === 'confirmed' && summary.restore.source === 'confirmed'
  && summary.records.source === 'confirmed'
  && summary.decider.source === 'virtual' && summary.detect.source === 'virtual');
check('회수 집행은 미실행이고 수치를 만들지 않음(null)',
  summary.revocation.executedSource === 'not_run' && summary.revocation.executed === null);
check('미실행 목록이 비어 있지 않음', Array.isArray(summary.notRun) && summary.notRun.length > 0);

// 5) 서버 기록을 읽지 못하면 건수를 지어내지 않음
const failedAudit = await buildOpsSummary({ readAudit: async () => ({ ok: false }) });
check('서버 기록을 못 읽으면 available=false·건수 없음(0으로 채우지 않음)·확인됨 라벨 없음',
  failedAudit.records.available === false && failedAudit.records.total === null && failedAudit.records.rows.length === 0
  && failedAudit.records.source === 'not_run');

// 6) 복구 버전: 저장소 사본을 실제로 다시 읽어 검증한 값
check('복구 사본 검증 결과와 버전이 들어 있음',
  summary.restore.backupVerified === true && typeof summary.restore.notesVersion === 'string'
  && summary.restore.verifiedFiles.length >= 2 && summary.restore.targetCount >= 1);

process.stdout.write(`판정기 ${summary.decider.counts.matched}/${summary.decider.counts.total} · 탐지 사건 ${summary.detect.counts.events}건 · 회수 제안 ${summary.revocation.proposed}건 · 서버 기록 ${summary.records.shown}/${summary.records.total}건\n`);
process.stdout.write('가짜 서버 기록으로 요약 모듈을 실행한 로컬 확인이며, 배포 응답이나 심판 판정이 아닙니다.\n');
if (failed) process.exitCode = 1;
