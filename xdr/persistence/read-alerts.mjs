// 몰래 심어진 프로그램(서비스·예약 작업 등 지속성, T1543·T1053) 경보 확인용 읽기 모듈입니다.
// xdr/fixtures/persistence.json 의 Wazuh 경보에서 다섯 가지만 뽑습니다:
//   시각(timestamp) · 출발 주소(srcip) · 계정(srcuser) · 규칙 수준(rule.level) · 설명(rule.description)
// 원본 경보 파일은 읽기만 하고 고치지 않습니다.
// data 안의 다른 값(path 같은 파일 경로, count 등)은 절대 뽑지 않습니다.
// 설명에 파일 경로·주소·토큰처럼 보이는 값이 섞여 있으면 [가림]으로 바꿔 출력합니다.
// 이 모듈은 확인용이라 decide.mjs(와 src/decider.mjs)가 불러오지 않도록 따로 둡니다.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DEFAULT_FIXTURE = new URL('../fixtures/persistence.json', import.meta.url);

// 비밀값·경로처럼 보이는 조각: Windows·유닉스 파일 경로, ${...} 표기, 주소(://), 긴 영숫자 열, Bearer/JWT 모양
const SECRET_LIKE = /[A-Za-z]:[\\/][^\s]+|(?<![\w.])\/(?:[\w.-]+\/)+[\w.-]+|\$\{[^}]*\}?|[a-z][a-z0-9+.-]*:\/\/\S*|\bBearer\s+\S+|\beyJ[\w-]{8,}\.[\w-]+\.[\w-]+|\b[A-Za-z0-9_-]{32,}\b/giu;
const mask = (text) => (typeof text === 'string' ? text.replace(SECRET_LIKE, '[가림]') : null);

// 경보 한 건에서 '안전한 다섯 필드'만 골라 담습니다. 계정(srcuser)이 없는 경보는 null 입니다.
function pickSafeFields(alert) {
  return {
    time: alert?.timestamp ?? null,
    srcip: alert?.data?.srcip ?? null,
    user: alert?.data?.srcuser ?? null,
    level: alert?.rule?.level ?? null,
    description: mask(alert?.rule?.description),
  };
}

// 경보 묶음을 읽어 다섯 필드만 뽑은 줄 목록을 돌려줍니다. (원본은 그대로 둡니다.)
export async function readPersistenceAlerts(fixtureUrl = DEFAULT_FIXTURE) {
  const raw = await readFile(fixtureUrl, 'utf8');
  const parsed = JSON.parse(raw);
  const alerts = Array.isArray(parsed?.alerts) ? parsed.alerts : [];
  return alerts.map(pickSafeFields);
}

// node 로 직접 실행하면 뽑은 줄과 '경보 건수 = 줄 수' 확인 결과를 보여 줍니다.
async function main() {
  const raw = await readFile(DEFAULT_FIXTURE, 'utf8');
  const alertCount = (JSON.parse(raw)?.alerts ?? []).length;
  const rows = await readPersistenceAlerts();

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
