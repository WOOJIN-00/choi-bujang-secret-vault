// 웹 주입 경보 확인용 읽기 모듈입니다.
// xdr/fixtures/web-injection.json 의 Wazuh 경보에서 다섯 가지만 뽑습니다:
//   시각(timestamp) · 출발 주소(srcip) · 계정(srcuser) · 규칙 수준(rule.level) · 설명(rule.description)
// 원본 경보 파일은 읽기만 하고 고치지 않습니다.
// data 안의 다른 값(url, count 등 주입 payload처럼 보일 수 있는 값)은 절대 뽑지 않습니다.
// 이 모듈은 확인용이라 src/decider.mjs(판정기)와 decide.mjs가 불러오지 않도록 따로 둡니다.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DEFAULT_FIXTURE = new URL('../fixtures/web-injection.json', import.meta.url);

// 경보 한 건에서 '안전한 다섯 필드'만 골라 담습니다.
// 여기 적힌 키 외에는 어떤 값도 결과에 넣지 않으므로 비밀값·payload처럼 보이는 값은 출력에서 빠집니다.
// 계정(srcuser)이 없는 경보는 null 로 둡니다.
function pickSafeFields(alert) {
  return {
    time: alert?.timestamp ?? null,
    srcip: alert?.data?.srcip ?? null,
    user: alert?.data?.srcuser ?? null,
    level: alert?.rule?.level ?? null,
    description: alert?.rule?.description ?? null,
  };
}

// 경보 묶음을 읽어 다섯 필드만 뽑은 줄 목록을 돌려줍니다. (원본은 그대로 둡니다.)
export async function readWebInjectionAlerts(fixtureUrl = DEFAULT_FIXTURE) {
  const raw = await readFile(fixtureUrl, 'utf8');
  const parsed = JSON.parse(raw);
  const alerts = Array.isArray(parsed?.alerts) ? parsed.alerts : [];
  return alerts.map(pickSafeFields);
}

// node 로 직접 실행하면 뽑은 줄과 '경보 건수 = 줄 수' 확인 결과를 보여 줍니다.
async function main() {
  const raw = await readFile(DEFAULT_FIXTURE, 'utf8');
  const alertCount = (JSON.parse(raw)?.alerts ?? []).length;
  const rows = await readWebInjectionAlerts();

  for (const r of rows) {
    console.log(`${r.time} | ${r.srcip} | ${r.user ?? '-'} | level ${r.level} | ${r.description}`);
  }

  const ok = alertCount === rows.length;
  console.log(`\n경보 건수 ${alertCount} / 뽑은 줄 수 ${rows.length} → ${ok ? '일치 OK' : '불일치'}`);
  if (!ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
