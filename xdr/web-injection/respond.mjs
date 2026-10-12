// 웹 주입 대응(연결) 모듈입니다.
// decide.mjs 의 판단 결과 가운데 '차단 후보(block)'만 골라
// ZTNA 판정기가 쓰는 '거부 규칙' 목록으로 넣고, 알림을 xdr/alerts.log 에 한 줄씩 쌓습니다.
//
// 역할 분리:
//  - decide.mjs 는 판단만 합니다(파일 쓰기·판정기 연결 없음). 여기서 건드리지 않습니다.
//  - src/decider.mjs 의 기존 규칙도 고치지 않습니다. 이 파일은 그 바깥의 '연결(bridge)'입니다.
//
// 거부 규칙은 출발 주소(srcip)를 기준으로 만듭니다. 판정기 요청 계약(aleph.decision.v1)에는
// 출발 IP 항목이 없으므로, 계약에 없는 필드를 지어내 요청에 끼우지 않습니다. 대신
// 웹 주입은 주소 단위로 막는 것이 맞으므로, 릴레이/엔진이 접근 앞단에서 쓰는
// 주소 거부 규칙으로 내보냅니다.
//
// 정상 사용자 보호: 규칙은 오직 block 후보에서만 만들어집니다. alert·record 는 규칙이 되지 않고,
// 정상 이벤트의 주소에는 거부 규칙을 넣지 않습니다.

import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decide } from './decide.mjs';

const MODULE_KEY = 'web-injection';
const LOG_PATH = new URL('../alerts.log', import.meta.url);
const FIXTURE_PATH = new URL('../fixtures/web-injection.json', import.meta.url);
const DEFAULT_TTL_SECONDS = 60 * 60; // 거부 규칙 기본 만료: 1시간

// 차단 후보(block)만 모아 주소별 거부 규칙으로 만듭니다.
// 규칙에는 만료 시각(expiresAt)과 근거 경보 번호(evidenceAlertIds)를 붙입니다.
export function planDenyRules(alerts, { now = new Date(), ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
  const decidedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
  const bySrc = new Map();

  for (const alert of Array.isArray(alerts) ? alerts : []) {
    const result = decide(alert);
    if (result.action !== 'block') continue; // 차단 후보만 규칙으로
    const srcip = alert?.data?.srcip;
    if (!srcip) continue; // 근거 주소가 없으면 규칙을 만들지 않음
    const id = alert?.id;

    if (!bySrc.has(srcip)) {
      bySrc.set(srcip, {
        ruleId: `${MODULE_KEY}.deny.${srcip}`,
        decision: 'deny',
        srcip,
        reason: result.reason,
        confidence: result.confidence,
        evidenceAlertIds: [],
        decidedAt,
        expiresAt,
      });
    }
    const rule = bySrc.get(srcip);
    if (id && !rule.evidenceAlertIds.includes(id)) rule.evidenceAlertIds.push(id);
    // 같은 주소의 여러 경보 중 가장 확신도 높은 근거를 대표로 남김
    if (result.confidence > rule.confidence) {
      rule.confidence = result.confidence;
      rule.reason = result.reason;
    }
  }

  return [...bySrc.values()];
}

// 알림을 xdr/alerts.log 에 한 줄씩 덧붙입니다(경보마다 한 줄).
export function logAlerts(alerts, { now = new Date(), logPath = LOG_PATH } = {}) {
  const lines = [];
  for (const alert of Array.isArray(alerts) ? alerts : []) {
    const r = decide(alert);
    const srcip = alert?.data?.srcip ?? '-';
    const id = alert?.id ?? '-';
    // 비밀값·payload는 남기지 않음: 주소·판정 결과만 기록(url/count는 기록하지 않음).
    lines.push(
      `${now.toISOString()} module=${MODULE_KEY} alert=${id} srcip=${srcip} action=${r.action} confidence=${r.confidence} reason="${r.reason}"`,
    );
  }
  if (lines.length) appendFileSync(logPath, lines.join('\n') + '\n');
  return lines;
}

// 주소가 지금(now) 유효한 거부 규칙에 걸려 있는지 확인합니다(만료된 규칙은 통과).
export function isBlocked(srcip, rules, now = new Date()) {
  const t = now.getTime();
  return (rules || []).find(
    (rule) => rule.srcip === srcip && rule.decision === 'deny' && new Date(rule.expiresAt).getTime() > t,
  ) || null;
}

// 연결 실행: 경보를 받아 로그를 쌓고 거부 규칙 목록을 돌려줍니다.
export function respond(alerts, opts = {}) {
  const now = opts.now ?? new Date();
  logAlerts(alerts, { ...opts, now });
  const rules = planDenyRules(alerts, { ...opts, now });
  return { rules, generatedAt: now.toISOString() };
}

// node 로 직접 실행하면: 시험 경보를 흘려 거부 규칙을 만들고,
// 각 주소를 요청처럼 다시 넣어 '명확한 공격만 막히고 정상은 통과'하는지 확인합니다.
function main() {
  const { alerts } = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  const now = new Date();
  const { rules } = respond(alerts, { now });

  console.log('=== 만들어진 거부 규칙 (block 후보만) ===');
  for (const rule of rules) {
    console.log(`${rule.ruleId} | 만료 ${rule.expiresAt} | 근거 경보 ${rule.evidenceAlertIds.join(',')} | ${rule.reason}`);
  }

  // 주소별로 공격 후보(block)인지, 정상(block 아님)인지 분류
  const blockSrc = new Set(rules.map((r) => r.srcip));
  const allSrc = [...new Set(alerts.map((a) => a?.data?.srcip).filter(Boolean))];

  console.log('\n=== 시험 요청 재주입 (주소별 통과/차단) ===');
  let wrongBlocked = 0;
  let missedAttack = 0;
  for (const srcip of allSrc) {
    const denied = !!isBlocked(srcip, rules, now);
    const isAttacker = blockSrc.has(srcip);
    const mark = denied ? '차단' : '통과';
    console.log(`${srcip} -> ${mark}${denied === isAttacker ? '' : '  <= 예상과 다름!'}`);
    if (denied && !isAttacker) wrongBlocked++; // 정상인데 막힘
    if (!denied && isAttacker) missedAttack++; // 공격인데 안 막힘
  }

  const ok = wrongBlocked === 0 && missedAttack === 0;
  console.log(
    `\n거부 규칙 ${rules.length}개 · 공격 주소 ${blockSrc.size}개 전부 차단, 정상 주소 오차단 ${wrongBlocked}개, 공격 누락 ${missedAttack}개 -> ${ok ? 'OK' : '실패'}`,
  );
  if (!ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
