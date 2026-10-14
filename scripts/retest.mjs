// 12단계 제작 2 실행기: 1~11단계 정상·금지 요청을 배포 주소로 실제로 보내 한 표로 남깁니다.
//   npm run retest                         → 계정 없이 가능한 행만 실측하고 나머지는 미실행으로 표시
//   npm run retest -- --base <주소>        → 측정할 배포 주소 지정(기본: aleph.config.json의 publicAppUrl)
//   npm run retest -- --out <파일.md>      → 표를 파일로도 저장(기본: artifacts/retest/latest.md)
// 시험 계정(선택): 실행하는 터미널에서만 환경변수로 넣습니다. 저장소·로그·표에는 남기지 않습니다.
//   RETEST_EMAIL_A, RETEST_PASSWORD_A, RETEST_EMAIL_B, RETEST_PASSWORD_B
// 자동으로 보내는 요청은 읽기와 '거부돼야 하는' 무인증 요청뿐입니다(자료를 바꾸는 요청은 보내지 않음).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { renderMarkdown, runRetest } from './retest-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
};

try {
  const base = arg('--base') ?? undefined;
  const report = await runRetest({ base, env: process.env });
  const markdown = renderMarkdown(report);

  const out = resolve(arg('--out') ?? resolve(root, 'artifacts', 'retest', 'latest.md'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, markdown, 'utf8');
  writeFileSync(out.replace(/\.md$/u, '') + '.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  process.stdout.write(`${markdown}\n표를 저장했습니다: ${out}\n`);
  if (report.counts.liveFail > 0 || report.counts.localFail > 0) {
    process.stderr.write(`기대와 다른 행이 있습니다: 실측 실패 ${report.counts.liveFail}건 · 로컬 가상 실행 실패 ${report.counts.localFail}건\n`);
    process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`재시험 표 첫 오류: ${error.message}\n`);
  process.exitCode = 1;
}
